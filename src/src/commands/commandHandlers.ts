/**
 * Command handlers for MetaFlow extension.
 *
 * Wires overlay engine + synchronization engine into VS Code commands.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { createHash } from 'crypto';
import type { ApplyResult } from '@metaflow/engine';
import {
    loadConfig,
    MetaFlowConfig,
    InjectionConfig,
    SettingsInjectionTarget,
    resolveLayers,
    detectSurfacedFileConflicts,
    formatSurfacedFileConflictMessage,
    loadCapabilityManifestForLayer,
    loadRepoManifestForRoot,
    discoverLayersInRepo,
    buildEffectiveFileMap,
    resolvePathFromWorkspace,
    applyFilters,
    applyExcludedTypeFilters,
    applyProfile,
    classifyFiles,
    EffectiveFile,
    ExcludableArtifactType,
    apply,
    clean,
    preview,
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    checkAllDrift,
    loadManagedState,
    toAuthoredConfig,
} from '@metaflow/engine';
import { publishConfigDiagnostics, clearDiagnostics } from '../diagnostics/configDiagnostics';
import { logInfo, logWarn, logError, showOutputChannel } from '../views/outputChannel';
import { updateStatusBar } from '../views/statusBar';
import { initConfig, resolveSourceSelection, InitSourceMode } from './initConfig';
import { detectMetaflowGitIgnoreMode, ensureMetaflowGitIgnoreEntry } from './initConfigHelpers';
import { pickWorkspaceFolder } from './workspaceSelection';
import { formatCapabilityWarningMessage } from './capabilityWarnings';
import {
    isInjectionMode,
    deriveRepoId,
    ensureMultiRepoConfig,
    DEFAULT_PROFILE_ID,
    addProfileToConfig,
    deleteProfileFromConfig,
    extractLayerIndex,
    extractLayerCheckedState,
    extractLayerPath,
    extractProfileId,
    extractRepoId,
    extractRepoScopeOptions,
    extractRefreshCommandOptions,
    extractApplyCommandOptions,
    getProfileDisplayName,
    readManagedViewsState,
    normalizeFilesViewMode,
    normalizeLayersViewMode,
    normalizeAiMetadataAutoApplyMode,
    projectConfigForProfile,
    type FilesViewMode,
    type LayersViewMode,
    type AiMetadataAutoApplyMode,
    normalizeAndDeduplicateLayerPaths,
    pruneStaleLayerSources,
    updateProfileLayerOverride,
    writeManagedViewsState,
} from './commandHelpers';
import { ensureMetaFlowAiMetadataCache, scaffoldMetaFlowAiMetadata } from './starterMetadata';
import {
    checkRepoSyncStatus,
    pullRepositoryFastForward,
    RepoSyncStatus,
    runGitCommand,
} from './repoSyncStatus';
import { loadCapabilityDetailModel, resolveCapabilityDetailTarget } from './capabilityDetails';
import {
    BUILT_IN_CAPABILITY_REPO_ID,
    BUILT_IN_CAPABILITY_STATE_KEY,
    BuiltInCapabilityRuntimeState,
    BuiltInCapabilityWorkspaceState,
    isBuiltInCapabilityActive,
    readBuiltInCapabilityRuntimeState,
    resolveBuiltInCapabilityDisplayName,
    sanitizeSynchronizedFiles,
} from '../builtInCapability';
import { CapabilityDetailsPanelManager } from '../views/capabilityDetailsPanel';
import {
    mergeSettingsValue,
    pruneBundledMetaFlowSettingsEntries,
    removeSettingsEntries,
    resolveTarget,
} from './settingsTargetHelpers';
import { resolveRepoDisplayLabel } from '../repoDisplayLabel';
import { buildTreeSummaryCache, TreeSummaryCache } from '../treeSummary';

const INJECTION_KEYS = ['instructions', 'prompts', 'skills', 'agents', 'hooks'] as const;
type InjectionKey = (typeof INJECTION_KEYS)[number];

const DEFAULT_INJECTION_MODE: Record<InjectionKey, 'settings' | 'synchronize'> = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
};

const INJECTION_OVERRIDE_SETTING_KEY = 'metaflow.injection.modes';
const SETTINGS_INJECTION_STATE_KEY = 'metaflow.settingsInjection.v1';
const AI_METADATA_AUTO_APPLY_MODE_SETTING_KEY = 'aiMetadataAutoApplyMode';
const BUILT_IN_CAPABILITY_LAYER_PATH = '.github';
const ENABLE_METAFLOW_AI_METADATA_ACTION = 'Enable Now';
const NOT_NOW_ACTION = 'Not Now';

const LEGACY_INJECTION_SETTING_KEYS: Record<InjectionKey, string> = {
    instructions: 'metaflow.injection.instructionsMode',
    prompts: 'metaflow.injection.promptsMode',
    skills: 'metaflow.injection.skillsMode',
    agents: 'metaflow.injection.agentsMode',
    hooks: 'metaflow.injection.hooksMode',
};

function formatInjectionModesSummary(config: MetaFlowConfig | undefined): string {
    return INJECTION_KEYS.map(
        (key) => `${key}=${config?.injection?.[key] ?? DEFAULT_INJECTION_MODE[key]}`,
    ).join(', ');
}

function formatManagedSettingsStateSummary(context: vscode.ExtensionContext): {
    target: string;
    keys: string;
} {
    const state = readManagedSettingsState(context);
    const effectiveTarget = state.effectiveTarget ?? 'none';
    const managedKeys = state.effectiveTarget
        ? Object.keys(state.managedEntries?.[state.effectiveTarget] ?? {})
        : [];

    return {
        target: effectiveTarget,
        keys: managedKeys.length > 0 ? managedKeys.join(', ') : 'none',
    };
}

// ── Settings injection target helpers ──────────────────────────────

/** Maps MetaFlow target names to VS Code ConfigurationTarget values. */
const TARGET_TO_CONFIGURATION_TARGET: Record<SettingsInjectionTarget, vscode.ConfigurationTarget> =
    {
        user: vscode.ConfigurationTarget.Global,
        workspace: vscode.ConfigurationTarget.Workspace,
        workspaceFolder: vscode.ConfigurationTarget.WorkspaceFolder,
    };

interface ResolvedInjectionTarget {
    requested: SettingsInjectionTarget;
    effective: SettingsInjectionTarget;
    configurationTarget: vscode.ConfigurationTarget;
}

/**
 * Resolve the settings injection target from local override → config default → fallback.
 * In single-folder workspaces, `workspaceFolder` is downgraded to `workspace`.
 */
function resolveSettingsInjectionTarget(
    workspace: vscode.WorkspaceFolder,
    config: MetaFlowConfig,
): ResolvedInjectionTarget {
    const wsConfig = vscode.workspace.getConfiguration('metaflow', workspace.uri);
    const localOverride = wsConfig.get<unknown>('injection.target', undefined);

    const folders = vscode.workspace.workspaceFolders;
    const { requested, effective } = resolveTarget(
        localOverride,
        config.settingsInjectionTarget,
        folders?.length ?? 1,
    );

    if (requested !== effective) {
        logInfo(
            `Settings injection target: requested ${requested}, effective ${effective} (single-folder workspace).`,
        );
    } else {
        logInfo(`Settings injection target: ${effective}.`);
    }

    return {
        requested,
        effective,
        configurationTarget: TARGET_TO_CONFIGURATION_TARGET[effective],
    };
}

/** Per-scope managed entries that MetaFlow has written. */
interface ManagedSettingsState {
    /** Target requested by the user/config at the time of last injection. */
    requestedTarget?: SettingsInjectionTarget;
    /** Effective target after single-folder downgrade. */
    effectiveTarget?: SettingsInjectionTarget;
    /**
     * Keys and their MetaFlow-managed values per scope, keyed by scope name
     * ('user' | 'workspace' | 'workspaceFolder').
     */
    managedEntries?: Record<string, Record<string, unknown>>;
}

function getWorkspace(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('MetaFlow: No workspace folder open.');
        return undefined;
    }

    const activeUri = vscode.window.activeTextEditor?.document?.uri;
    const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;

    return pickWorkspaceFolder(folders, activeFolder, (folder) =>
        fs.existsSync(path.join(folder.uri.fsPath, '.metaflow', 'config.jsonc')),
    );
}

function readManagedSettingsState(context: vscode.ExtensionContext): ManagedSettingsState {
    const raw = context.workspaceState.get<unknown>(SETTINGS_INJECTION_STATE_KEY);
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    return raw as ManagedSettingsState;
}

async function writeManagedSettingsState(
    context: vscode.ExtensionContext,
    state: ManagedSettingsState,
): Promise<void> {
    await context.workspaceState.update(SETTINGS_INJECTION_STATE_KEY, state);
}

/** Cached state for the current workspace. */
export interface ExtensionState {
    config?: MetaFlowConfig;
    configPath?: string;
    /** True while a refresh is actively resolving configuration for the workspace. */
    isLoading: boolean;
    /** True while an apply operation is actively writing overlay outputs. */
    isApplying: boolean;
    /** Internal config writes temporarily suppress watcher-triggered refreshes. */
    suppressConfigWatcherUntil: number;
    /** Effective overlay output before applying the active profile filter. */
    baseProfileFiles: EffectiveFile[];
    effectiveFiles: EffectiveFile[];
    capabilityByLayer: Record<
        string,
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
        }
    >;
    repoMetadataById: Record<
        string,
        {
            name?: string;
            description?: string;
        }
    >;
    capabilityWarnings: string[];
    repoSyncByRepoId: Record<string, RepoSyncStatus>;
    builtInCapability: BuiltInCapabilityRuntimeState;
    treeSummaryCache?: TreeSummaryCache;
    activeProfile?: string;
    /** Event emitter to notify TreeViews of changes. */
    onDidChange: vscode.EventEmitter<void>;
}

/**
 * Create a fresh state with an event emitter.
 */
export function createState(): ExtensionState {
    return {
        isLoading: true,
        isApplying: false,
        suppressConfigWatcherUntil: 0,
        baseProfileFiles: [],
        effectiveFiles: [],
        capabilityByLayer: {},
        repoMetadataById: {},
        capabilityWarnings: [],
        repoSyncByRepoId: {},
        builtInCapability: {
            enabled: false,
            layerEnabled: true,
            synchronizedFiles: [],
            sourceRoot: undefined,
            sourceId: 'unknown.extension',
            sourceDisplayName: 'unknown.extension',
        },
        treeSummaryCache: undefined,
        onDidChange: new vscode.EventEmitter<void>(),
    };
}

function getExtensionDisplayName(context: vscode.ExtensionContext): string | undefined {
    const displayName = (context.extension.packageJSON as { displayName?: unknown }).displayName;
    return typeof displayName === 'string' ? displayName : undefined;
}

function normalizeCommandLayerPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized || normalized === '(root)') {
        return '.';
    }
    return normalized;
}

interface ResolvedRepoSource {
    repoId: string;
    label: string;
    localPath: string;
    repoUrl?: string;
}

interface UntrackedLocalRepoSource {
    repoId: string;
    label: string;
    localPath: string;
}

interface GitRemoteInfo {
    name: string;
    url: string;
}

type GitRemotePromotionSuppressionState = Record<string, string>;

const GIT_REMOTE_PROMOTION_SUPPRESSIONS_STATE_KEY = 'metaflow.gitRemotePromotionSuppressions.v1';
const METAFLOW_GITIGNORE_PROMPT_SUPPRESSIONS_STATE_KEY = 'metaflow.gitignorePromptSuppressions.v1';

type CheckRepoUpdatesOutcome =
    | { executed: true }
    | { executed: false; reason: 'no-config' | 'no-git-repos' | 'repo-not-found' | 'no-targets' };

type InjectionEditMode = 'settings' | 'synchronize' | 'inherit';
type InjectionPreset = 'all-settings' | 'all-synchronize' | 'clear-all';

interface InjectionMutationSelection {
    artifactType?: InjectionKey;
    mode?: InjectionEditMode;
    preset?: InjectionPreset;
}

type InheritedInjectionSource = 'repo' | 'global' | 'default';

interface ResolvedInheritedInjectionMode {
    mode: 'settings' | 'synchronize';
    source: InheritedInjectionSource;
}

interface ResolvedCapabilityInjectionTarget {
    repo: NonNullable<MetaFlowConfig['metadataRepos']>[number];
    capability: NonNullable<
        NonNullable<MetaFlowConfig['metadataRepos']>[number]['capabilities']
    >[number];
    layerSource?: NonNullable<MetaFlowConfig['layerSources']>[number];
    repoLabel: string;
    capabilityLabel: string;
}

interface RepoInjectionCommandTarget {
    kind: 'repo';
    repo: NonNullable<MetaFlowConfig['metadataRepos']>[number];
    repoLabel: string;
}

interface CapabilityInjectionCommandTarget {
    kind: 'capability';
    target: ResolvedCapabilityInjectionTarget;
}

type InjectionCommandTarget = RepoInjectionCommandTarget | CapabilityInjectionCommandTarget;

interface RepoSyncSummaryCounts {
    upToDate: number;
    behind: number;
    ahead: number;
    diverged: number;
    unknown: number;
}

interface RepoSyncCacheUpdateSummary {
    nonGitCount: number;
    summaryCounts: RepoSyncSummaryCounts;
}

function resolveLayerIndicesForItem(
    layerSources: { repoId: string; path: string }[],
    item: unknown,
): number[] {
    const contextValue =
        typeof item === 'object' && item !== null
            ? ((item as Record<string, unknown>).contextValue as string | undefined)
            : undefined;

    if (!contextValue) {
        return layerSources.map((_, i) => i);
    }

    const repoId = (item as Record<string, unknown>).repoId as string | undefined;
    const rawLayerIndex = (item as Record<string, unknown>).layerIndex;
    const pathKey = (item as Record<string, unknown>).pathKey as string | undefined;
    const layerPath = (item as Record<string, unknown>).layerPath as string | undefined;

    if (contextValue === 'layerRepo' && typeof repoId === 'string') {
        return layerSources.flatMap((ls, i) => (ls.repoId === repoId ? [i] : []));
    }

    if (contextValue === 'layer' && typeof rawLayerIndex === 'number') {
        return [rawLayerIndex];
    }

    if (contextValue === 'layerFolder') {
        const prefixSource = pathKey ?? layerPath ?? '';
        const prefix =
            normalizeCommandLayerPath(prefixSource) === '.'
                ? ''
                : normalizeCommandLayerPath(prefixSource);
        return layerSources.flatMap((ls, i) => {
            const normalizedPath =
                normalizeCommandLayerPath(ls.path) === '.'
                    ? ''
                    : normalizeCommandLayerPath(ls.path);
            const pathMatch = normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
            const repoMatch = !repoId || ls.repoId === repoId;
            return pathMatch && repoMatch ? [i] : [];
        });
    }

    return layerSources.map((_, i) => i);
}

function matchesLayerBranchPath(candidatePath: string, branchPath: string): boolean {
    const normalizedCandidate = normalizeCommandLayerPath(candidatePath);
    const normalizedBranch = normalizeCommandLayerPath(branchPath);

    if (normalizedBranch === '.') {
        return true;
    }

    return (
        normalizedCandidate === normalizedBranch ||
        normalizedCandidate.startsWith(`${normalizedBranch}/`)
    );
}

function normalizeLayerId(layerId: string): string {
    const normalized = layerId.replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized === '' ? '.' : normalized;
}

function isInjectionKey(value: unknown): value is InjectionKey {
    return typeof value === 'string' && (INJECTION_KEYS as readonly string[]).includes(value);
}

function isInjectionEditMode(value: unknown): value is InjectionEditMode {
    return value === 'settings' || value === 'synchronize' || value === 'inherit';
}

function isInjectionPreset(value: unknown): value is InjectionPreset {
    return value === 'all-settings' || value === 'all-synchronize' || value === 'clear-all';
}

function sanitizeInjectionConfig(
    injection: InjectionConfig | undefined,
): InjectionConfig | undefined {
    if (!injection) {
        return undefined;
    }

    const sanitized: InjectionConfig = {};
    for (const key of INJECTION_KEYS) {
        const mode = injection[key];
        if (isInjectionMode(mode)) {
            sanitized[key] = mode;
        }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function formatInjectionModeLabel(mode: 'settings' | 'synchronize' | undefined): string {
    if (mode === 'synchronize') {
        return 'synchronize';
    }
    if (mode === 'settings') {
        return 'Settings';
    }
    return 'Inherit';
}

function formatInjectionModeOptionLabel(mode: 'settings' | 'synchronize'): string {
    return mode === 'synchronize' ? 'Synchronize' : 'Settings';
}

function formatInheritedInjectionSourceLabel(source: InheritedInjectionSource): string {
    switch (source) {
        case 'repo':
            return 'repo default';
        case 'global':
            return 'global default';
        default:
            return 'built-in default';
    }
}

function resolveInheritedInjectionMode(
    artifactType: InjectionKey,
    repoInjection?: InjectionConfig,
    globalInjection?: InjectionConfig,
): ResolvedInheritedInjectionMode {
    if (isInjectionMode(repoInjection?.[artifactType])) {
        return {
            mode: repoInjection[artifactType],
            source: 'repo',
        };
    }

    if (isInjectionMode(globalInjection?.[artifactType])) {
        return {
            mode: globalInjection[artifactType],
            source: 'global',
        };
    }

    return {
        mode: DEFAULT_INJECTION_MODE[artifactType],
        source: 'default',
    };
}

function buildInheritedInjectionDescription(
    resolved: ResolvedInheritedInjectionMode | undefined,
): string {
    if (!resolved) {
        return 'Remove the explicit override and use the next scope in the hierarchy';
    }

    return `Remove the explicit override. Effective value: ${formatInjectionModeOptionLabel(resolved.mode)} (${formatInheritedInjectionSourceLabel(resolved.source)})`;
}

function applyInjectionMutation(
    current: InjectionConfig | undefined,
    mutation: InjectionMutationSelection,
): InjectionConfig | undefined {
    if (mutation.preset) {
        switch (mutation.preset) {
            case 'all-settings':
                return sanitizeInjectionConfig({
                    instructions: 'settings',
                    prompts: 'settings',
                    skills: 'settings',
                    agents: 'settings',
                    hooks: 'settings',
                });
            case 'all-synchronize':
                return sanitizeInjectionConfig({
                    instructions: 'synchronize',
                    prompts: 'synchronize',
                    skills: 'synchronize',
                    agents: 'synchronize',
                    hooks: 'synchronize',
                });
            case 'clear-all':
                return undefined;
        }
    }

    if (!mutation.artifactType || !mutation.mode) {
        return sanitizeInjectionConfig(current);
    }

    const next: InjectionConfig = { ...(current ?? {}) };
    if (mutation.mode === 'inherit') {
        delete next[mutation.artifactType];
    } else {
        next[mutation.artifactType] = mutation.mode;
    }

    return sanitizeInjectionConfig(next);
}

function describeInjectionConfig(injection: InjectionConfig | undefined): string {
    if (!injection) {
        return 'inherit';
    }

    const entries = INJECTION_KEYS.filter((key) => isInjectionMode(injection[key])).map(
        (key) => `${key}=${injection[key]}`,
    );

    return entries.length > 0 ? entries.join(', ') : 'inherit';
}

function buildInjectionSelectionFromArg(arg: unknown): InjectionMutationSelection | undefined {
    if (typeof arg !== 'object' || arg === null) {
        return undefined;
    }

    const artifactType = (arg as { artifactType?: unknown }).artifactType;
    const mode = (arg as { mode?: unknown }).mode;
    const preset = (arg as { preset?: unknown }).preset;

    if (isInjectionPreset(preset)) {
        return { preset };
    }

    if (isInjectionKey(artifactType) && isInjectionEditMode(mode)) {
        return { artifactType, mode };
    }

    return undefined;
}

function buildDirectsynchronizationCommandId(
    artifactType: InjectionKey,
    mode: InjectionEditMode,
): string {
    return `metaflow.synchronization.${artifactType}.${mode}`;
}

function buildGlobalInjectionPolicyCommandId(mode: InjectionEditMode): string {
    return `metaflow.injectionPolicy.global.${mode}`;
}

function applyInjectionMutationToCapabilityTarget(
    target: ResolvedCapabilityInjectionTarget,
    mutation: InjectionMutationSelection,
): InjectionConfig | undefined {
    const nextInjection = applyInjectionMutation(target.capability.injection, mutation);
    target.capability.injection = nextInjection;
    target.repo.capabilities = (target.repo.capabilities ?? []).map((candidate) =>
        normalizeCommandLayerPath(candidate.path) ===
        normalizeCommandLayerPath(target.capability.path)
            ? {
                  ...candidate,
                  ...(nextInjection ? { injection: nextInjection } : {}),
              }
            : candidate,
    );
    target.repo.capabilities = target.repo.capabilities.map((candidate) => {
        if (
            normalizeCommandLayerPath(candidate.path) !==
                normalizeCommandLayerPath(target.capability.path) ||
            nextInjection
        ) {
            return candidate;
        }

        const { injection, ...rest } = candidate;
        void injection;
        return rest;
    });

    if (target.layerSource) {
        target.layerSource.injection = nextInjection;
    }

    return nextInjection;
}

function resolveInjectionCommandTarget(
    config: MetaFlowConfig,
    repoMetadataById: Record<string, { name?: string; description?: string }>,
    arg: unknown,
): InjectionCommandTarget | undefined {
    const requestedRepoId = extractRepoId(arg);
    const requestedLayerIndex = extractLayerIndex(arg);
    const requestedLayerPath = extractLayerPath(arg);

    if (typeof requestedLayerIndex === 'number' || typeof requestedLayerPath === 'string') {
        const target = resolveCapabilityInjectionTarget(config, repoMetadataById, arg);
        return target ? { kind: 'capability', target } : undefined;
    }

    if (typeof requestedRepoId !== 'string') {
        return undefined;
    }

    const { metadataRepos } = ensureMultiRepoConfig(config);
    const repo = metadataRepos.find((candidate) => candidate.id === requestedRepoId);
    if (!repo) {
        return undefined;
    }

    const repoLabel = resolveRepoDisplayLabel(
        repo.id,
        repo.name,
        repo.localPath,
        repoMetadataById[repo.id]?.name,
    );
    return { kind: 'repo', repo, repoLabel };
}

async function runDirectsynchronizationCommand(
    state: ExtensionState,
    arg: unknown,
    mutation: InjectionMutationSelection,
): Promise<void> {
    const ws = getWorkspace();
    if (!ws || !state.config || !state.configPath) {
        vscode.window.showWarningMessage('MetaFlow: No config loaded.');
        return;
    }

    const requestedRepoId = extractRepoId(arg);
    if (requestedRepoId === BUILT_IN_CAPABILITY_REPO_ID) {
        vscode.window.showWarningMessage(
            'MetaFlow: Built-in capability injection is not configurable yet.',
        );
        return;
    }

    const resolvedTarget = resolveInjectionCommandTarget(state.config, state.repoMetadataById, arg);
    if (!resolvedTarget) {
        logWarn('Injection policy command failed: target not found.');
        return;
    }

    let updatedLabel: string;
    let nextInjection: InjectionConfig | undefined;
    if (resolvedTarget.kind === 'repo') {
        resolvedTarget.repo.injection = applyInjectionMutation(
            resolvedTarget.repo.injection,
            mutation,
        );
        updatedLabel = resolvedTarget.repoLabel;
        nextInjection = resolvedTarget.repo.injection;
    } else {
        nextInjection = applyInjectionMutationToCapabilityTarget(resolvedTarget.target, mutation);
        if (resolvedTarget.target.layerSource) {
            syncLayerSourceToCapabilityConfig(state.config, resolvedTarget.target.layerSource);
        }
        updatedLabel = resolvedTarget.target.capabilityLabel;
    }

    await persistConfig(state.configPath, state.config, state);
    logInfo(
        `Configured injection policy for ${updatedLabel}: ${describeInjectionConfig(nextInjection)}`,
    );
    void vscode.window.showInformationMessage(
        `MetaFlow: Updated injection policy for ${updatedLabel}.`,
    );
    await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
}

async function promptForInjectionMutation(
    scopeLabel: string,
    current: InjectionConfig | undefined,
    clearLabel: string,
    inheritedModeForArtifact?: (artifactType: InjectionKey) => ResolvedInheritedInjectionMode,
): Promise<InjectionMutationSelection | undefined> {
    type InjectionActionPick = vscode.QuickPickItem & InjectionMutationSelection;

    const selection = await vscode.window.showQuickPick<InjectionActionPick>(
        [
            ...INJECTION_KEYS.map((key) => ({
                label: key,
                description: formatInjectionModeLabel(current?.[key]),
                detail: `Current value for ${key} in ${scopeLabel}`,
                artifactType: key,
            })),
            {
                label: 'Apply preset: all settings',
                detail: `Set every artifact type in ${scopeLabel} to settings-backed injection`,
                preset: 'all-settings',
            },
            {
                label: 'Apply preset: synchronize all',
                detail: `Synchronize every artifact type in ${scopeLabel} into .github`,
                preset: 'all-synchronize',
            },
            {
                label: clearLabel,
                detail: `Remove all explicit injection values from ${scopeLabel}`,
                preset: 'clear-all',
            },
        ],
        {
            title: `MetaFlow: Configure Injection for ${scopeLabel}`,
            placeHolder: 'Select an artifact type or preset',
            ignoreFocusOut: true,
        },
    );

    if (!selection) {
        return undefined;
    }

    if (selection.preset) {
        return { preset: selection.preset };
    }

    if (!selection.artifactType) {
        return undefined;
    }

    type InjectionModePick = vscode.QuickPickItem & { mode: InjectionEditMode };
    const inheritedMode = inheritedModeForArtifact?.(selection.artifactType);
    const mode = await vscode.window.showQuickPick<InjectionModePick>(
        [
            {
                label: 'Inherit',
                description: buildInheritedInjectionDescription(inheritedMode),
                mode: 'inherit',
            },
            {
                label: 'Settings',
                description:
                    'Inject alternate-path settings instead of synchronizing files into .github',
                mode: 'settings',
            },
            {
                label: 'Synchronize',
                description: 'Synchronize files into .github output',
                mode: 'synchronize',
            },
        ],
        {
            title: `MetaFlow: ${scopeLabel} → ${selection.artifactType}`,
            placeHolder: 'Select the injection mode to persist',
            ignoreFocusOut: true,
        },
    );

    if (!mode) {
        return undefined;
    }

    return {
        artifactType: selection.artifactType,
        mode: mode.mode,
    };
}

function resolveCapabilityInjectionTarget(
    config: MetaFlowConfig,
    repoMetadataById: Record<string, { name?: string; description?: string }>,
    arg: unknown,
): ResolvedCapabilityInjectionTarget | undefined {
    const { metadataRepos, layerSources } = ensureMultiRepoConfig(config);
    const requestedRepoId = extractRepoId(arg);
    const requestedLayerPath = extractLayerPath(arg);
    const requestedLayerIndex = extractLayerIndex(arg);
    const expectedLayerPath =
        typeof requestedLayerPath === 'string'
            ? normalizeCommandLayerPath(requestedLayerPath)
            : undefined;

    let layerSource =
        typeof requestedLayerIndex === 'number' ? layerSources[requestedLayerIndex] : undefined;

    const matchesRequestedIdentity = (
        candidate: (typeof layerSources)[number] | undefined,
    ): candidate is (typeof layerSources)[number] => {
        if (!candidate) {
            return false;
        }
        if (typeof requestedRepoId === 'string' && candidate.repoId !== requestedRepoId) {
            return false;
        }
        if (
            typeof expectedLayerPath === 'string' &&
            normalizeCommandLayerPath(candidate.path) !== expectedLayerPath
        ) {
            return false;
        }
        return true;
    };

    if (
        !matchesRequestedIdentity(layerSource) &&
        (typeof requestedRepoId === 'string' || typeof expectedLayerPath === 'string')
    ) {
        layerSource = layerSources.find((candidate) => matchesRequestedIdentity(candidate));
    }

    if (!layerSource) {
        return undefined;
    }

    const repo = metadataRepos.find((candidate) => candidate.id === layerSource.repoId);
    if (!repo) {
        return undefined;
    }

    repo.capabilities ??= [];
    let capability = repo.capabilities.find(
        (candidate) =>
            normalizeCommandLayerPath(candidate.path) ===
            normalizeCommandLayerPath(layerSource.path),
    );
    if (!capability) {
        capability = {
            path: layerSource.path,
            ...(layerSource.enabled !== undefined ? { enabled: layerSource.enabled } : {}),
            ...(layerSource.excludedTypes !== undefined
                ? { excludedTypes: [...layerSource.excludedTypes] }
                : {}),
        };
        repo.capabilities.push(capability);
    }

    const repoLabel = resolveRepoDisplayLabel(
        repo.id,
        repo.name,
        repo.localPath,
        repoMetadataById[repo.id]?.name,
    );
    const capabilityLabel =
        normalizeCommandLayerPath(capability.path) === '.'
            ? `${repoLabel} / root`
            : capability.path;

    return {
        repo,
        capability,
        layerSource,
        repoLabel,
        capabilityLabel,
    };
}

function syncLayerSourceToCapabilityConfig(
    config: MetaFlowConfig,
    layerSource: NonNullable<MetaFlowConfig['layerSources']>[number],
): void {
    const { metadataRepos } = ensureMultiRepoConfig(config);
    const repo = metadataRepos.find((candidate) => candidate.id === layerSource.repoId);
    if (!repo) {
        return;
    }

    repo.capabilities ??= [];
    let capability = repo.capabilities.find(
        (candidate) =>
            normalizeCommandLayerPath(candidate.path) ===
            normalizeCommandLayerPath(layerSource.path),
    );
    if (!capability) {
        capability = { path: layerSource.path };
        repo.capabilities.push(capability);
    }

    if (layerSource.enabled === undefined) {
        delete capability.enabled;
    } else {
        capability.enabled = layerSource.enabled;
    }

    if (layerSource.excludedTypes === undefined) {
        delete capability.excludedTypes;
    } else {
        capability.excludedTypes = [...layerSource.excludedTypes];
    }

    if (layerSource.injection === undefined) {
        delete capability.injection;
    } else {
        capability.injection = { ...layerSource.injection };
    }
}

function getScopedLayerMutationProfile(
    config: MetaFlowConfig,
): { profileId: string; profile: NonNullable<MetaFlowConfig['profiles']>[string] } | undefined {
    const profileId = config.activeProfile;
    if (!profileId) {
        return undefined;
    }

    const profile = config.profiles?.[profileId];
    if (!profile) {
        return undefined;
    }

    return { profileId, profile };
}

function applyLayerMutationToActiveProfile(
    config: MetaFlowConfig,
    repoId: string,
    layerPath: string,
    mutation: {
        enabled?: boolean;
        excludedTypes?: ExcludableArtifactType[];
    },
): { scopedToProfile: boolean; profileId?: string } {
    const target = getScopedLayerMutationProfile(config);
    if (!target) {
        return { scopedToProfile: false };
    }

    updateProfileLayerOverride(target.profile, repoId, layerPath, mutation);
    return { scopedToProfile: true, profileId: target.profileId };
}

function deriveCapabilityIdFromLayerPath(layerPath: string, repoRoot: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

function loadBuiltInCapabilityManifest(sourceRoot: string | undefined) {
    if (!sourceRoot) {
        return undefined;
    }

    const capabilityId = deriveCapabilityIdFromLayerPath('.', sourceRoot);
    return loadCapabilityManifestForLayer(sourceRoot, capabilityId);
}

function loadBuiltInRepoManifest(sourceRoot: string | undefined) {
    if (!sourceRoot) {
        return undefined;
    }

    return loadRepoManifestForRoot(sourceRoot);
}

function collectConfiguredCapabilityMetadata(
    config: MetaFlowConfig,
    workspaceRoot: string,
): Record<string, { id?: string; name?: string; description?: string; license?: string }> {
    const capabilityByLayer: Record<
        string,
        { id?: string; name?: string; description?: string; license?: string }
    > = {};

    if (config.metadataRepos && config.layerSources) {
        const repoById = new Map(config.metadataRepos.map((repo) => [repo.id, repo]));

        for (const source of config.layerSources) {
            const repo = repoById.get(source.repoId);
            if (!repo) {
                continue;
            }

            const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
            const layerAbsPath = path.join(repoRoot, source.path);
            const capabilityId = deriveCapabilityIdFromLayerPath(source.path, repoRoot);
            const manifest = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
            if (!manifest) {
                continue;
            }

            capabilityByLayer[normalizeLayerId(`${source.repoId}/${source.path}`)] = {
                id: manifest.id,
                name: manifest.name,
                description: manifest.description,
                license: manifest.license,
            };
        }

        return capabilityByLayer;
    }

    if (config.metadataRepo && config.layers) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        for (const layerPath of config.layers) {
            const layerAbsPath = path.join(repoRoot, layerPath);
            const capabilityId = deriveCapabilityIdFromLayerPath(layerPath, repoRoot);
            const manifest = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
            if (!manifest) {
                continue;
            }

            capabilityByLayer[normalizeLayerId(layerPath)] = {
                id: manifest.id,
                name: manifest.name,
                description: manifest.description,
                license: manifest.license,
            };
        }
    }

    return capabilityByLayer;
}

function collectConfiguredRepoMetadata(
    config: MetaFlowConfig,
    workspaceRoot: string,
    builtInCapability?: BuiltInCapabilityRuntimeState,
): Record<string, { name?: string; description?: string }> {
    const repoMetadataById: Record<string, { name?: string; description?: string }> = {};

    if (config.metadataRepos) {
        for (const repo of config.metadataRepos) {
            const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
            const manifest = loadRepoManifestForRoot(repoRoot);
            if (!manifest) {
                continue;
            }

            repoMetadataById[repo.id] = {
                name: manifest.name,
                description: manifest.description,
            };
        }
    }

    if (config.metadataRepo) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        const manifest = loadRepoManifestForRoot(repoRoot);
        if (manifest) {
            repoMetadataById.primary = {
                name: manifest.name,
                description: manifest.description,
            };
        }
    }

    const builtInManifest = loadBuiltInRepoManifest(builtInCapability?.sourceRoot);
    if (builtInManifest) {
        repoMetadataById[BUILT_IN_CAPABILITY_REPO_ID] = {
            name: builtInManifest.name,
            description: builtInManifest.description,
        };
    }

    return repoMetadataById;
}

function collectConfiguredCapabilityWarnings(
    config: MetaFlowConfig,
    workspaceRoot: string,
): string[] {
    const warnings = new Set<string>();

    const appendWarningIfMalformed = (repoRoot: string, layerPath: string): void => {
        const layerAbsPath = path.join(repoRoot, layerPath);
        const capabilityFile = path.join(layerAbsPath, 'CAPABILITY.md');
        if (!fs.existsSync(capabilityFile)) {
            return;
        }

        const capabilityId = deriveCapabilityIdFromLayerPath(layerPath, repoRoot);
        const manifest = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
        if (manifest) {
            return;
        }

        const displayPath = toPosixPath(path.relative(repoRoot, capabilityFile));
        warnings.add(`CAPABILITY_NO_FRONTMATTER: ${displayPath}`);
    };

    if (config.metadataRepos && config.layerSources) {
        const repoById = new Map(config.metadataRepos.map((repo) => [repo.id, repo]));
        for (const source of config.layerSources) {
            const repo = repoById.get(source.repoId);
            if (!repo) {
                continue;
            }

            const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
            appendWarningIfMalformed(repoRoot, source.path);
        }

        return Array.from(warnings);
    }

    if (config.metadataRepo && config.layers) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        for (const layerPath of config.layers) {
            appendWarningIfMalformed(repoRoot, layerPath);
        }
    }

    return Array.from(warnings);
}

function cloneConfig(config: MetaFlowConfig): MetaFlowConfig {
    return JSON.parse(JSON.stringify(config)) as MetaFlowConfig;
}

function withBuiltInCapabilityProjected(
    config: MetaFlowConfig,
    builtInState: BuiltInCapabilityRuntimeState,
): MetaFlowConfig {
    if (!isBuiltInCapabilityActive(builtInState) || !builtInState.sourceRoot) {
        return config;
    }

    const projected = cloneConfig(config);
    const multiRepo = ensureMultiRepoConfig(projected);
    const builtInManifest = loadBuiltInCapabilityManifest(builtInState.sourceRoot);
    const builtInRepoLabel = resolveBuiltInCapabilityDisplayName(
        builtInManifest?.name,
        builtInState.sourceDisplayName,
    );

    const existingRepo = multiRepo.metadataRepos.find(
        (repo) => repo.id === BUILT_IN_CAPABILITY_REPO_ID,
    );
    if (!existingRepo) {
        multiRepo.metadataRepos.push({
            id: BUILT_IN_CAPABILITY_REPO_ID,
            name: builtInRepoLabel,
            localPath: builtInState.sourceRoot,
            enabled: true,
        });
    } else {
        existingRepo.name = builtInRepoLabel;
    }

    const existingLayer = multiRepo.layerSources.find(
        (layer) =>
            layer.repoId === BUILT_IN_CAPABILITY_REPO_ID &&
            layer.path === BUILT_IN_CAPABILITY_LAYER_PATH,
    );

    if (!existingLayer) {
        multiRepo.layerSources.push({
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            path: BUILT_IN_CAPABILITY_LAYER_PATH,
            enabled: builtInState.layerEnabled,
        });
    } else {
        existingLayer.enabled = builtInState.layerEnabled;
    }

    return projected;
}

async function resolveBuiltInCapabilitySourceRoot(
    context: vscode.ExtensionContext,
): Promise<string | undefined> {
    const storageRoot = context.globalStorageUri.fsPath;
    try {
        await fsp.mkdir(storageRoot, { recursive: true });
        const cached = await ensureMetaFlowAiMetadataCache({
            storageRoot,
            extensionPath: context.extensionPath,
            version: context.extension.packageJSON.version,
        });
        return cached?.targetRoot;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(
            `Built-in metadata cache unavailable; falling back to bundled extension assets: ${msg}`,
        );
        return undefined;
    }
}

async function loadBuiltInCapabilityRuntimeState(
    context: vscode.ExtensionContext,
): Promise<BuiltInCapabilityRuntimeState> {
    const cachedSourceRoot = await resolveBuiltInCapabilitySourceRoot(context);
    return readBuiltInCapabilityRuntimeState(
        context.workspaceState,
        context.extensionPath,
        context.extension.id,
        getExtensionDisplayName(context),
        cachedSourceRoot,
    );
}

async function writeBuiltInCapabilityWorkspaceState(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
    patch: BuiltInCapabilityWorkspaceState,
): Promise<BuiltInCapabilityRuntimeState> {
    const payload: BuiltInCapabilityWorkspaceState = {
        enabled: patch.enabled ?? currentState.enabled,
        layerEnabled: patch.layerEnabled ?? currentState.layerEnabled,
        synchronizedFiles: sanitizeSynchronizedFiles(
            patch.synchronizedFiles ?? currentState.synchronizedFiles,
        ),
    };

    await context.workspaceState.update(BUILT_IN_CAPABILITY_STATE_KEY, payload);
    return loadBuiltInCapabilityRuntimeState(context);
}

async function enableBuiltInCapabilityInSettingsMode(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
): Promise<BuiltInCapabilityRuntimeState> {
    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        enabled: true,
        layerEnabled: true,
    });
}

async function offerBuiltInCapabilityOnboarding(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
): Promise<BuiltInCapabilityRuntimeState> {
    if (isBuiltInCapabilityActive(currentState)) {
        return currentState;
    }

    const choice = await vscode.window.showInformationMessage(
        'MetaFlow: Enable the bundled AI metadata capabilities now?',
        ENABLE_METAFLOW_AI_METADATA_ACTION,
        NOT_NOW_ACTION,
    );

    if (choice !== ENABLE_METAFLOW_AI_METADATA_ACTION) {
        return currentState;
    }

    const nextState = await enableBuiltInCapabilityInSettingsMode(context, currentState);
    vscode.window.showInformationMessage(
        'MetaFlow: Built-in MetaFlow capability enabled (settings-only mode).',
    );
    await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
    return nextState;
}

async function removeSynchronizedCapabilityFiles(
    workspaceRoot: string,
    trackedFiles: string[],
): Promise<number> {
    let removedCount = 0;

    for (const trackedRelativePath of sanitizeSynchronizedFiles(trackedFiles)) {
        const normalized = trackedRelativePath.replace(/\\/g, '/');
        if (!normalized.startsWith('.github/')) {
            continue;
        }

        const destination = path.join(workspaceRoot, normalized);
        if (!fs.existsSync(destination) || !fs.statSync(destination).isFile()) {
            continue;
        }

        await fsp.unlink(destination);
        removedCount += 1;

        let currentDir = path.dirname(destination);
        while (
            currentDir !== workspaceRoot &&
            currentDir.startsWith(path.join(workspaceRoot, '.github'))
        ) {
            let entries: string[];
            try {
                entries = await fsp.readdir(currentDir);
            } catch (err: unknown) {
                const code = (err as NodeJS.ErrnoException)?.code;
                if (code === 'ENOENT') {
                    break;
                }
                throw err;
            }

            if (entries.length > 0) {
                break;
            }

            try {
                await fsp.rmdir(currentDir);
            } catch (err: unknown) {
                const code = (err as NodeJS.ErrnoException)?.code;
                if (code === 'ENOENT' || code === 'ENOTEMPTY') {
                    break;
                }
                throw err;
            }

            currentDir = path.dirname(currentDir);
        }
    }

    return removedCount;
}

interface MetaFlowKnownFileCleanupResult {
    removedKnownFileCount: number;
    removedDirectory: boolean;
    remainingEntries: string[];
}

const KNOWN_METAFLOW_FILES = ['config.jsonc', 'state.json'] as const;

async function removeKnownMetaFlowFilesAndPruneDirectory(
    workspaceRoot: string,
): Promise<MetaFlowKnownFileCleanupResult> {
    const metaflowDir = path.join(workspaceRoot, '.metaflow');
    let removedKnownFileCount = 0;

    for (const fileName of KNOWN_METAFLOW_FILES) {
        const knownFilePath = path.join(metaflowDir, fileName);
        try {
            await fsp.unlink(knownFilePath);
            removedKnownFileCount += 1;
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT') {
                continue;
            }
            throw err;
        }
    }

    let remainingEntries: string[];
    try {
        remainingEntries = await fsp.readdir(metaflowDir);
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') {
            return {
                removedKnownFileCount,
                removedDirectory: true,
                remainingEntries: [],
            };
        }
        throw err;
    }

    if (remainingEntries.length > 0) {
        return {
            removedKnownFileCount,
            removedDirectory: false,
            remainingEntries,
        };
    }

    try {
        await fsp.rmdir(metaflowDir);
        return {
            removedKnownFileCount,
            removedDirectory: true,
            remainingEntries: [],
        };
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') {
            return {
                removedKnownFileCount,
                removedDirectory: true,
                remainingEntries: [],
            };
        }
        if (code === 'ENOTEMPTY') {
            const currentEntries = await fsp.readdir(metaflowDir);
            return {
                removedKnownFileCount,
                removedDirectory: false,
                remainingEntries: currentEntries,
            };
        }
        throw err;
    }
}

function buildMetaFlowCleanupMessage(cleanup: MetaFlowKnownFileCleanupResult): string {
    if (cleanup.removedDirectory) {
        return 'MetaFlow: All repository sources removed. Deleted known MetaFlow files and removed empty .metaflow directory.';
    }

    const sortedEntries = [...cleanup.remainingEntries].sort((a, b) => a.localeCompare(b));
    const listedEntries = sortedEntries.slice(0, 3).join(', ');
    const remainingSummary =
        sortedEntries.length > 3
            ? `${listedEntries} (+${sortedEntries.length - 3} more)`
            : listedEntries;

    return `MetaFlow: All repository sources removed. Deleted known MetaFlow files, but kept .metaflow because it still contains: ${remainingSummary}.`;
}

async function syncTrackedSynchronizedBuiltInCapabilityFiles(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    currentState: BuiltInCapabilityRuntimeState,
): Promise<BuiltInCapabilityRuntimeState> {
    if (!currentState.sourceRoot || currentState.synchronizedFiles.length === 0) {
        return currentState;
    }

    if (!isBuiltInCapabilityActive(currentState)) {
        return currentState;
    }

    const synchronized = await scaffoldMetaFlowAiMetadata({
        workspaceRoot,
        extensionPath: context.extensionPath,
        overwriteExisting: true,
    });

    if (!synchronized) {
        return currentState;
    }

    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        synchronizedFiles: synchronized.writtenFiles,
    });
}

async function ensureBuiltInCapabilityFromAutoApplySetting(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    currentState: BuiltInCapabilityRuntimeState,
    mode: AiMetadataAutoApplyMode,
): Promise<BuiltInCapabilityRuntimeState> {
    if (mode === 'off') {
        return currentState;
    }

    if (mode === 'builtinLayer') {
        if (currentState.enabled && currentState.layerEnabled) {
            return currentState;
        }

        logInfo('MetaFlow: Auto-applied built-in AI metadata in built-in layer mode.');
        return writeBuiltInCapabilityWorkspaceState(context, currentState, {
            enabled: true,
            layerEnabled: true,
        });
    }

    if (currentState.synchronizedFiles.length === 0) {
        const synchronized = await scaffoldMetaFlowAiMetadata({
            workspaceRoot,
            extensionPath: context.extensionPath,
            overwriteExisting: true,
        });

        if (!synchronized) {
            logWarn(
                'MetaFlow: aiMetadataAutoApplyMode=synchronize requested, but bundled assets are unavailable.',
            );
            return currentState;
        }

        logInfo(
            `MetaFlow: Synchronized built-in AI metadata into .github (${synchronized.writtenFiles.length} file(s)).`,
        );
        return writeBuiltInCapabilityWorkspaceState(context, currentState, {
            enabled: false,
            layerEnabled: true,
            synchronizedFiles: synchronized.writtenFiles,
        });
    }

    if (!currentState.enabled && currentState.layerEnabled) {
        return currentState;
    }

    logInfo(
        'MetaFlow: Auto-applied built-in AI metadata mode by normalizing tracked synchronization state.',
    );
    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        enabled: false,
        layerEnabled: true,
    });
}

/**
 * Resolve the overlay from config and return effective files.
 */
function resolveOverlay(
    config: MetaFlowConfig,
    workspaceRoot: string,
    injection: InjectionConfig,
    options?: {
        enableDiscovery?: boolean;
        forceDiscoveryRepoIds?: string[];
        builtInCapability?: BuiltInCapabilityRuntimeState;
    },
): {
    baseProfileFiles: EffectiveFile[];
    effectiveFiles: EffectiveFile[];
    capabilityByLayer: Record<
        string,
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
        }
    >;
    capabilityWarnings: string[];
} {
    const layers = resolveLayers(config, workspaceRoot, {
        enableDiscovery: options?.enableDiscovery,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
    });
    const builtInLayerId = normalizeLayerId(
        `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`,
    );
    const builtInManifest = loadBuiltInCapabilityManifest(options?.builtInCapability?.sourceRoot);
    let builtInLayerResolved = false;

    if (builtInManifest) {
        for (const layer of layers) {
            if (normalizeLayerId(layer.layerId) !== builtInLayerId) {
                continue;
            }

            layer.capability = builtInManifest;
            builtInLayerResolved = true;
        }
    }

    const capabilityByLayer: Record<
        string,
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
        }
    > = {};
    const capabilityWarnings: string[] = [];

    for (const layer of layers) {
        if (layer.capability) {
            capabilityByLayer[normalizeLayerId(layer.layerId)] = {
                id: layer.capability.id,
                name: layer.capability.name,
                description: layer.capability.description,
                license: layer.capability.license,
            };
        }

        for (const warning of layer.capability?.warnings ?? []) {
            const message = formatCapabilityWarningMessage(warning);
            capabilityWarnings.push(message);
            logWarn(message);
        }
    }

    // Also load capability metadata from configured layers that are currently disabled,
    // so layer tooltips can still show capability details in the GUI.
    const configuredCapabilityByLayer = collectConfiguredCapabilityMetadata(config, workspaceRoot);
    for (const [layerId, metadata] of Object.entries(configuredCapabilityByLayer)) {
        if (!capabilityByLayer[layerId]) {
            capabilityByLayer[layerId] = metadata;
        }
    }

    if (builtInManifest && !capabilityByLayer[builtInLayerId]) {
        capabilityByLayer[builtInLayerId] = {
            id: builtInManifest.id,
            name: builtInManifest.name,
            description: builtInManifest.description,
            license: builtInManifest.license,
        };
    }

    if (builtInManifest && !builtInLayerResolved) {
        for (const warning of builtInManifest.warnings) {
            const message = formatCapabilityWarningMessage(warning);
            if (!capabilityWarnings.includes(message)) {
                capabilityWarnings.push(message);
                logWarn(message);
            }
        }
    }

    for (const warning of collectConfiguredCapabilityWarnings(config, workspaceRoot)) {
        if (!capabilityWarnings.includes(warning)) {
            capabilityWarnings.push(warning);
            logWarn(warning);
        }
    }

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    for (const conflict of detectSurfacedFileConflicts(layers, {
        filters: config.filters,
        layerSources: config.layerSources,
        profile,
    })) {
        const message = formatSurfacedFileConflictMessage(conflict);
        if (!capabilityWarnings.includes(message)) {
            capabilityWarnings.push(message);
            logWarn(message);
        }
    }

    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);
    files = applyExcludedTypeFilters(files, config.layerSources);

    const baseProfileFiles = [...files];
    files = applyProfile(files, profile);

    classifyFiles(files, injection, config.layerSources);
    return {
        baseProfileFiles,
        effectiveFiles: files,
        capabilityByLayer,
        capabilityWarnings,
    };
}

function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function toConfigLocalPath(workspaceFolder: vscode.WorkspaceFolder, targetFsPath: string): string {
    const relative = toPosixPath(path.relative(workspaceFolder.uri.fsPath, targetFsPath));
    if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) {
        return relative;
    }
    return targetFsPath;
}

function resolveInjectionConfig(
    workspace: vscode.WorkspaceFolder,
    config: MetaFlowConfig,
): InjectionConfig {
    const workspaceConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
    const modes = workspaceConfig.get<Record<string, unknown>>(INJECTION_OVERRIDE_SETTING_KEY, {});
    const injection: InjectionConfig = {
        ...(config.injection ?? {}),
    };

    for (const key of INJECTION_KEYS) {
        // Authored config takes precedence; workspace settings are fallback-only.
        if (injection[key] !== undefined) {
            continue;
        }

        const overrideMode = modes?.[key];
        if (isInjectionMode(overrideMode)) {
            injection[key] = overrideMode;
            continue;
        }

        const legacySettingMode = workspaceConfig.get<unknown>(
            LEGACY_INJECTION_SETTING_KEYS[key],
            undefined,
        );
        if (isInjectionMode(legacySettingMode)) {
            injection[key] = legacySettingMode;
            continue;
        }

        injection[key] = DEFAULT_INJECTION_MODE[key];
    }

    return injection;
}

/**
 * Write config to disk. When the file already exists, uses JSONC edit operations
 * to preserve comments and formatting where possible. Falls back to JSON.stringify
 * for new files or when the existing content cannot be parsed.
 */
async function persistConfig(
    configPath: string,
    config: MetaFlowConfig,
    state?: ExtensionState,
): Promise<void> {
    const authoredConfig = toAuthoredConfig(config);
    const topLevelKeys = [
        'metadataRepo',
        'layers',
        'metadataRepos',
        'layerSources',
        'filters',
        'profiles',
        'activeProfile',
        'injection',
        'settingsInjectionTarget',
        'hooks',
    ];
    let existing: string | undefined;
    try {
        existing = await fsp.readFile(configPath, 'utf-8');
    } catch {
        // File does not exist yet — will write fresh JSON below.
    }

    if (state) {
        state.suppressConfigWatcherUntil = Date.now() + 1500;
    }

    if (existing !== undefined) {
        // Apply each top-level property as a targeted JSONC edit to preserve comments.
        let updated = existing;
        const formatOptions: jsonc.FormattingOptions = { tabSize: 2, insertSpaces: true };
        for (const key of topLevelKeys) {
            if (!(key in authoredConfig)) {
                const edits = jsonc.modify(updated, [key], undefined, {
                    formattingOptions: formatOptions,
                });
                updated = jsonc.applyEdits(updated, edits);
            }
        }
        for (const [key, value] of Object.entries(authoredConfig)) {
            const edits = jsonc.modify(updated, [key], value, { formattingOptions: formatOptions });
            updated = jsonc.applyEdits(updated, edits);
        }
        await fsp.writeFile(configPath, updated, 'utf-8');
    } else {
        await fsp.writeFile(configPath, JSON.stringify(authoredConfig, null, 2) + '\n', 'utf-8');
    }
}

interface ProfileQuickPickItem extends vscode.QuickPickItem {
    profileId: string;
}

function resolveActiveProfileLabel(config: MetaFlowConfig | undefined): string | undefined {
    if (!config?.activeProfile) {
        return undefined;
    }

    return getProfileDisplayName(config.activeProfile, config.profiles?.[config.activeProfile]);
}

function buildProfileQuickPickItems(config: MetaFlowConfig): ProfileQuickPickItem[] {
    return Object.entries(config.profiles ?? {}).map(([profileId, profile]) => {
        const displayName = getProfileDisplayName(profileId, profile);
        const descriptors: string[] = [];
        if (profileId === config.activeProfile) {
            descriptors.push('active');
        }
        if (displayName !== profileId) {
            descriptors.push(`id: ${profileId}`);
        }

        return {
            profileId,
            label: displayName,
            ...(descriptors.length > 0 ? { description: descriptors.join(' • ') } : {}),
        };
    });
}

function buildSuggestedProfileCopyName(
    baseName: string,
    existingDisplayNames: Set<string>,
): string {
    let candidate = `Copy of ${baseName}`;
    let suffix = 2;
    while (existingDisplayNames.has(candidate)) {
        candidate = `Copy of ${baseName} ${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function discoverAndPersistRepoLayers(
    config: MetaFlowConfig,
    workspaceRoot: string,
    repoId: string,
): number {
    if (config.metadataRepos && config.layerSources) {
        const repo = config.metadataRepos.find((candidate) => candidate.id === repoId);
        if (!repo) {
            return 0;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        const discoveredLayers = discoverLayersInRepo(repoRoot, repo.discover?.exclude);
        const existing = new Set(
            config.layerSources
                .filter((source) => source.repoId === repoId)
                .map((source) => source.path),
        );

        let added = 0;
        for (const layerPath of discoveredLayers) {
            if (existing.has(layerPath)) {
                continue;
            }
            config.layerSources.push({
                repoId,
                path: layerPath,
                enabled: false,
            });
            existing.add(layerPath);
            added += 1;
        }

        return added;
    }

    if (repoId === 'primary' && config.metadataRepo && config.layers) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        const discoveredLayers = discoverLayersInRepo(repoRoot);
        const existing = new Set(config.layers);

        let added = 0;
        for (const layerPath of discoveredLayers) {
            if (existing.has(layerPath)) {
                continue;
            }
            config.layers.push(layerPath);
            existing.add(layerPath);
            added += 1;
        }

        return added;
    }

    return 0;
}

function discoverAndPersistConfiguredRepoLayers(
    config: MetaFlowConfig,
    workspaceRoot: string,
    repoId?: string,
    options?: { enableDiscovery?: boolean },
): { totalAdded: number; rescannedRepoIds: string[] } {
    if (config.metadataRepos && config.layerSources) {
        const repoIds = config.metadataRepos
            .filter((candidate) => {
                if (repoId) {
                    return candidate.id === repoId;
                }

                return options?.enableDiscovery === true;
            })
            .map((candidate) => candidate.id);

        let totalAdded = 0;
        for (const currentRepoId of repoIds) {
            totalAdded += discoverAndPersistRepoLayers(config, workspaceRoot, currentRepoId);
        }

        return {
            totalAdded,
            rescannedRepoIds: repoIds,
        };
    }

    if (repoId === 'primary') {
        return {
            totalAdded: discoverAndPersistRepoLayers(config, workspaceRoot, 'primary'),
            rescannedRepoIds: ['primary'],
        };
    }

    return {
        totalAdded: 0,
        rescannedRepoIds: [],
    };
}

function isGitRemoteUrl(repoUrl: string | undefined): boolean {
    if (!repoUrl) {
        return false;
    }

    const trimmed = repoUrl.trim();
    if (!trimmed) {
        return false;
    }

    return /^(git@|git:\/\/|ssh:\/\/|https?:\/\/)/i.test(trimmed);
}

function resolveGitBackedRepoSources(
    config: MetaFlowConfig,
    workspaceRoot: string,
): ResolvedRepoSource[] {
    if (config.metadataRepos) {
        return config.metadataRepos
            .filter((repo) => isGitRemoteUrl(repo.url))
            .map((repo) => {
                const localPath = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
                return {
                    repoId: repo.id,
                    label: resolveRepoDisplayLabel(
                        repo.id,
                        repo.name,
                        repo.localPath,
                        loadRepoManifestForRoot(localPath)?.name,
                    ),
                    localPath,
                    repoUrl: repo.url,
                };
            });
    }

    if (config.metadataRepo && isGitRemoteUrl(config.metadataRepo.url)) {
        const localPath = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        return [
            {
                repoId: 'primary',
                label: resolveRepoDisplayLabel(
                    'primary',
                    config.metadataRepo.name,
                    config.metadataRepo.localPath,
                    loadRepoManifestForRoot(localPath)?.name,
                ),
                localPath,
                repoUrl: config.metadataRepo.url,
            },
        ];
    }

    return [];
}

function resolveUntrackedLocalRepoSources(
    config: MetaFlowConfig,
    workspaceRoot: string,
): UntrackedLocalRepoSource[] {
    if (config.metadataRepos) {
        return config.metadataRepos
            .filter((repo) => !isGitRemoteUrl(repo.url))
            .map((repo) => {
                const localPath = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
                return {
                    repoId: repo.id,
                    label: resolveRepoDisplayLabel(
                        repo.id,
                        repo.name,
                        repo.localPath,
                        loadRepoManifestForRoot(localPath)?.name,
                    ),
                    localPath,
                };
            });
    }

    if (config.metadataRepo && !isGitRemoteUrl(config.metadataRepo.url)) {
        const localPath = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        return [
            {
                repoId: 'primary',
                label: resolveRepoDisplayLabel(
                    'primary',
                    config.metadataRepo.name,
                    config.metadataRepo.localPath,
                    loadRepoManifestForRoot(localPath)?.name,
                ),
                localPath,
            },
        ];
    }

    return [];
}

function parseGitRemoteVerboseOutput(stdout: string): GitRemoteInfo[] {
    const remotesByName = new Map<string, GitRemoteInfo>();

    for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (!match) {
            continue;
        }

        const [, name, url, direction] = match;
        const existing = remotesByName.get(name);
        if (!existing || direction === 'fetch') {
            remotesByName.set(name, { name, url });
        }
    }

    return Array.from(remotesByName.values());
}

async function discoverGitRemotes(repoRoot: string): Promise<GitRemoteInfo[]> {
    try {
        const insideWorkTree = (
            await runGitCommand(repoRoot, ['rev-parse', '--is-inside-work-tree'])
        ).stdout.trim();
        if (insideWorkTree !== 'true') {
            return [];
        }

        const remotes = await runGitCommand(repoRoot, ['remote', '-v']);
        return parseGitRemoteVerboseOutput(remotes.stdout);
    } catch {
        return [];
    }
}

function buildGitRemotePromotionSignature(remotes: GitRemoteInfo[]): string {
    const normalized = remotes
        .map((remote) => ({
            name: remote.name.trim(),
            url: remote.url.trim(),
        }))
        .filter((remote) => remote.name.length > 0 && remote.url.length > 0)
        .sort((a, b) => {
            const byName = a.name.localeCompare(b.name);
            if (byName !== 0) {
                return byName;
            }
            return a.url.localeCompare(b.url);
        });

    return normalized.map((remote) => `${remote.name}=${remote.url}`).join('|');
}

function buildGitRemotePromotionSuppressionKey(repo: UntrackedLocalRepoSource): string {
    const normalizedPath = path.normalize(repo.localPath);
    const stablePath = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    return `${repo.repoId}::${stablePath}`;
}

function readGitRemotePromotionSuppressions(
    context: vscode.ExtensionContext,
): GitRemotePromotionSuppressionState {
    const raw = context.workspaceState.get<unknown>(
        GIT_REMOTE_PROMOTION_SUPPRESSIONS_STATE_KEY,
        {},
    );

    if (!raw || typeof raw !== 'object') {
        return {};
    }

    const entries = Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return Object.fromEntries(entries);
}

function buildWorkspaceScopedSuppressionKey(workspaceRoot: string): string {
    const normalizedPath = path.normalize(workspaceRoot);
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

function readWorkspaceSuppressions(
    context: vscode.ExtensionContext,
    stateKey: string,
): Record<string, string> {
    const raw = context.workspaceState.get<unknown>(stateKey, {});
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    const entries = Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    return Object.fromEntries(entries);
}

function computeGitIgnorePromptSignature(content: string): string {
    return createHash('sha1').update(content).digest('hex');
}

async function pickRemoteForPromotion(
    repo: UntrackedLocalRepoSource,
    remotes: GitRemoteInfo[],
): Promise<GitRemoteInfo | undefined> {
    if (remotes.length === 1) {
        return remotes[0];
    }

    const picked = await vscode.window.showQuickPick(
        remotes.map((remote) => ({
            label: remote.name,
            description: remote.url,
            remote,
        })),
        {
            title: `MetaFlow: Select Remote for ${repo.repoId}`,
            placeHolder: 'Choose the remote URL to track in MetaFlow config',
            ignoreFocusOut: true,
        },
    );

    return picked?.remote;
}

function setRepoRemoteUrl(config: MetaFlowConfig, repoId: string, url: string): boolean {
    if (config.metadataRepos) {
        const repo = config.metadataRepos.find((candidate) => candidate.id === repoId);
        if (!repo) {
            return false;
        }
        repo.url = url;
        return true;
    }

    if (repoId === 'primary' && config.metadataRepo) {
        config.metadataRepo.url = url;
        return true;
    }

    return false;
}

function invalidateRepoSyncStatus(state: ExtensionState): void {
    state.repoSyncByRepoId = {};
}

function pruneRepoSyncStatusToRepos(state: ExtensionState, repoIds: Iterable<string>): void {
    const allowed = new Set(repoIds);
    state.repoSyncByRepoId = Object.fromEntries(
        Object.entries(state.repoSyncByRepoId).filter(([repoId]) => allowed.has(repoId)),
    );
}

async function refreshRepoSyncStatusCache(
    state: ExtensionState,
    targets: ResolvedRepoSource[],
): Promise<RepoSyncCacheUpdateSummary> {
    const summaryCounts: RepoSyncSummaryCounts = {
        upToDate: 0,
        behind: 0,
        ahead: 0,
        diverged: 0,
        unknown: 0,
    };
    let nonGitCount = 0;

    pruneRepoSyncStatusToRepos(
        state,
        targets.map((target) => target.repoId),
    );

    for (const target of targets) {
        const result = await checkRepoSyncStatus(target.localPath);

        if (result.kind === 'nonGit') {
            nonGitCount += 1;
            delete state.repoSyncByRepoId[target.repoId];
            logWarn(
                `Repo update check skipped for ${target.repoId}: ${result.reason ?? 'not a git repository.'}`,
            );
            continue;
        }

        const status = result.status!;
        state.repoSyncByRepoId[target.repoId] = status;
        summaryCounts[status.state] += 1;

        if (status.state === 'behind') {
            logInfo(
                `Repo ${target.repoId} has updates upstream (${status.behindCount ?? 0} behind, ${status.aheadCount ?? 0} ahead).`,
            );
        } else if (status.state === 'unknown') {
            logWarn(
                `Repo ${target.repoId} update state unknown: ${status.error ?? 'unknown error'}`,
            );
        } else {
            logInfo(`Repo ${target.repoId} sync state: ${status.state}.`);
        }
    }

    return {
        nonGitCount,
        summaryCounts,
    };
}

async function pickGitBackedRepo(
    repos: ResolvedRepoSource[],
    title: string,
    placeHolder: string,
): Promise<ResolvedRepoSource | undefined> {
    if (repos.length === 1) {
        return repos[0];
    }

    const pickedRepoId = await vscode.window.showQuickPick(
        repos.map((repo) => ({
            label: repo.label,
            description: repo.repoId,
            detail: repo.localPath,
            repoId: repo.repoId,
        })),
        {
            title,
            placeHolder,
            ignoreFocusOut: true,
        },
    );

    if (!pickedRepoId) {
        return undefined;
    }

    return repos.find((repo) => repo.repoId === pickedRepoId.repoId);
}

async function injectWorkspaceSettings(
    workspace: vscode.WorkspaceFolder,
    config: MetaFlowConfig,
    effectiveFiles: EffectiveFile[],
    context: vscode.ExtensionContext,
): Promise<void> {
    try {
        const hooksEnabled = vscode.workspace
            .getConfiguration('metaflow', workspace.uri)
            .get<boolean>('hooksEnabled', true);
        const configForSettings = hooksEnabled ? config : { ...config, hooks: undefined };
        const entries = computeSettingsEntries(
            effectiveFiles,
            workspace.uri.fsPath,
            configForSettings,
        );
        const entriesByKey = new Map(entries.map((entry) => [entry.key, entry.value] as const));
        const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
        const managedKeys = computeSettingsKeysToRemove();

        const target = resolveSettingsInjectionTarget(workspace, config);
        const previousState = readManagedSettingsState(context);

        // Clean stale entries from a previously-used scope if the target changed
        if (previousState.effectiveTarget && previousState.effectiveTarget !== target.effective) {
            await cleanManagedEntriesFromScope(
                wsConfig,
                previousState.effectiveTarget,
                previousState.managedEntries?.[previousState.effectiveTarget],
                workspace,
            );
        }

        const newManagedEntries: Record<string, unknown> = {};

        for (const key of managedKeys) {
            try {
                const existing = wsConfig.inspect(key);
                let scopeValue = getScopeValue(existing, target.effective);
                const newValue = entriesByKey.get(key);
                scopeValue = pruneBundledMetaFlowSettingsEntries(scopeValue, key, newValue);

                if (newValue === undefined) {
                    // Remove previously-managed entries for this key if any
                    const prevManaged = previousState.managedEntries?.[target.effective]?.[key];
                    if (
                        prevManaged !== undefined ||
                        scopeValue !== getScopeValue(existing, target.effective)
                    ) {
                        const cleaned =
                            prevManaged !== undefined
                                ? removeSettingsEntries(scopeValue, prevManaged)
                                : scopeValue;
                        await wsConfig.update(key, cleaned, target.configurationTarget);
                    }
                    continue;
                }

                // Remove previously-managed entries, then merge new ones
                const prevManaged = previousState.managedEntries?.[target.effective]?.[key];
                if (prevManaged !== undefined) {
                    scopeValue = removeSettingsEntries(scopeValue, prevManaged) ?? undefined;
                }

                const merged = mergeSettingsValue(scopeValue, newValue);
                await wsConfig.update(key, merged, target.configurationTarget);
                newManagedEntries[key] = newValue;
            } catch (entryErr: unknown) {
                const entryMsg = entryErr instanceof Error ? entryErr.message : String(entryErr);
                logWarn(`Settings key update skipped (${key}): ${entryMsg}`);
            }
        }

        await writeManagedSettingsState(context, {
            requestedTarget: target.requested,
            effectiveTarget: target.effective,
            managedEntries: { [target.effective]: newManagedEntries },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`Settings injection skipped: ${msg}`);
    }
}

/** Get the scope-specific value from a ConfigurationInspection. */
function getScopeValue(
    inspection:
        | { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown }
        | undefined,
    scope: SettingsInjectionTarget,
): unknown {
    if (!inspection) {
        return undefined;
    }
    switch (scope) {
        case 'user':
            return inspection.globalValue;
        case 'workspace':
            return inspection.workspaceValue;
        case 'workspaceFolder':
            return inspection.workspaceFolderValue;
    }
}

/** Remove MetaFlow-managed entries from a single scope. */
async function cleanManagedEntriesFromScope(
    wsConfig: vscode.WorkspaceConfiguration,
    scope: SettingsInjectionTarget,
    managedEntries: Record<string, unknown> | undefined,
    workspace: vscode.WorkspaceFolder,
): Promise<void> {
    if (!managedEntries) {
        return;
    }
    const configTarget = TARGET_TO_CONFIGURATION_TARGET[scope];
    const scopeConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);

    for (const [key, managed] of Object.entries(managedEntries)) {
        try {
            const inspection = scopeConfig.inspect(key);
            const scopeValue = getScopeValue(inspection, scope);
            const cleaned = removeSettingsEntries(scopeValue, managed);
            await scopeConfig.update(key, cleaned, configTarget);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logWarn(`Settings cleanup skipped (${key}, ${scope}): ${msg}`);
        }
    }
}

async function clearManagedWorkspaceSettings(
    workspace: vscode.WorkspaceFolder,
    context: vscode.ExtensionContext,
): Promise<void> {
    const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
    const keysToRemove = computeSettingsKeysToRemove();
    const previousState = readManagedSettingsState(context);

    // Clean managed entries from the scope that was last used
    if (
        previousState.effectiveTarget &&
        previousState.managedEntries?.[previousState.effectiveTarget]
    ) {
        await cleanManagedEntriesFromScope(
            wsConfig,
            previousState.effectiveTarget,
            previousState.managedEntries[previousState.effectiveTarget],
            workspace,
        );
    } else {
        // Legacy fallback: no managed state — clear all keys from workspace + workspaceFolder
        const targets: Array<{ value: vscode.ConfigurationTarget; label: string }> = [
            { value: vscode.ConfigurationTarget.Workspace, label: 'workspace' },
            { value: vscode.ConfigurationTarget.WorkspaceFolder, label: 'workspaceFolder' },
        ];

        for (const key of keysToRemove) {
            for (const target of targets) {
                try {
                    // Skip workspaceFolder cleanup if nothing is set there. This avoids
                    // noisy warnings for settings that don't support the folder resource
                    // scope (e.g. chat.hookFilesLocations) when there is nothing to clear.
                    if (
                        target.value === vscode.ConfigurationTarget.WorkspaceFolder &&
                        wsConfig.inspect(key)?.workspaceFolderValue === undefined
                    ) {
                        continue;
                    }
                    await wsConfig.update(key, undefined, target.value);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logWarn(`Settings cleanup skipped (${key}, ${target.label}): ${msg}`);
                }
            }
        }
    }

    await writeManagedSettingsState(context, {});
}

/**
 * Register all MetaFlow command handlers.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    diagnosticCollection: vscode.DiagnosticCollection,
    capabilityDetailsPanel: CapabilityDetailsPanelManager,
): void {
    const extensionDisplayName = getExtensionDisplayName(context);

    state.builtInCapability = readBuiltInCapabilityRuntimeState(
        context.workspaceState,
        context.extensionPath,
        context.extension.id,
        extensionDisplayName,
    );

    const withLoadedProfileConfig = ():
        | { config: MetaFlowConfig; configPath: string }
        | undefined => {
        if (!state.config || !state.configPath) {
            vscode.window.showWarningMessage('MetaFlow: No profiles available. Run Refresh first.');
            return undefined;
        }

        return {
            config: state.config,
            configPath: state.configPath,
        };
    };

    const promptForProfileDisplayName = async (options: {
        title: string;
        value?: string;
        excludeProfileId?: string;
    }): Promise<string | undefined> => {
        const loaded = withLoadedProfileConfig();
        if (!loaded) {
            return undefined;
        }

        const existingDisplayNames = new Set(
            Object.entries(loaded.config.profiles ?? {})
                .filter(([profileId]) => profileId !== options.excludeProfileId)
                .map(([profileId, profile]) => getProfileDisplayName(profileId, profile)),
        );

        return vscode.window.showInputBox({
            prompt: options.title,
            value: options.value,
            ignoreFocusOut: true,
            validateInput: (value) => {
                const normalized = value.trim();
                if (!normalized) {
                    return 'Profile name is required.';
                }
                if (existingDisplayNames.has(normalized)) {
                    return `Profile name "${normalized}" already exists.`;
                }
                return undefined;
            },
        });
    };

    const switchProfile = async (profileId: string): Promise<void> => {
        const loaded = withLoadedProfileConfig();
        if (!loaded) {
            return;
        }

        if (!loaded.config.profiles?.[profileId]) {
            vscode.window.showWarningMessage(`MetaFlow: Profile "${profileId}" was not found.`);
            return;
        }

        if (loaded.config.activeProfile === profileId) {
            return;
        }

        loaded.config.activeProfile = profileId;
        await persistConfig(loaded.configPath, loaded.config, state);
        logInfo(
            `Switched profile to: ${getProfileDisplayName(profileId, loaded.config.profiles[profileId])}`,
        );
        await vscode.commands.executeCommand('metaflow.refresh');
    };

    // ── metaflow.refresh ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.refresh', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const refreshOptions = extractRefreshCommandOptions(arg);
            logInfo('Refreshing overlay...');
            updateStatusBar('loading');
            state.isLoading = true;
            state.onDidChange.fire();

            try {
                const result = loadConfig(ws.uri.fsPath);
                if (!result.ok) {
                    logError(`Config errors: ${result.errors.map((e) => e.message).join('; ')}`);
                    publishConfigDiagnostics(diagnosticCollection, result);
                    await clearManagedWorkspaceSettings(ws, context);
                    if (result.configPath) {
                        vscode.window.showWarningMessage(
                            'MetaFlow: Found config file, but it is invalid. Check Problems for details.',
                        );
                    } else {
                        const message =
                            'MetaFlow: No .metaflow/config.jsonc found at workspace root.';
                        logWarn(message);
                        vscode.window.showWarningMessage(message);
                    }
                    updateStatusBar('error');
                    state.config = undefined;
                    state.configPath = undefined;
                    state.activeProfile = undefined;
                    state.baseProfileFiles = [];
                    state.effectiveFiles = [];
                    state.capabilityByLayer = {};
                    state.repoMetadataById = {};
                    state.capabilityWarnings = [];
                    state.treeSummaryCache = undefined;
                    invalidateRepoSyncStatus(state);
                    state.isLoading = false;
                    state.onDidChange.fire();
                    return;
                }

                clearDiagnostics(diagnosticCollection);
                const configNormalized = normalizeAndDeduplicateLayerPaths(result.config);
                const prunedLayers = pruneStaleLayerSources(result.config, ws.uri.fsPath);
                const workspaceConfig = vscode.workspace.getConfiguration('metaflow', ws.uri);
                const autoApplyEnabled = workspaceConfig.get<boolean>('autoApply', true);
                const discoveryResult = discoverAndPersistConfiguredRepoLayers(
                    result.config,
                    ws.uri.fsPath,
                    refreshOptions.forceDiscoveryRepoId,
                    { enableDiscovery: true },
                );
                if (
                    (result.migrated ||
                        configNormalized ||
                        prunedLayers.length > 0 ||
                        discoveryResult.totalAdded > 0) &&
                    result.configPath
                ) {
                    await persistConfig(result.configPath, result.config, state);
                    if (result.migrated) {
                        for (const message of result.migrationMessages ?? []) {
                            logInfo(message);
                        }
                        void vscode.window.showInformationMessage(
                            'MetaFlow: Configuration was automatically migrated to metadataRepos[*].capabilities.',
                        );
                    }
                    if (configNormalized) {
                        logInfo(
                            'Normalized layer paths in config (removed redundant .github suffix entries).',
                        );
                    }
                    if (prunedLayers.length > 0) {
                        logInfo(
                            `Pruned ${prunedLayers.length} stale layer source(s) from config: ${prunedLayers.join(', ')}`,
                        );
                    }
                    if (discoveryResult.totalAdded > 0) {
                        const rescannedScope =
                            discoveryResult.rescannedRepoIds.length > 1
                                ? `${discoveryResult.rescannedRepoIds.length} repositories`
                                : (discoveryResult.rescannedRepoIds[0] ?? 'repository');
                        logInfo(
                            `Discovered ${discoveryResult.totalAdded} new layer(s) while rescanning ${rescannedScope}.`,
                        );
                    }
                }
                state.config = result.config;
                state.configPath = result.configPath;
                state.activeProfile = result.config.activeProfile;
                state.builtInCapability = await loadBuiltInCapabilityRuntimeState(context);
                state.builtInCapability = await syncTrackedSynchronizedBuiltInCapabilityFiles(
                    context,
                    ws.uri.fsPath,
                    state.builtInCapability,
                );

                const aiMetadataAutoApplyMode = normalizeAiMetadataAutoApplyMode(
                    workspaceConfig.get<unknown>(AI_METADATA_AUTO_APPLY_MODE_SETTING_KEY, 'off'),
                );
                state.builtInCapability = await ensureBuiltInCapabilityFromAutoApplySetting(
                    context,
                    ws.uri.fsPath,
                    state.builtInCapability,
                    aiMetadataAutoApplyMode,
                );

                const gitRepos = resolveGitBackedRepoSources(result.config, ws.uri.fsPath);
                if (refreshOptions.skipRepoSync === true) {
                    pruneRepoSyncStatusToRepos(
                        state,
                        gitRepos.map((repo) => repo.repoId),
                    );
                } else {
                    await refreshRepoSyncStatusCache(state, gitRepos);
                }

                let overlayResolved = false;

                try {
                    const injectionConfig = resolveInjectionConfig(ws, result.config);
                    const shouldEnableDiscovery =
                        autoApplyEnabled || refreshOptions.forceDiscovery === true;
                    const projectedConfig = withBuiltInCapabilityProjected(
                        result.config,
                        state.builtInCapability,
                    );
                    const activeProfileProjectedConfig = projectConfigForProfile(projectedConfig);
                    state.repoMetadataById = collectConfiguredRepoMetadata(
                        result.config,
                        ws.uri.fsPath,
                        state.builtInCapability,
                    );
                    const overlay = resolveOverlay(
                        activeProfileProjectedConfig,
                        ws.uri.fsPath,
                        injectionConfig,
                        {
                            enableDiscovery: shouldEnableDiscovery,
                            forceDiscoveryRepoIds: refreshOptions.forceDiscoveryRepoId
                                ? [refreshOptions.forceDiscoveryRepoId]
                                : undefined,
                            builtInCapability: state.builtInCapability,
                        },
                    );
                    state.baseProfileFiles = overlay.baseProfileFiles;
                    state.effectiveFiles = overlay.effectiveFiles;
                    state.capabilityByLayer = overlay.capabilityByLayer;
                    state.capabilityWarnings = overlay.capabilityWarnings;
                    state.treeSummaryCache = await buildTreeSummaryCache(
                        projectedConfig,
                        ws.uri.fsPath,
                        state.effectiveFiles,
                        state.baseProfileFiles,
                        state.builtInCapability,
                    );
                    overlayResolved = true;
                    logInfo(`Resolved ${state.effectiveFiles.length} effective files.`);
                    updateStatusBar(
                        'idle',
                        resolveActiveProfileLabel(result.config),
                        state.effectiveFiles.length,
                    );
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logError(`Overlay resolution failed: ${msg}`);
                    state.baseProfileFiles = [];
                    state.effectiveFiles = [];
                    state.capabilityByLayer = {};
                    state.capabilityWarnings = [];
                    state.treeSummaryCache = undefined;
                    updateStatusBar('error');
                    void vscode.window
                        .showErrorMessage(
                            `MetaFlow: Overlay resolution failed. ${msg}`,
                            'Show Output',
                        )
                        .then((selection) => {
                            if (selection === 'Show Output') {
                                showOutputChannel();
                            }
                        });
                }

                state.isLoading = false;
                state.onDidChange.fire();

                if (!refreshOptions.skipAutoApply && overlayResolved) {
                    if (autoApplyEnabled) {
                        logInfo('Auto-apply enabled; applying overlay after refresh.');
                        await vscode.commands.executeCommand('metaflow.apply', {
                            skipRefresh: true,
                        });
                    }
                }
            } catch (err: unknown) {
                state.isLoading = false;
                state.onDidChange.fire();
                throw err;
            }
        }),
    );

    // ── metaflow.preview ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.preview', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            const changes = preview(ws.uri.fsPath, state.effectiveFiles);
            showOutputChannel();
            logInfo('=== Overlay Preview ===');
            for (const c of changes) {
                logInfo(`  [${c.action}] ${c.relativePath}${c.reason ? ` (${c.reason})` : ''}`);
            }
            logInfo(`Total: ${changes.length} pending changes.`);
            if (state.capabilityWarnings.length > 0) {
                logInfo(`Warnings: ${state.capabilityWarnings.length}`);
                for (const warning of state.capabilityWarnings) {
                    logWarn(`  ${warning}`);
                }
            }
        }),
    );

    // ── metaflow.apply ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.apply', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            const applyOptions = extractApplyCommandOptions(arg);

            state.isApplying = true;
            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'MetaFlow: Applying overlay...',
                    },
                    async () => {
                        const result = apply({
                            workspaceRoot: ws.uri.fsPath,
                            effectiveFiles: state.effectiveFiles,
                            activeProfile: state.activeProfile,
                        });

                        // Inject settings for settings-backed files (may fail if Copilot extension not present)
                        await injectWorkspaceSettings(
                            ws,
                            state.config!,
                            state.effectiveFiles,
                            context,
                        );
                        logInfo(
                            `Apply complete: ${result.written.length} written, ${result.skipped.length} skipped, ${result.removed.length} removed.`,
                        );
                        for (const w of result.warnings) {
                            logWarn(w);
                        }
                        if (state.capabilityWarnings.length > 0) {
                            logInfo(`Non-blocking warnings: ${state.capabilityWarnings.length}`);
                            for (const warning of state.capabilityWarnings) {
                                logWarn(`  ${warning}`);
                            }
                        }

                        if (result.written.length > 0) {
                            vscode.window.showInformationMessage(
                                state.capabilityWarnings.length > 0
                                    ? `MetaFlow: Applied ${result.written.length} files with ${state.capabilityWarnings.length} non-blocking warning(s).`
                                    : `MetaFlow: Applied ${result.written.length} files.`,
                            );
                        }

                        // Refresh views
                        if (!applyOptions.skipRefresh) {
                            await vscode.commands.executeCommand('metaflow.refresh', {
                                skipAutoApply: true,
                            });
                        }
                    },
                );
            } finally {
                state.isApplying = false;
            }
        }),
    );

    // ── metaflow.clean ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.clean', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                'MetaFlow: Remove all synchronized files?',
                'Remove',
                'Cancel',
            );
            if (confirm !== 'Remove') {
                return;
            }

            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'MetaFlow: Cleaning synchronized files...',
                },
                async (): Promise<ApplyResult> => {
                    const result = clean(ws.uri.fsPath);

                    await clearManagedWorkspaceSettings(ws, context);
                    logInfo(
                        `Clean complete: ${result.removed.length} removed, ${result.skipped.length} skipped.`,
                    );
                    for (const w of result.warnings) {
                        logWarn(w);
                    }

                    vscode.window.showInformationMessage(
                        `MetaFlow: Cleaned ${result.removed.length} files.`,
                    );

                    await vscode.commands.executeCommand('metaflow.refresh', {
                        skipAutoApply: true,
                    });

                    return result;
                },
            );
        }),
    );

    // ── metaflow.status ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.status', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const lines: string[] = [];
            const emitInfo = (message: string) => {
                lines.push(message);
                logInfo(message);
            };
            const emitWarn = (message: string) => {
                lines.push(message);
                logWarn(message);
            };

            showOutputChannel();
            emitInfo('=== MetaFlow Status ===');
            emitInfo(`Config: ${state.configPath ?? 'Not loaded'}`);
            emitInfo(`Active Profile: ${resolveActiveProfileLabel(state.config) ?? 'None'}`);
            emitInfo(`Effective Files: ${state.effectiveFiles.length}`);
            const managedState = loadManagedState(ws.uri.fsPath);
            const trackedCount = Object.keys(managedState.files).length;
            emitInfo(`Synchronized Files: ${trackedCount}`);
            emitInfo(`Last Apply: ${managedState.lastApply}`);
            const managedSettingsSummary = formatManagedSettingsStateSummary(context);
            emitInfo(`Settings Injection Target: ${managedSettingsSummary.target}`);
            emitInfo(`Settings Injection Keys: ${managedSettingsSummary.keys}`);
            emitInfo(`Injection Modes: ${formatInjectionModesSummary(state.config)}`);

            if (trackedCount > 0) {
                const driftResults = checkAllDrift(ws.uri.fsPath, '.github', managedState);
                const drifted = driftResults.filter((r) => r.status === 'drifted');
                const missing = driftResults.filter((r) => r.status === 'missing');
                emitInfo(`Drifted: ${drifted.length}, Missing: ${missing.length}`);
                for (const d of drifted) {
                    emitWarn(`  Drifted: ${d.relativePath}`);
                }
            }

            if (state.capabilityWarnings.length > 0) {
                emitInfo(`Warnings: ${state.capabilityWarnings.length}`);
                for (const warning of state.capabilityWarnings) {
                    emitWarn(`  ${warning}`);
                }
            }

            const syncStatuses = Object.values(state.repoSyncByRepoId);
            const counts = {
                upToDate: 0,
                behind: 0,
                ahead: 0,
                diverged: 0,
                unknown: 0,
            };
            for (const status of syncStatuses) {
                counts[status.state] += 1;
            }
            emitInfo(
                `Repo Sync: ${syncStatuses.length} tracked (up-to-date: ${counts.upToDate}, behind: ${counts.behind}, ahead: ${counts.ahead}, diverged: ${counts.diverged}, unknown: ${counts.unknown})`,
            );
            for (const [repoId, status] of Object.entries(state.repoSyncByRepoId)) {
                const details = [
                    status.trackingRef ? `upstream: ${status.trackingRef}` : undefined,
                    typeof status.behindCount === 'number'
                        ? `${status.behindCount} behind`
                        : undefined,
                    typeof status.aheadCount === 'number'
                        ? `${status.aheadCount} ahead`
                        : undefined,
                    status.error ? `error: ${status.error}` : undefined,
                    `checked: ${status.lastCheckedAt}`,
                ].filter((value): value is string => Boolean(value));
                emitInfo(
                    `  [${repoId}] ${status.state}${details.length > 0 ? ` (${details.join(', ')})` : ''}`,
                );
            }

            return lines;
        }),
    );

    // ── metaflow.switchProfile ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.switchProfile', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.config.profiles) {
                vscode.window.showWarningMessage('MetaFlow: No profiles available.');
                return;
            }

            const requestedProfileId = extractProfileId(arg);
            if (requestedProfileId) {
                await switchProfile(requestedProfileId);
                return;
            }

            const selected = await vscode.window.showQuickPick(
                buildProfileQuickPickItems(state.config),
                {
                    placeHolder: 'Select active profile',
                },
            );

            if (!selected) {
                return;
            }

            await switchProfile(selected.profileId);
        }),
    );

    // ── metaflow.createProfile ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.createProfile', async () => {
            const loaded = withLoadedProfileConfig();
            if (!loaded) {
                return;
            }

            const displayName = await promptForProfileDisplayName({
                title: 'Enter a name for the new profile',
            });
            if (!displayName) {
                return;
            }

            try {
                const created = addProfileToConfig(loaded.config, displayName);
                await persistConfig(loaded.configPath, loaded.config, state);
                logInfo(
                    `Created profile: ${getProfileDisplayName(created.profileId, created.profile)} (${created.profileId})`,
                );
                await vscode.commands.executeCommand('metaflow.refresh');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showWarningMessage(`MetaFlow: ${message}`);
            }
        }),
    );

    // ── metaflow.duplicateProfile ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.duplicateProfile', async (arg?: unknown) => {
            const loaded = withLoadedProfileConfig();
            if (!loaded) {
                return;
            }

            const requestedProfileId = extractProfileId(arg);
            const availableProfiles = loaded.config.profiles ?? {};
            const selectedProfileId =
                requestedProfileId && availableProfiles[requestedProfileId]
                    ? requestedProfileId
                    : (
                          await vscode.window.showQuickPick(
                              buildProfileQuickPickItems(loaded.config),
                              { placeHolder: 'Select a profile to duplicate' },
                          )
                      )?.profileId;

            if (!selectedProfileId) {
                return;
            }

            const sourceProfile = availableProfiles[selectedProfileId];
            if (!sourceProfile) {
                vscode.window.showWarningMessage(
                    `MetaFlow: Profile "${selectedProfileId}" was not found.`,
                );
                return;
            }

            const suggestedName = buildSuggestedProfileCopyName(
                getProfileDisplayName(selectedProfileId, sourceProfile),
                new Set(
                    Object.entries(availableProfiles).map(([profileId, profile]) =>
                        getProfileDisplayName(profileId, profile),
                    ),
                ),
            );
            const displayName = await promptForProfileDisplayName({
                title: `Enter a name for the duplicate of ${getProfileDisplayName(selectedProfileId, sourceProfile)}`,
                value: suggestedName,
            });
            if (!displayName) {
                return;
            }

            try {
                const created = addProfileToConfig(loaded.config, displayName, selectedProfileId);
                await persistConfig(loaded.configPath, loaded.config, state);
                logInfo(`Duplicated profile ${selectedProfileId} to ${created.profileId}.`);
                await vscode.commands.executeCommand('metaflow.refresh');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showWarningMessage(`MetaFlow: ${message}`);
            }
        }),
    );

    // ── metaflow.deleteProfile ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.deleteProfile', async (arg?: unknown) => {
            const loaded = withLoadedProfileConfig();
            if (!loaded) {
                return;
            }

            const candidateProfiles = Object.entries(loaded.config.profiles ?? {}).filter(
                ([profileId]) => profileId !== DEFAULT_PROFILE_ID,
            );
            if (candidateProfiles.length === 0) {
                vscode.window.showWarningMessage('MetaFlow: No deletable profiles are available.');
                return;
            }

            const requestedProfileId = extractProfileId(arg);
            const profileId =
                requestedProfileId && loaded.config.profiles?.[requestedProfileId]
                    ? requestedProfileId
                    : (
                          await vscode.window.showQuickPick(
                              candidateProfiles.map(([candidateId, profile]) => ({
                                  profileId: candidateId,
                                  label: getProfileDisplayName(candidateId, profile),
                                  ...(candidateId !== getProfileDisplayName(candidateId, profile)
                                      ? { description: `id: ${candidateId}` }
                                      : {}),
                              })),
                              { placeHolder: 'Select a profile to delete' },
                          )
                      )?.profileId;

            if (!profileId) {
                return;
            }

            const profile = loaded.config.profiles?.[profileId];
            if (!profile) {
                vscode.window.showWarningMessage(`MetaFlow: Profile "${profileId}" was not found.`);
                return;
            }

            const displayName = getProfileDisplayName(profileId, profile);
            const deletingActiveProfile = loaded.config.activeProfile === profileId;
            const confirm = await vscode.window.showWarningMessage(
                deletingActiveProfile
                    ? `Delete profile "${displayName}" and switch back to Default?`
                    : `Delete profile "${displayName}"?`,
                'Delete',
                'Cancel',
            );
            if (confirm !== 'Delete') {
                return;
            }

            try {
                const nextActiveProfile = deleteProfileFromConfig(loaded.config, profileId);
                await persistConfig(loaded.configPath, loaded.config, state);
                const nextLabel =
                    nextActiveProfile && loaded.config.profiles?.[nextActiveProfile]
                        ? getProfileDisplayName(
                              nextActiveProfile,
                              loaded.config.profiles[nextActiveProfile],
                          )
                        : undefined;
                logInfo(
                    nextLabel
                        ? `Deleted profile ${displayName}; active profile is now ${nextLabel}.`
                        : `Deleted profile ${displayName}.`,
                );
                await vscode.commands.executeCommand('metaflow.refresh');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showWarningMessage(`MetaFlow: ${message}`);
            }
        }),
    );

    // ── metaflow.toggleLayer ───────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleLayer', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const repoIdFromArg = extractRepoId(arg);
            const requestedCheckedState = extractLayerCheckedState(arg);
            const requestedLayerPath = extractLayerPath(arg);
            if (repoIdFromArg === BUILT_IN_CAPABILITY_REPO_ID) {
                const nextLayerEnabled =
                    typeof requestedCheckedState === 'boolean'
                        ? requestedCheckedState
                        : !state.builtInCapability.layerEnabled;
                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    { layerEnabled: nextLayerEnabled },
                );
                logInfo(
                    `Toggled built-in MetaFlow capability layer: ${nextLayerEnabled ? 'enabled' : 'disabled'}`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
                return;
            }

            if (!state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            try {
                const projectedConfig = projectConfigForProfile(state.config);
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);
                const expectedLayerPath =
                    typeof requestedLayerPath === 'string'
                        ? normalizeCommandLayerPath(requestedLayerPath)
                        : undefined;
                const requestedLayerIndex = extractLayerIndex(arg);

                let layerIndex =
                    typeof requestedLayerIndex === 'number' ? requestedLayerIndex : undefined;
                let layerSource =
                    typeof layerIndex === 'number' ? layerSources[layerIndex] : undefined;

                const matchesRequestedIdentity = (
                    candidate: (typeof layerSources)[number] | undefined,
                ): candidate is (typeof layerSources)[number] => {
                    if (!candidate) {
                        return false;
                    }
                    if (typeof repoIdFromArg === 'string' && candidate.repoId !== repoIdFromArg) {
                        return false;
                    }
                    if (
                        typeof expectedLayerPath === 'string' &&
                        normalizeCommandLayerPath(candidate.path) !== expectedLayerPath
                    ) {
                        return false;
                    }
                    return true;
                };

                if (
                    !matchesRequestedIdentity(layerSource) &&
                    (typeof repoIdFromArg === 'string' || typeof expectedLayerPath === 'string')
                ) {
                    layerIndex = layerSources.findIndex((candidate) =>
                        matchesRequestedIdentity(candidate),
                    );
                    layerSource = layerIndex >= 0 ? layerSources[layerIndex] : undefined;
                }

                if (typeof layerIndex !== 'number') {
                    logWarn('Toggle layer requires a valid layer identity.');
                    return;
                }

                if (!layerSource) {
                    logWarn(`Toggle layer failed: layer index ${layerIndex} not found.`);
                    return;
                }

                const nextLayerEnabled =
                    typeof requestedCheckedState === 'boolean'
                        ? requestedCheckedState
                        : layerSource.enabled === false;
                const scopedMutation = applyLayerMutationToActiveProfile(
                    state.config,
                    layerSource.repoId,
                    layerSource.path,
                    { enabled: nextLayerEnabled },
                );

                if (!scopedMutation.scopedToProfile) {
                    const runtimeConfig = ensureMultiRepoConfig(state.config);
                    const runtimeLayerSource = runtimeConfig.layerSources.find(
                        (candidate) =>
                            candidate.repoId === layerSource.repoId &&
                            normalizeCommandLayerPath(candidate.path) ===
                                normalizeCommandLayerPath(layerSource.path),
                    );
                    if (!runtimeLayerSource) {
                        logWarn(
                            `Toggle layer failed: runtime layer ${layerSource.repoId}/${layerSource.path} not found.`,
                        );
                        return;
                    }
                    runtimeLayerSource.enabled = nextLayerEnabled;
                    syncLayerSourceToCapabilityConfig(state.config, runtimeLayerSource);
                }

                let repoAutoEnabled = false;
                if (nextLayerEnabled) {
                    const runtimeRepos = ensureMultiRepoConfig(state.config).metadataRepos;
                    const runtimeRepo = runtimeRepos.find(
                        (candidate) => candidate.id === layerSource.repoId,
                    );
                    if (runtimeRepo) {
                        repoAutoEnabled = runtimeRepo.enabled === false;
                        runtimeRepo.enabled = true;
                    }
                }

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config, state);
                }

                logInfo(
                    `Toggled layer ${layerSource.repoId}/${layerSource.path}: ${nextLayerEnabled ? 'enabled' : 'disabled'}${scopedMutation.profileId ? ` (profile: ${scopedMutation.profileId})` : ''}`,
                );
                if (repoAutoEnabled) {
                    logInfo(`Enabled repo source ${layerSource.repoId} because layer was enabled.`);
                }
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle layer failed: ${message}`);
            }
        }),
    );

    // ── metaflow.toggleLayerBranch ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleLayerBranch', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const requestedCheckedState = extractLayerCheckedState(arg);
            const requestedRepoId = extractRepoId(arg);
            const requestedLayerPath =
                extractLayerPath(arg) ??
                (typeof arg === 'object' && arg !== null
                    ? ((arg as Record<string, unknown>).pathKey as string | undefined)
                    : undefined);

            if (
                typeof requestedCheckedState !== 'boolean' ||
                typeof requestedLayerPath !== 'string'
            ) {
                logWarn('toggleLayerBranch: missing checked state or branch path.');
                return;
            }

            const normalizedBranchPath = normalizeCommandLayerPath(requestedLayerPath);
            const runtimeConfig = ensureMultiRepoConfig(state.config);
            const { metadataRepos, layerSources } = runtimeConfig;
            const matchedLayers = new Map<
                string,
                {
                    repoId: string;
                    path: string;
                    layerSource?: (typeof layerSources)[number];
                    capability?: NonNullable<
                        NonNullable<(typeof metadataRepos)[number]['capabilities']>
                    >[number];
                }
            >();
            const updatedLayerIds = new Set<string>();
            const scopedMutation = getScopedLayerMutationProfile(state.config);

            for (const layerSource of layerSources) {
                if (typeof requestedRepoId === 'string' && layerSource.repoId !== requestedRepoId) {
                    continue;
                }

                if (!matchesLayerBranchPath(layerSource.path, normalizedBranchPath)) {
                    continue;
                }

                matchedLayers.set(
                    `${layerSource.repoId}:${normalizeCommandLayerPath(layerSource.path)}`,
                    {
                        repoId: layerSource.repoId,
                        path: layerSource.path,
                        layerSource,
                    },
                );
            }

            for (const repo of metadataRepos) {
                if (typeof requestedRepoId === 'string' && repo.id !== requestedRepoId) {
                    continue;
                }

                for (const capability of repo.capabilities ?? []) {
                    if (!matchesLayerBranchPath(capability.path, normalizedBranchPath)) {
                        continue;
                    }

                    const layerId = `${repo.id}:${normalizeCommandLayerPath(capability.path)}`;
                    const existing = matchedLayers.get(layerId);
                    matchedLayers.set(layerId, {
                        repoId: repo.id,
                        path: capability.path,
                        layerSource: existing?.layerSource,
                        capability,
                    });
                }
            }

            for (const matchedLayer of matchedLayers.values()) {
                if (scopedMutation) {
                    updateProfileLayerOverride(
                        scopedMutation.profile,
                        matchedLayer.repoId,
                        matchedLayer.path,
                        { enabled: requestedCheckedState },
                    );
                } else if (matchedLayer.layerSource) {
                    matchedLayer.layerSource.enabled = requestedCheckedState;
                    syncLayerSourceToCapabilityConfig(state.config, matchedLayer.layerSource);
                } else if (matchedLayer.capability) {
                    matchedLayer.capability.enabled = requestedCheckedState;
                }

                updatedLayerIds.add(
                    `${matchedLayer.repoId}:${normalizeCommandLayerPath(matchedLayer.path)}`,
                );
            }

            if (updatedLayerIds.size === 0) {
                logWarn(
                    `toggleLayerBranch: no layers matched ${requestedRepoId ?? 'all repos'}/${normalizedBranchPath}.`,
                );
                return;
            }

            if (state.configPath) {
                await persistConfig(state.configPath, state.config, state);
            }

            logInfo(
                `Toggled branch ${requestedRepoId ?? 'all repos'}/${normalizedBranchPath}: ${requestedCheckedState ? 'enabled' : 'disabled'} (${updatedLayerIds.size} layer(s))${scopedMutation ? ` (profile: ${scopedMutation.profileId})` : ''}`,
            );
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        }),
    );

    // ── metaflow.selectAllLayers ───────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.selectAllLayers', async (item?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }
            try {
                const projectedConfig = projectConfigForProfile(state.config);
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                const scopedMutation = getScopedLayerMutationProfile(state.config);
                for (const i of indices) {
                    const layerSource = layerSources[i];
                    if (!layerSource) {
                        continue;
                    }
                    if (scopedMutation) {
                        updateProfileLayerOverride(
                            scopedMutation.profile,
                            layerSource.repoId,
                            layerSource.path,
                            { enabled: true },
                        );
                    } else {
                        const runtime = ensureMultiRepoConfig(state.config);
                        runtime.layerSources[i].enabled = true;
                        syncLayerSourceToCapabilityConfig(state.config, runtime.layerSources[i]);
                    }
                }
                if (state.configPath) {
                    await persistConfig(state.configPath, state.config, state);
                }
                logInfo(
                    `Selected ${indices.length} layer(s).${scopedMutation ? ` (profile: ${scopedMutation.profileId})` : ''}`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Select layers failed: ${message}`);
            }
        }),
    );

    // ── metaflow.deselectAllLayers ─────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.deselectAllLayers', async (item?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }
            try {
                const projectedConfig = projectConfigForProfile(state.config);
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                const scopedMutation = getScopedLayerMutationProfile(state.config);
                for (const i of indices) {
                    const layerSource = layerSources[i];
                    if (!layerSource) {
                        continue;
                    }
                    if (scopedMutation) {
                        updateProfileLayerOverride(
                            scopedMutation.profile,
                            layerSource.repoId,
                            layerSource.path,
                            { enabled: false },
                        );
                    } else {
                        const runtime = ensureMultiRepoConfig(state.config);
                        runtime.layerSources[i].enabled = false;
                        syncLayerSourceToCapabilityConfig(state.config, runtime.layerSources[i]);
                    }
                }
                if (state.configPath) {
                    await persistConfig(state.configPath, state.config, state);
                }
                logInfo(
                    `Deselected ${indices.length} layer(s).${scopedMutation ? ` (profile: ${scopedMutation.profileId})` : ''}`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Deselect layers failed: ${message}`);
            }
        }),
    );

    // ── metaflow.toggleLayerArtifactType ───────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.toggleLayerArtifactType',
            async (item?: unknown, newState?: unknown) => {
                const ws = getWorkspace();
                if (!ws || !state.config) {
                    vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                    return;
                }

                const layerIndex =
                    typeof (item as { layerIndex?: unknown })?.layerIndex === 'number'
                        ? (item as { layerIndex: number }).layerIndex
                        : undefined;
                const artifactType =
                    typeof (item as { artifactType?: unknown })?.artifactType === 'string'
                        ? ((item as { artifactType: string })
                              .artifactType as ExcludableArtifactType)
                        : undefined;

                if (typeof layerIndex !== 'number' || !artifactType) {
                    logWarn('toggleLayerArtifactType: missing layerIndex or artifactType.');
                    return;
                }

                const projectedConfig = projectConfigForProfile(state.config);
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);

                if (!layerSources[layerIndex]) {
                    logWarn(`toggleLayerArtifactType: layer index ${layerIndex} not found.`);
                    return;
                }

                const isExcluded = newState === vscode.TreeItemCheckboxState.Unchecked;
                const layerSource = layerSources[layerIndex];
                const current = layerSource.excludedTypes ?? [];
                const nextExcludedTypes = isExcluded
                    ? current.includes(artifactType)
                        ? [...current]
                        : [...current, artifactType]
                    : current.filter((t) => t !== artifactType);

                const scopedMutation = applyLayerMutationToActiveProfile(
                    state.config,
                    layerSource.repoId,
                    layerSource.path,
                    { excludedTypes: nextExcludedTypes },
                );

                if (!scopedMutation.scopedToProfile) {
                    const runtime = ensureMultiRepoConfig(state.config);
                    const runtimeLayerSource = runtime.layerSources[layerIndex];
                    if (!runtimeLayerSource) {
                        logWarn(
                            `toggleLayerArtifactType: runtime layer index ${layerIndex} not found.`,
                        );
                        return;
                    }

                    runtimeLayerSource.excludedTypes =
                        nextExcludedTypes.length > 0 ? nextExcludedTypes : undefined;
                    syncLayerSourceToCapabilityConfig(state.config, runtimeLayerSource);

                    const capabilityTarget = resolveCapabilityInjectionTarget(
                        state.config,
                        state.repoMetadataById ?? {},
                        item,
                    );
                    if (capabilityTarget) {
                        capabilityTarget.capability.excludedTypes = runtimeLayerSource.excludedTypes
                            ? [...runtimeLayerSource.excludedTypes]
                            : undefined;
                    }
                }

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config, state);
                }

                logInfo(
                    `Layer ${layerSource.repoId}/${layerSource.path}: ${artifactType} ${isExcluded ? 'excluded' : 'included'}${scopedMutation.profileId ? ` (profile: ${scopedMutation.profileId})` : ''}`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            },
        ),
    );

    // ── metaflow.configureCapabilityInjection ─────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.configureCapabilityInjection',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws || !state.config || !state.configPath) {
                    vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                    return;
                }

                const requestedRepoId = extractRepoId(arg);
                if (requestedRepoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: Built-in capability injection is not configurable yet.',
                    );
                    return;
                }

                let target: ResolvedCapabilityInjectionTarget | undefined;
                try {
                    target = resolveCapabilityInjectionTarget(
                        state.config,
                        state.repoMetadataById,
                        arg,
                    );
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    logWarn(`Configure capability injection failed: ${message}`);
                    return;
                }

                if (!target) {
                    const { metadataRepos, layerSources } = ensureMultiRepoConfig(state.config);
                    const picks = layerSources
                        .map((layerSource) => {
                            const repo = metadataRepos.find(
                                (candidate) => candidate.id === layerSource.repoId,
                            );
                            if (!repo || layerSource.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                                return undefined;
                            }

                            const repoLabel = resolveRepoDisplayLabel(
                                repo.id,
                                repo.name,
                                repo.localPath,
                                state.repoMetadataById[repo.id]?.name,
                            );
                            const layerPath = normalizeCommandLayerPath(layerSource.path);
                            return {
                                label: layerPath === '.' ? `${repoLabel} / root` : layerPath,
                                description: repoLabel,
                                detail: `Current override: ${describeInjectionConfig(repo.capabilities?.find((candidate) => normalizeCommandLayerPath(candidate.path) === layerPath)?.injection)}`,
                                repoId: layerSource.repoId,
                                layerPath: layerSource.path,
                                layerIndex: layerSources.indexOf(layerSource),
                            };
                        })
                        .filter((pick): pick is NonNullable<typeof pick> => Boolean(pick));

                    const selected = await vscode.window.showQuickPick(picks, {
                        title: 'MetaFlow: Configure Capability Injection',
                        placeHolder: 'Select a capability to configure',
                        ignoreFocusOut: true,
                    });

                    if (!selected) {
                        return;
                    }

                    target = resolveCapabilityInjectionTarget(
                        state.config,
                        state.repoMetadataById,
                        selected,
                    );
                }

                if (!target) {
                    logWarn('Configure capability injection failed: capability target not found.');
                    return;
                }

                const mutation =
                    buildInjectionSelectionFromArg(arg) ??
                    (await promptForInjectionMutation(
                        target.capabilityLabel,
                        target.capability.injection,
                        'Clear all capability overrides',
                        (artifactType) =>
                            resolveInheritedInjectionMode(
                                artifactType,
                                target.repo.injection,
                                state.config?.injection,
                            ),
                    ));
                if (!mutation) {
                    return;
                }

                const nextInjection = applyInjectionMutationToCapabilityTarget(target, mutation);

                await persistConfig(state.configPath, state.config, state);
                logInfo(
                    `Configured capability injection for ${target.repo.id}/${target.capability.path}: ${describeInjectionConfig(nextInjection)}`,
                );
                void vscode.window.showInformationMessage(
                    `MetaFlow: Updated injection for ${target.capabilityLabel}.`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            },
        ),
    );

    // ── metaflow.configureRepoInjectionDefaults ───────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.configureRepoInjectionDefaults',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws || !state.config || !state.configPath) {
                    vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                    return;
                }

                let repoId = extractRepoId(arg);
                if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: Built-in capability injection is not configurable yet.',
                    );
                    return;
                }

                const { metadataRepos } = ensureMultiRepoConfig(state.config);
                if (!repoId) {
                    const selection = await vscode.window.showQuickPick(
                        metadataRepos
                            .filter((repo) => repo.id !== BUILT_IN_CAPABILITY_REPO_ID)
                            .map((repo) => ({
                                label: resolveRepoDisplayLabel(
                                    repo.id,
                                    repo.name,
                                    repo.localPath,
                                    state.repoMetadataById[repo.id]?.name,
                                ),
                                description: repo.id,
                                detail: `Current defaults: ${describeInjectionConfig(repo.injection)}`,
                                repoId: repo.id,
                            })),
                        {
                            title: 'MetaFlow: Configure Repository Injection Defaults',
                            placeHolder: 'Select a repository source to configure',
                            ignoreFocusOut: true,
                        },
                    );
                    repoId = selection?.repoId;
                }

                if (!repoId) {
                    return;
                }

                const repo = metadataRepos.find((candidate) => candidate.id === repoId);
                if (!repo) {
                    logWarn(`Configure repo injection failed: repoId "${repoId}" not found.`);
                    return;
                }

                const repoLabel = resolveRepoDisplayLabel(
                    repo.id,
                    repo.name,
                    repo.localPath,
                    state.repoMetadataById[repo.id]?.name,
                );
                const mutation =
                    buildInjectionSelectionFromArg(arg) ??
                    (await promptForInjectionMutation(
                        repoLabel,
                        repo.injection,
                        'Clear all repo defaults',
                        (artifactType) =>
                            resolveInheritedInjectionMode(
                                artifactType,
                                undefined,
                                state.config?.injection,
                            ),
                    ));
                if (!mutation) {
                    return;
                }

                repo.injection = applyInjectionMutation(repo.injection, mutation);

                await persistConfig(state.configPath, state.config, state);
                logInfo(
                    `Configured repo injection defaults for ${repo.id}: ${describeInjectionConfig(repo.injection)}`,
                );
                void vscode.window.showInformationMessage(
                    `MetaFlow: Updated injection defaults for ${repoLabel}.`,
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            },
        ),
    );

    for (const artifactType of INJECTION_KEYS) {
        for (const mode of ['settings', 'synchronize', 'inherit'] as const) {
            const mutation: InjectionMutationSelection = { artifactType, mode };
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    buildDirectsynchronizationCommandId(artifactType, mode),
                    async (arg?: unknown) => runDirectsynchronizationCommand(state, arg, mutation),
                ),
            );
        }
    }

    for (const mode of ['settings', 'synchronize', 'inherit'] as const) {
        const preset: InjectionPreset =
            mode === 'settings'
                ? 'all-settings'
                : mode === 'synchronize'
                  ? 'all-synchronize'
                  : 'clear-all';
        context.subscriptions.push(
            vscode.commands.registerCommand(
                buildGlobalInjectionPolicyCommandId(mode),
                async (arg?: unknown) => runDirectsynchronizationCommand(state, arg, { preset }),
            ),
        );
    }

    // ── metaflow.configureGlobalInjectionDefaults ────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.configureGlobalInjectionDefaults',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws || !state.config || !state.configPath) {
                    vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                    return;
                }

                const mutation =
                    buildInjectionSelectionFromArg(arg) ??
                    (await promptForInjectionMutation(
                        'global defaults',
                        state.config.injection,
                        'Clear all global defaults',
                        (artifactType) =>
                            resolveInheritedInjectionMode(artifactType, undefined, undefined),
                    ));
                if (!mutation) {
                    return;
                }

                state.config.injection = applyInjectionMutation(state.config.injection, mutation);

                await persistConfig(state.configPath, state.config, state);
                logInfo(
                    `Configured global injection defaults: ${describeInjectionConfig(state.config.injection)}`,
                );
                void vscode.window.showInformationMessage(
                    'MetaFlow: Updated global injection defaults.',
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            },
        ),
    );

    // ── metaflow.toggleRepoSource ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleRepoSource', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const repoId = extractRepoId(arg);
            const requestedCheckedState = extractLayerCheckedState(arg);

            if (typeof repoId !== 'string' || repoId.length === 0) {
                logWarn('Toggle repo source requires a valid repo id.');
                return;
            }

            try {
                const { metadataRepos } = ensureMultiRepoConfig(state.config);
                const repo = metadataRepos.find((r) => r.id === repoId);
                if (!repo) {
                    logWarn(`Toggle repo source failed: repoId "${repoId}" not found.`);
                    return;
                }

                const nextEnabled =
                    typeof requestedCheckedState === 'boolean'
                        ? requestedCheckedState
                        : repo.enabled !== false;
                repo.enabled = nextEnabled ? true : false;

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config, state);
                }

                logInfo(`Toggled repo source ${repoId}: ${repo.enabled ? 'enabled' : 'disabled'}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle repo source failed: ${message}`);
            }

            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        }),
    );

    // ── metaflow.rescanRepository ─────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.rescanRepository', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            let repoId = extractRepoId(arg);
            if (!repoId && state.config.metadataRepos && state.config.metadataRepos.length > 0) {
                const selection = await vscode.window.showQuickPick(
                    state.config.metadataRepos.map((repo) => ({
                        label: resolveRepoDisplayLabel(
                            repo.id,
                            repo.name,
                            repo.localPath,
                            state.repoMetadataById[repo.id]?.name,
                        ),
                        description: repo.id,
                        repoId: repo.id,
                    })),
                    {
                        title: 'MetaFlow: Rescan Repository',
                        placeHolder: 'Select repository source to rescan',
                        ignoreFocusOut: true,
                    },
                );
                repoId = selection?.repoId;
            }

            if (!repoId) {
                const message = 'MetaFlow: Rescan repository canceled (no repository selected).';
                logWarn(message);
                vscode.window.showWarningMessage(message);
                return;
            }

            logInfo(`Rescanning repository ${repoId}...`);

            const addedLayers = discoverAndPersistRepoLayers(state.config, ws.uri.fsPath, repoId);
            if (addedLayers > 0 && state.configPath) {
                await persistConfig(state.configPath, state.config, state);
                logInfo(`Discovered ${addedLayers} new layer(s) for ${repoId} and updated config.`);
            }

            await vscode.commands.executeCommand('metaflow.refresh', {
                skipRepoSync: true,
                forceDiscovery: true,
                forceDiscoveryRepoId: repoId,
            });

            const autoApplyEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('autoApply', true);

            const completionMessage = autoApplyEnabled
                ? `MetaFlow: Rescan complete for ${repoId}${addedLayers > 0 ? ` (${addedLayers} new layer(s))` : ''}.`
                : `MetaFlow: Rescan complete for ${repoId}${addedLayers > 0 ? ` (${addedLayers} new layer(s))` : ''}. Run Apply to synchronize .github changes (autoApply is off).`;

            logInfo(completionMessage);
            vscode.window.showInformationMessage(completionMessage);
        }),
    );

    // ── metaflow.checkRepoUpdates ────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.checkRepoUpdates', async (arg?: unknown) => {
            const scope = extractRepoScopeOptions(arg);
            const silent = scope.silent === true;

            const ws = getWorkspace();
            if (!ws || !state.config) {
                if (!silent) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: No config loaded. Run Refresh first.',
                    );
                }
                return { executed: false, reason: 'no-config' } satisfies CheckRepoUpdatesOutcome;
            }

            const gitRepos = resolveGitBackedRepoSources(state.config, ws.uri.fsPath);
            if (gitRepos.length === 0) {
                const message = 'MetaFlow: No git-backed repository sources are configured.';
                if (silent) {
                    logInfo(message);
                } else {
                    logWarn(message);
                }
                if (!silent) {
                    vscode.window.showInformationMessage(message);
                }
                return {
                    executed: false,
                    reason: 'no-git-repos',
                } satisfies CheckRepoUpdatesOutcome;
            }

            let targets: ResolvedRepoSource[] = [];
            if (scope.allRepos) {
                targets = gitRepos;
            } else if (scope.repoId) {
                const target = gitRepos.find((repo) => repo.repoId === scope.repoId);
                if (!target) {
                    const message = `MetaFlow: Repository "${scope.repoId}" is not git-backed or not found.`;
                    logWarn(message);
                    if (!silent) {
                        vscode.window.showWarningMessage(message);
                    }
                    return {
                        executed: false,
                        reason: 'repo-not-found',
                    } satisfies CheckRepoUpdatesOutcome;
                }
                targets = [target];
            } else if (gitRepos.length === 1) {
                targets = [gitRepos[0]];
            } else {
                const selection = await vscode.window.showQuickPick(
                    [
                        {
                            label: 'All Git-backed Repositories',
                            description: `${gitRepos.length} repositories`,
                            allRepos: true,
                        },
                        ...gitRepos.map((repo) => ({
                            label: repo.label,
                            description: repo.repoId,
                            detail: repo.localPath,
                            repoId: repo.repoId,
                        })),
                    ],
                    {
                        title: 'MetaFlow: Check Repository Updates',
                        placeHolder: 'Select repository to check, or check all',
                        ignoreFocusOut: true,
                    },
                );

                if (!selection) {
                    return;
                }

                if ('allRepos' in selection && selection.allRepos) {
                    targets = gitRepos;
                } else if ('repoId' in selection && selection.repoId) {
                    const picked = gitRepos.find((repo) => repo.repoId === selection.repoId);
                    if (picked) {
                        targets = [picked];
                    }
                }
            }

            if (targets.length === 0) {
                return { executed: false, reason: 'no-targets' } satisfies CheckRepoUpdatesOutcome;
            }

            const runCheck = async (): Promise<CheckRepoUpdatesOutcome> => {
                const { nonGitCount, summaryCounts } = await refreshRepoSyncStatusCache(
                    state,
                    targets,
                );

                state.onDidChange.fire();

                const fragments = [
                    `up-to-date: ${summaryCounts.upToDate}`,
                    `behind: ${summaryCounts.behind}`,
                    `ahead: ${summaryCounts.ahead}`,
                    `diverged: ${summaryCounts.diverged}`,
                    `unknown: ${summaryCounts.unknown}`,
                ];
                if (nonGitCount > 0) {
                    fragments.push(`non-git: ${nonGitCount}`);
                }

                const message = `MetaFlow: Update check complete (${fragments.join(', ')}).`;
                logInfo(message);
                if (!silent) {
                    vscode.window.showInformationMessage(message);
                }

                return { executed: true };
            };

            if (silent) {
                return await runCheck();
            } else {
                return await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `MetaFlow: Checking ${targets.length} repository update${targets.length === 1 ? '' : 's'}...`,
                    },
                    runCheck,
                );
            }
        }),
    );

    // ── metaflow.offerGitRemotePromotion ─────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.offerGitRemotePromotion', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.configPath) {
                return;
            }

            const workingConfig = cloneConfig(state.config);
            const candidates = resolveUntrackedLocalRepoSources(workingConfig, ws.uri.fsPath);
            if (candidates.length === 0) {
                return;
            }

            const promoted: string[] = [];
            const suppressions = readGitRemotePromotionSuppressions(context);
            let suppressionsChanged = false;

            for (const candidate of candidates) {
                const remotes = await discoverGitRemotes(candidate.localPath);
                if (remotes.length === 0) {
                    continue;
                }

                const suppressionKey = buildGitRemotePromotionSuppressionKey(candidate);
                const signature = buildGitRemotePromotionSignature(remotes);
                if (suppressions[suppressionKey] === signature) {
                    continue;
                }

                const action = await vscode.window.showInformationMessage(
                    `MetaFlow: Repository source "${candidate.repoId}" is a local git repo with ${remotes.length} remote${remotes.length === 1 ? '' : 's'} but no configured URL. Promote it to a git-backed source?`,
                    'Promote',
                    'Skip',
                );

                if (action === 'Skip') {
                    suppressions[suppressionKey] = signature;
                    suppressionsChanged = true;
                    continue;
                }

                if (action !== 'Promote') {
                    continue;
                }

                if (Object.prototype.hasOwnProperty.call(suppressions, suppressionKey)) {
                    delete suppressions[suppressionKey];
                    suppressionsChanged = true;
                }

                const selectedRemote = await pickRemoteForPromotion(candidate, remotes);
                if (!selectedRemote) {
                    continue;
                }

                if (!setRepoRemoteUrl(workingConfig, candidate.repoId, selectedRemote.url)) {
                    continue;
                }

                promoted.push(`${candidate.repoId} -> ${selectedRemote.name}`);
                logInfo(
                    `Promoted repository source ${candidate.repoId} to git-backed using remote ${selectedRemote.name} (${selectedRemote.url}).`,
                );
            }

            if (suppressionsChanged) {
                await context.workspaceState.update(
                    GIT_REMOTE_PROMOTION_SUPPRESSIONS_STATE_KEY,
                    suppressions,
                );
            }

            if (promoted.length === 0) {
                return;
            }

            state.config = workingConfig;
            await persistConfig(state.configPath, workingConfig, state);
            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });

            vscode.window.showInformationMessage(
                `MetaFlow: Promoted ${promoted.length} repository source${promoted.length === 1 ? '' : 's'} to git-backed tracking.`,
            );
        }),
    );

    // ── metaflow.offerGitIgnoreStateConfiguration ─────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.offerGitIgnoreStateConfiguration', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                return;
            }

            const gitIgnorePath = path.join(ws.uri.fsPath, '.gitignore');
            let gitIgnoreContent: string;
            try {
                gitIgnoreContent = await fsp.readFile(gitIgnorePath, 'utf-8');
            } catch {
                gitIgnoreContent = '';
            }
            const mode = detectMetaflowGitIgnoreMode(gitIgnoreContent);
            if (mode !== 'none') {
                return;
            }

            const suppressions = readWorkspaceSuppressions(
                context,
                METAFLOW_GITIGNORE_PROMPT_SUPPRESSIONS_STATE_KEY,
            );
            const suppressionKey = buildWorkspaceScopedSuppressionKey(ws.uri.fsPath);
            const signature = computeGitIgnorePromptSignature(gitIgnoreContent);
            if (suppressions[suppressionKey] === signature) {
                return;
            }

            const action = await vscode.window.showInformationMessage(
                'MetaFlow: No .gitignore entry is configured for managed state. Choose what to ignore.',
                'Ignore .metaflow/',
                'Ignore .metaflow/state.json',
                'Later',
            );

            if (action === 'Later') {
                suppressions[suppressionKey] = signature;
                await context.workspaceState.update(
                    METAFLOW_GITIGNORE_PROMPT_SUPPRESSIONS_STATE_KEY,
                    suppressions,
                );
                return;
            }

            if (!action) {
                return;
            }

            const updatedContent = ensureMetaflowGitIgnoreEntry(
                gitIgnoreContent,
                action === 'Ignore .metaflow/' ? 'directory' : 'stateFile',
            );
            if (updatedContent !== gitIgnoreContent) {
                await fsp.writeFile(gitIgnorePath, updatedContent, 'utf-8');
            }

            if (Object.prototype.hasOwnProperty.call(suppressions, suppressionKey)) {
                delete suppressions[suppressionKey];
                await context.workspaceState.update(
                    METAFLOW_GITIGNORE_PROMPT_SUPPRESSIONS_STATE_KEY,
                    suppressions,
                );
            }
        }),
    );

    // ── metaflow.pullRepository ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.pullRepository', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            const gitRepos = resolveGitBackedRepoSources(state.config, ws.uri.fsPath);
            if (gitRepos.length === 0) {
                const message = 'MetaFlow: No git-backed repository sources are configured.';
                logWarn(message);
                vscode.window.showInformationMessage(message);
                return;
            }

            const repoId = extractRepoId(arg);
            let target: ResolvedRepoSource | undefined;
            if (repoId) {
                target = gitRepos.find((repo) => repo.repoId === repoId);
                if (!target) {
                    const message = `MetaFlow: Repository "${repoId}" is not git-backed or not found.`;
                    logWarn(message);
                    vscode.window.showWarningMessage(message);
                    return;
                }
            } else {
                target = await pickGitBackedRepo(
                    gitRepos,
                    'MetaFlow: Pull Repository',
                    'Select git-backed repository to pull',
                );
                if (!target) {
                    return;
                }
            }

            const pullResult = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `MetaFlow: Pulling updates for ${target.repoId}...`,
                },
                async () => pullRepositoryFastForward(target.localPath),
            );

            if (!pullResult.ok) {
                const failureMessage = `MetaFlow: Pull failed for ${target.repoId}. ${pullResult.message}`;
                logWarn(failureMessage);
                state.repoSyncByRepoId[target.repoId] = {
                    state: 'unknown',
                    lastCheckedAt: new Date().toISOString(),
                    error: pullResult.message,
                };
                state.onDidChange.fire();
                vscode.window.showWarningMessage(failureMessage);
                return;
            }

            logInfo(`MetaFlow: Pull complete for ${target.repoId}. ${pullResult.message}`);

            await vscode.commands.executeCommand('metaflow.refresh', {
                forceDiscovery: true,
                forceDiscoveryRepoId: target.repoId,
            });
            await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                repoId: target.repoId,
                silent: true,
            });

            vscode.window.showInformationMessage(`MetaFlow: Pulled updates for ${target.repoId}.`);
        }),
    );

    // ── metaflow.addRepoSource ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.addRepoSource', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.configPath) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const modePick = await vscode.window.showQuickPick(
                [
                    {
                        label: 'Use Existing Directory',
                        description: 'Discover layers from existing .github directories',
                        mode: 'existing' as InitSourceMode,
                    },
                    {
                        label: 'Clone from Git URL',
                        description: 'Clone metadata repo locally, then discover layers',
                        mode: 'url' as InitSourceMode,
                    },
                ],
                {
                    title: 'MetaFlow: Add Repository Source',
                    placeHolder: 'Choose metadata source',
                    ignoreFocusOut: true,
                },
            );

            if (!modePick) {
                return;
            }

            const selection = await resolveSourceSelection(modePick.mode, ws);
            if (!selection) {
                return;
            }

            const multiRepoConfig = ensureMultiRepoConfig(state.config);
            const existingIds = new Set(multiRepoConfig.metadataRepos.map((repo) => repo.id));
            const sourceLocalPath = toConfigLocalPath(ws, selection.metadataRoot.fsPath);
            const repoId = deriveRepoId(sourceLocalPath, selection.metadataUrl, existingIds);

            multiRepoConfig.metadataRepos.push({
                id: repoId,
                name: repoId,
                localPath: sourceLocalPath,
                ...(selection.metadataUrl ? { url: selection.metadataUrl } : {}),
                enabled: true,
            });

            const seenLayerKeys = new Set(
                multiRepoConfig.layerSources.map((layer) => `${layer.repoId}:${layer.path}`),
            );
            for (const layerPath of selection.layers) {
                const layerKey = `${repoId}:${layerPath}`;
                if (seenLayerKeys.has(layerKey)) {
                    continue;
                }
                multiRepoConfig.layerSources.push({
                    repoId,
                    path: layerPath,
                    enabled: false,
                });
                seenLayerKeys.add(layerKey);
            }

            await persistConfig(state.configPath, state.config, state);
            logInfo(
                `Added repo source ${repoId} with ${selection.layers.length} discovered layer(s).`,
            );
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');
        }),
    );

    // ── metaflow.removeRepoSource ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.removeRepoSource', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.configPath) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            try {
                ensureMultiRepoConfig(state.config);
            } catch {
                vscode.window.showWarningMessage(
                    'MetaFlow: Remove repo source requires a valid config with at least one repository.',
                );
                return;
            }

            const repoIdFromArg = extractRepoId(arg);
            const selectedRepo = repoIdFromArg
                ? { repoId: repoIdFromArg }
                : await vscode.window.showQuickPick(
                      state.config.metadataRepos!.map((repo) => ({
                          label: resolveRepoDisplayLabel(
                              repo.id,
                              repo.name,
                              repo.localPath,
                              state.repoMetadataById[repo.id]?.name,
                          ),
                          description: repo.id,
                          repoId: repo.id,
                      })),
                      {
                          title: 'MetaFlow: Remove Repository Source',
                          placeHolder: 'Select repository source to remove',
                          ignoreFocusOut: true,
                      },
                  );
            const repoId = selectedRepo?.repoId;

            if (!repoId) {
                return;
            }

            const repo = state.config.metadataRepos!.find((candidate) => candidate.id === repoId);
            if (!repo) {
                logWarn(`Remove repo source failed: repoId "${repoId}" not found.`);
                return;
            }

            const repoLabel = resolveRepoDisplayLabel(
                repo.id,
                repo.name,
                repo.localPath,
                state.repoMetadataById[repo.id]?.name,
            );

            const layerCount = state.config.layerSources!.filter(
                (layer) => layer.repoId === repoId,
            ).length;
            const confirmation = await vscode.window.showWarningMessage(
                `Remove source "${repoLabel}" and ${layerCount} associated layer(s)?`,
                'Remove',
                'Cancel',
            );

            if (confirmation !== 'Remove') {
                return;
            }

            state.config.metadataRepos = state.config.metadataRepos!.filter(
                (candidate) => candidate.id !== repoId,
            );
            state.config.layerSources = state.config.layerSources!.filter(
                (layer) => layer.repoId !== repoId,
            );

            const removedLastRepo = state.config.metadataRepos.length === 0;
            if (removedLastRepo) {
                const cleanupResult = await removeKnownMetaFlowFilesAndPruneDirectory(
                    ws.uri.fsPath,
                );
                await clearManagedWorkspaceSettings(ws, context);
                clearDiagnostics(diagnosticCollection);
                state.config = undefined;
                state.configPath = undefined;
                state.activeProfile = undefined;
                state.baseProfileFiles = [];
                state.effectiveFiles = [];
                state.capabilityByLayer = {};
                state.repoMetadataById = {};
                state.capabilityWarnings = [];
                state.treeSummaryCache = undefined;
                invalidateRepoSyncStatus(state);
                updateStatusBar('idle');
                state.onDidChange.fire();
                logInfo(
                    `Removed final repo source ${repoId}; cleaned ${cleanupResult.removedKnownFileCount} known .metaflow file(s). ` +
                        `Directory removed: ${cleanupResult.removedDirectory}.`,
                );
                vscode.window.showInformationMessage(buildMetaFlowCleanupMessage(cleanupResult));
                return;
            }

            await persistConfig(state.configPath, state.config, state);
            logInfo(`Removed repo source ${repoId} and ${layerCount} layer(s).`);
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        }),
    );

    // ── metaflow.openConfig ────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.openConfig', async () => {
            const ws = getWorkspace();
            if (!ws) {
                vscode.window.showWarningMessage('MetaFlow: No workspace folder open.');
                return;
            }

            const result = loadConfig(ws.uri.fsPath);
            if (result.ok) {
                if (result.migrated) {
                    await persistConfig(result.configPath, result.config, state);
                    for (const message of result.migrationMessages ?? []) {
                        logInfo(message);
                    }
                    void vscode.window.showInformationMessage(
                        'MetaFlow: Configuration was automatically migrated to metadataRepos[*].capabilities.',
                    );
                }

                const doc = await vscode.workspace.openTextDocument(result.configPath);
                await vscode.window.showTextDocument(doc);
            } else if (result.configPath) {
                const doc = await vscode.workspace.openTextDocument(result.configPath);
                await vscode.window.showTextDocument(doc);
            } else {
                vscode.window.showWarningMessage('MetaFlow: No config file found.');
            }
        }),
    );

    // ── metaflow.openCapabilityDetails ─────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.openCapabilityDetails', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            const target = resolveCapabilityDetailTarget(
                state.config,
                ws.uri.fsPath,
                state.builtInCapability,
                (arg ?? {}) as { layerIndex?: number; repoId?: string; skipPreview?: boolean },
            );

            if (!target) {
                vscode.window.showWarningMessage(
                    'MetaFlow: Could not resolve capability details for the selected item.',
                );
                return;
            }

            const model = await loadCapabilityDetailModel(target, state.treeSummaryCache);
            return capabilityDetailsPanel.show(model, {
                layerIndex: target.layerIndex,
                repoId: target.repoId,
            });
        }),
    );

    // ── metaflow.toggleFilesViewMode ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleFilesViewMode', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const currentMode = readManagedViewsState(ws.uri.fsPath).filesViewMode;
            const nextMode: FilesViewMode = currentMode === 'unified' ? 'repoTree' : 'unified';

            writeManagedViewsState(ws.uri.fsPath, { filesViewMode: nextMode });
            await vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', nextMode);
            logInfo(`Effective Files view mode set to: ${nextMode}`);
        }),
    );

    // ── metaflow.toggleLayersViewMode ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleLayersViewMode', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const currentMode = readManagedViewsState(ws.uri.fsPath).layersViewMode;
            const nextMode: LayersViewMode = currentMode === 'flat' ? 'tree' : 'flat';

            writeManagedViewsState(ws.uri.fsPath, { layersViewMode: nextMode });
            await vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', nextMode);
            logInfo(`Layers view mode set to: ${nextMode}`);
        }),
    );

    // ── metaflow.initConfig ────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.initConfig', async () => {
            showOutputChannel();
            logInfo('metaflow.initConfig invoked.');

            try {
                const folders = vscode.workspace.workspaceFolders;
                if (!folders || folders.length === 0) {
                    const openAction = 'Open Folder';
                    const choice = await vscode.window.showWarningMessage(
                        'MetaFlow: Open a folder or workspace before initializing configuration.',
                        openAction,
                    );
                    if (choice === openAction) {
                        await vscode.commands.executeCommand('vscode.openFolder');
                    }
                    return;
                }

                let ws: vscode.WorkspaceFolder;
                if (folders.length === 1) {
                    ws = folders[0];
                } else {
                    const picked = await vscode.window.showWorkspaceFolderPick({
                        placeHolder: 'Select the workspace folder to initialize MetaFlow in',
                    });
                    if (!picked) {
                        return;
                    }
                    ws = picked;
                }

                const initialized = await initConfig(ws);
                if (!initialized) {
                    return;
                }

                state.builtInCapability = await loadBuiltInCapabilityRuntimeState(context);
                state.builtInCapability = await offerBuiltInCapabilityOnboarding(
                    context,
                    state.builtInCapability,
                );

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'MetaFlow: Initializing configuration…',
                    },
                    async () => {
                        await vscode.commands.executeCommand('metaflow.refresh', {
                            skipRepoSync: true,
                        });
                    },
                );

                await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');
                await vscode.commands.executeCommand('metaflow.offerGitIgnoreStateConfiguration');
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`initConfig failed: ${msg}`);
                vscode.window.showErrorMessage(
                    `MetaFlow: Initialize Configuration failed — ${msg}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.initMetaFlowAiMetadata', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const setupMode = await vscode.window.showQuickPick(
                [
                    {
                        label: 'Synchronize MetaFlow capability files into .github',
                        description:
                            'Overwrite synchronized MetaFlow capability files in this workspace.',
                        mode: 'synchronize' as const,
                    },
                    {
                        label: 'Enable built-in MetaFlow capability (settings-only)',
                        description:
                            'Use bundled MetaFlow capability files without modifying .metaflow/config.jsonc.',
                        mode: 'builtin' as const,
                    },
                ],
                {
                    title: 'MetaFlow: Initialize MetaFlow Capability',
                    placeHolder: 'Choose how to initialize MetaFlow capability support',
                    ignoreFocusOut: true,
                },
            );

            if (!setupMode) {
                return;
            }

            if (setupMode.mode === 'synchronize') {
                const synchronized = await scaffoldMetaFlowAiMetadata({
                    workspaceRoot: ws.uri.fsPath,
                    extensionPath: context.extensionPath,
                    overwriteExisting: true,
                });

                if (!synchronized) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: MetaFlow capability assets are unavailable in this extension build.',
                    );
                    return;
                }

                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    {
                        enabled: false,
                        layerEnabled: true,
                        synchronizedFiles: synchronized.writtenFiles,
                    },
                );

                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
                vscode.window.showInformationMessage(
                    `MetaFlow: Synchronized ${synchronized.writtenFiles.length} MetaFlow capability file(s) into .github.`,
                );
                return;
            }

            state.builtInCapability = await enableBuiltInCapabilityInSettingsMode(
                context,
                state.builtInCapability,
            );

            vscode.window.showInformationMessage(
                'MetaFlow: Built-in MetaFlow capability enabled (settings-only mode).',
            );
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.removeMetaFlowCapability', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            state.builtInCapability = await loadBuiltInCapabilityRuntimeState(context);

            const hasBuiltInMode = state.builtInCapability.enabled;
            const trackedFileCount = state.builtInCapability.synchronizedFiles.length;

            if (!hasBuiltInMode && trackedFileCount === 0) {
                vscode.window.showInformationMessage(
                    'MetaFlow: No built-in mode or synchronized MetaFlow capability files are currently tracked.',
                );
                return;
            }

            const message = hasBuiltInMode
                ? `Remove built-in MetaFlow capability source${trackedFileCount > 0 ? ` and ${trackedFileCount} tracked synchronized file(s)` : ''}?`
                : `Remove ${trackedFileCount} tracked synchronized MetaFlow capability file(s) from .github?`;

            const confirmation = await vscode.window.showWarningMessage(
                message,
                'Remove',
                'Cancel',
            );
            if (confirmation !== 'Remove') {
                return;
            }

            if (hasBuiltInMode) {
                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    { enabled: false, layerEnabled: false },
                );
            }

            let removed = 0;
            if (trackedFileCount > 0) {
                removed = await removeSynchronizedCapabilityFiles(
                    ws.uri.fsPath,
                    state.builtInCapability.synchronizedFiles,
                );
                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    {
                        layerEnabled: false,
                        synchronizedFiles: [],
                    },
                );
            }

            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            if (hasBuiltInMode && trackedFileCount > 0) {
                vscode.window.showInformationMessage(
                    `MetaFlow: Removed built-in capability source and ${removed} tracked synchronized file(s).`,
                );
                return;
            }
            if (hasBuiltInMode) {
                vscode.window.showInformationMessage(
                    'MetaFlow: Removed built-in MetaFlow capability source.',
                );
                return;
            }
            vscode.window.showInformationMessage(
                `MetaFlow: Removed ${removed} tracked synchronized MetaFlow capability file(s).`,
            );
        }),
    );

    // ── metaflow.promote ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.promote', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const managedState = loadManagedState(ws.uri.fsPath);
            const driftResults = checkAllDrift(ws.uri.fsPath, '.github', managedState);
            const drifted = driftResults.filter((r) => r.status === 'drifted');

            if (drifted.length === 0) {
                vscode.window.showInformationMessage('MetaFlow: No drifted files detected.');
                return;
            }

            showOutputChannel();
            logInfo('=== Drift Report (Promotion Candidates) ===');
            for (const d of drifted) {
                logInfo(`  ${d.relativePath}`);
            }
            logInfo(`${drifted.length} file(s) drifted. Copy changes to metadata repo manually.`);
        }),
    );
}
