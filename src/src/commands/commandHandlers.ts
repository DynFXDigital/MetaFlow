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
import { createHash, randomUUID } from 'crypto';
import type {
    ApplyResult,
    CapabilityPluginCatalogEntry,
    CapabilityWarning,
    ConfigError,
    GovernanceComplianceResult,
    GovernanceContract,
    GovernanceViolation,
    ResolveLayersCache,
    SurfacedFileConflict,
} from '@metaflow/engine';
import {
    evaluateGovernanceCompliance,
    loadConfig,
    loadGovernanceContract,
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
    buildAgentPluginCatalog,
    buildCapabilityPluginMarketplaceManifest,
    resolvePathFromWorkspace,
    applyFilters,
    applyProfile,
    classifyFiles,
    EffectiveFile,
    apply,
    clean,
    preview,
    computePluginRootPaths,
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    checkAllDrift,
    applyCapabilityReferenceRepairs,
    buildCapabilityIdentityIndexFromConfig,
    capabilityIdentityIndexToManagedState,
    loadManagedState,
    managedStateToCapabilityIdentityIndex,
    reconcileConfiguredCapabilityReferences,
    saveManagedState,
    toAuthoredConfig,
} from '@metaflow/engine';
import {
    formatDiagnosticLocation,
    publishConfigDiagnostics,
    publishConfigWarningDiagnostics,
    publishGovernanceComplianceDiagnostics,
    publishGovernanceDiagnostics,
    clearDiagnostics,
} from '../diagnostics/configDiagnostics';
import { buildDiagnosticsSnapshot } from '../diagnostics/diagnosticsSnapshot';
import { logDebug, logInfo, logWarn, logError, showOutputChannel } from '../views/outputChannel';
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
    normalizeAiMetadataAutoApplyMode,
    projectConfigForProfile,
    type FilesViewMode,
    type LayersViewMode,
    type AiMetadataAutoApplyMode,
    normalizeAndDeduplicateLayerPaths,
    updateProfileLayerOverride,
    writeManagedViewsState,
    type RefreshCommandOptions,
} from './commandHelpers';
import { ensureMetaFlowAiMetadataCache, scaffoldMetaFlowAiMetadata } from './starterMetadata';
import {
    checkRepoSyncStatus,
    pullRepositoryFastForward,
    pushRepository,
    RepoSyncStatus,
    runGitCommand,
} from './repoSyncStatus';
import { loadCapabilityDetailModel, resolveCapabilityDetailTarget } from './capabilityDetails';
import { createRefreshCoordinator } from '../refreshCoordinator';
import { createPerformanceTimer } from '../performanceTelemetry';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    BUILT_IN_CAPABILITY_STATE_KEY,
    BuiltInCapabilityRuntimeState,
    BuiltInCapabilityWorkspaceState,
    isBuiltInCapabilityActive,
    isBuiltInCapabilityEnabled,
    normalizeBuiltInLayerPath,
    readBuiltInCapabilityRuntimeState,
    resolveBuiltInCapabilityDisplayName,
    resolveBuiltInLayerEnabled,
    resolveBuiltInRepoEnabled,
    sanitizeBuiltInInjectionConfig,
    sanitizeBuiltInLayerStates,
    sanitizeSynchronizedFiles,
} from '../builtInCapability';
import { CapabilityDetailsPanelManager } from '../views/capabilityDetailsPanel';
import {
    computeLegacySettingsEntriesFromEffectiveFiles,
    mergeSettingsValue,
    pruneBundledMetaFlowSettingsEntries,
    removeSettingsEntries,
    resolveTarget,
} from './settingsTargetHelpers';

function getConfigMigrationNoticeMessage(): string {
    return 'MetaFlow: Configuration was automatically migrated. Check the output channel for details.';
}

function mergeRefreshCommandOptions(
    current: RefreshCommandOptions,
    next: RefreshCommandOptions,
): RefreshCommandOptions {
    const mergeBoolean = (left: boolean | undefined, right: boolean | undefined): boolean | undefined =>
        left === true || right === true ? true : left === false || right === false ? false : undefined;

    return {
        skipAutoApply: mergeBoolean(current.skipAutoApply, next.skipAutoApply),
        skipBuiltInAutoApply: mergeBoolean(current.skipBuiltInAutoApply, next.skipBuiltInAutoApply),
        skipConfigMaintenance: mergeBoolean(current.skipConfigMaintenance, next.skipConfigMaintenance),
        skipRepoSync: mergeBoolean(current.skipRepoSync, next.skipRepoSync),
        skipSettingsInjection: mergeBoolean(current.skipSettingsInjection, next.skipSettingsInjection),
        skipLoadingState: mergeBoolean(current.skipLoadingState, next.skipLoadingState),
        skipStateChangeEvent: mergeBoolean(current.skipStateChangeEvent, next.skipStateChangeEvent),
        preferStateConfig: mergeBoolean(current.preferStateConfig, next.preferStateConfig),
        nonInteractive: mergeBoolean(current.nonInteractive, next.nonInteractive),
        forceDiscovery: mergeBoolean(current.forceDiscovery, next.forceDiscovery),
        forceDiscoveryRepoId: next.forceDiscoveryRepoId ?? current.forceDiscoveryRepoId,
    };
}
import { resolveRepoDisplayLabel } from '../repoDisplayLabel';
import { buildTreeSummaryCache, TreeSummaryCache } from '../treeSummary';

const INJECTION_KEYS = ['instructions', 'prompts', 'skills', 'agents', 'hooks'] as const;
type InjectionKey = (typeof INJECTION_KEYS)[number];

const DEFAULT_INJECTION_MODE: Record<InjectionKey, 'settings' | 'synchronize' | 'plugin'> = {
    instructions: 'plugin',
    prompts: 'settings',
    skills: 'plugin',
    agents: 'plugin',
    hooks: 'plugin',
};

const INJECTION_OVERRIDE_SETTING_KEY = 'metaflow.injection.modes';
const SETTINGS_INJECTION_STATE_KEY = 'metaflow.settingsInjection.v1';
const AI_METADATA_AUTO_APPLY_MODE_SETTING_KEY = 'aiMetadataAutoApplyMode';
const AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY = 'autoAcceptRefreshUpdates';
const AUTO_ACCEPT_REFRESH_UPDATES_ACTION = 'Always Update Automatically';
const COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH = path.join(
    '.github',
    'copilot',
    'settings.local.json',
);

const LEGACY_INJECTION_SETTING_KEYS: Record<InjectionKey, string> = {
    instructions: 'metaflow.injection.instructionsMode',
    prompts: 'metaflow.injection.promptsMode',
    skills: 'metaflow.injection.skillsMode',
    agents: 'metaflow.injection.agentsMode',
    hooks: 'metaflow.injection.hooksMode',
};

const TRANSIENT_FILE_LOCK_ERROR_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

async function retryTransientFileLock<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 5;
    let delayMs = 25;

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await operation();
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (!code || !TRANSIENT_FILE_LOCK_ERROR_CODES.has(code) || attempt >= maxAttempts) {
                throw err;
            }

            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
        }
    }
}

function formatInjectionModesSummary(config: MetaFlowConfig | undefined): string {
    return INJECTION_KEYS.map(
        (key) => `${key}=${config?.injection?.[key] ?? DEFAULT_INJECTION_MODE[key]}`,
    ).join(', ');
}

export function formatManagedSettingsStateSummary(context: vscode.ExtensionContext): {
    target: string;
    keys: string;
} {
    const state = readManagedSettingsState(context);
    const effectiveTarget = state.effectiveTarget ?? 'none';
    const managedKeys = Array.from(
        new Set(
            Object.values(state.managedEntries ?? {}).flatMap((entries) => Object.keys(entries)),
        ),
    ).sort((left, right) => left.localeCompare(right));

    return {
        target: effectiveTarget,
        keys:
            managedKeys.length > 0 || (state.managedPluginUris?.length ?? 0) > 0
                ? [
                      ...managedKeys,
                      ...((state.managedPluginUris?.length ?? 0) > 0
                          ? [`enabledPlugins=${state.managedPluginUris!.length}`]
                          : []),
                  ].join(', ')
                : 'none',
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

export function resolveSettingsEntryTarget(
    key: string,
    target: ResolvedInjectionTarget,
): ResolvedInjectionTarget {
    if (key === 'chat.pluginLocations') {
        return {
            requested: 'user',
            effective: 'user',
            configurationTarget: vscode.ConfigurationTarget.Global,
        };
    }

    return target;
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
    /** MetaFlow-managed plugin root URIs enabled via Copilot plugin settings. */
    managedPluginUris?: string[];
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

function getManagedViewWorkspace(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('MetaFlow: No workspace folder open.');
        return undefined;
    }

    return folders[0];
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
    const sanitized: ManagedSettingsState = {};
    if (state.requestedTarget) {
        sanitized.requestedTarget = state.requestedTarget;
    }
    if (state.effectiveTarget) {
        sanitized.effectiveTarget = state.effectiveTarget;
    }
    if (state.managedEntries) {
        sanitized.managedEntries = state.managedEntries;
    }
    const managedPluginUris = normalizeManagedPluginUris(state.managedPluginUris);
    if (managedPluginUris.length > 0) {
        sanitized.managedPluginUris = managedPluginUris;
    }

    await context.workspaceState.update(SETTINGS_INJECTION_STATE_KEY, sanitized);
}

function getCopilotPluginSettingsPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH);
}

export async function ensureLocalGitExcludeEntry(
    workspaceRoot: string,
    relativePath: string,
): Promise<void> {
    try {
        const dotGitPath = path.join(workspaceRoot, '.git');
        const dotGitStat = await fsp.stat(dotGitPath);
        let gitDir = dotGitPath;

        if (dotGitStat.isFile()) {
            const dotGitContent = await fsp.readFile(dotGitPath, 'utf-8');
            const gitDirLine = dotGitContent
                .split(/\r?\n/)
                .find((line) => line.toLowerCase().startsWith('gitdir:'));
            const rawGitDir = gitDirLine?.slice('gitdir:'.length).trim();
            if (!rawGitDir) {
                return;
            }
            gitDir = path.isAbsolute(rawGitDir)
                ? rawGitDir
                : path.resolve(workspaceRoot, rawGitDir);
        } else if (!dotGitStat.isDirectory()) {
            return;
        }

        const excludePath = path.join(gitDir, 'info', 'exclude');
        const normalizedEntry = relativePath.replace(/\\/g, '/');
        const existing = await fsp.readFile(excludePath, 'utf-8').catch(() => '');
        const hasEntry = existing
            .split(/\r?\n/)
            .map((line) => line.trim())
            .includes(normalizedEntry);
        if (hasEntry) {
            return;
        }

        const trailingNewline = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
        await fsp.mkdir(path.dirname(excludePath), { recursive: true });
        await fsp.writeFile(
            excludePath,
            `${existing}${trailingNewline}${normalizedEntry}\n`,
            'utf-8',
        );
    } catch {
        // Best-effort local ignore protection for machine-local Copilot plugin settings.
    }
}

function normalizeManagedPluginUris(pluginUris: string[] | undefined): string[] {
    return Array.from(new Set((pluginUris ?? []).filter((value) => value.trim().length > 0))).sort(
        (left, right) => left.localeCompare(right),
    );
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isBundledMetaFlowPluginUri(value: string): boolean {
    return value
        .replace(/\\/g, '/')
        .toLowerCase()
        .includes('/globalstorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata');
}

function isPathWithin(candidatePath: string, rootPath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return (
        relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    );
}

function fileUriToFsPath(uri: string): string | undefined {
    try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:') {
            return undefined;
        }

        let fsPath = decodeURIComponent(parsed.pathname);
        if (/^\/[A-Za-z]:\//.test(fsPath)) {
            fsPath = fsPath.slice(1);
        }
        return path.normalize(fsPath);
    } catch {
        return undefined;
    }
}

function collectConfiguredMetadataRepoRoots(
    config: MetaFlowConfig,
    workspaceRoot: string,
    builtInCapability: BuiltInCapabilityRuntimeState,
): string[] {
    const roots = new Set<string>();

    if (config.metadataRepos) {
        for (const repo of config.metadataRepos) {
            roots.add(path.normalize(resolvePathFromWorkspace(workspaceRoot, repo.localPath)));
        }
    }

    if (config.metadataRepo) {
        roots.add(
            path.normalize(resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath)),
        );
    }

    if (builtInCapability.sourceRoot) {
        roots.add(path.normalize(builtInCapability.sourceRoot));
    }

    return Array.from(roots).sort((left, right) => left.localeCompare(right));
}

function filterSettingsEligibleEffectiveFiles(
    effectiveFiles: EffectiveFile[],
    builtInCapability: BuiltInCapabilityRuntimeState,
): EffectiveFile[] {
    if (isBuiltInCapabilityEnabled(builtInCapability)) {
        return effectiveFiles;
    }

    const builtInRoot = builtInCapability.sourceRoot
        ? path.normalize(builtInCapability.sourceRoot)
        : undefined;

    return effectiveFiles.filter((file) => {
        if (file.sourceRepo === BUILT_IN_CAPABILITY_REPO_ID) {
            return false;
        }

        if (builtInRoot && isPathWithin(path.normalize(file.sourcePath), builtInRoot)) {
            return false;
        }

        return true;
    });
}

async function updateManagedCopilotPluginSettings(
    workspaceRoot: string,
    previousManagedPluginUris: string[],
    nextManagedPluginUris: string[],
    configuredMetadataRepoRoots: string[] = [],
): Promise<void> {
    const settingsPath = getCopilotPluginSettingsPath(workspaceRoot);
    const normalizedPrevious = normalizeManagedPluginUris(previousManagedPluginUris);
    const normalizedNext = normalizeManagedPluginUris(nextManagedPluginUris);
    const normalizedConfiguredRoots = configuredMetadataRepoRoots.map((root) =>
        path.normalize(root),
    );

    let existing: string | undefined;
    try {
        existing = await fsp.readFile(settingsPath, 'utf-8');
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code !== 'ENOENT') {
            throw err;
        }
    }

    const nextEnabledPlugins = (() => {
        const enabledPlugins: Record<string, boolean> = {};

        if (existing !== undefined) {
            const parseErrors: jsonc.ParseError[] = [];
            const parsed = jsonc.parse(existing, parseErrors, {
                allowTrailingComma: true,
                disallowComments: false,
            });

            if (parseErrors.length > 0) {
                const first = parseErrors[0];
                throw new Error(
                    `${COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH} could not be parsed near offset ${first.offset}.`,
                );
            }

            if (
                parsed !== undefined &&
                (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            ) {
                throw new Error(
                    `${COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH} must contain a top-level JSON object.`,
                );
            }

            const parsedObject = (parsed ?? {}) as Record<string, unknown>;
            if (isBooleanRecord(parsedObject.enabledPlugins)) {
                for (const [pluginUri, enabled] of Object.entries(parsedObject.enabledPlugins)) {
                    enabledPlugins[pluginUri] = enabled;
                }
            }
        }

        for (const pluginUri of normalizedPrevious) {
            delete enabledPlugins[pluginUri];
        }

        const normalizedNextSet = new Set(normalizedNext);
        for (const pluginUri of Object.keys(enabledPlugins)) {
            const pluginPath = fileUriToFsPath(pluginUri);
            const isConfiguredMetadataPlugin =
                pluginPath !== undefined &&
                normalizedConfiguredRoots.some((root) => isPathWithin(pluginPath, root));
            if (
                !normalizedNextSet.has(pluginUri) &&
                (isBundledMetaFlowPluginUri(pluginUri) || isConfiguredMetadataPlugin)
            ) {
                delete enabledPlugins[pluginUri];
            }
        }

        for (const pluginUri of normalizedNext) {
            enabledPlugins[pluginUri] = true;
        }

        return Object.fromEntries(
            Object.entries(enabledPlugins).sort(([left], [right]) => left.localeCompare(right)),
        );
    })();

    if (existing === undefined) {
        if (Object.keys(nextEnabledPlugins).length === 0) {
            return;
        }

        await ensureLocalGitExcludeEntry(workspaceRoot, COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH);
        await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
        await fsp.writeFile(
            settingsPath,
            JSON.stringify({ enabledPlugins: nextEnabledPlugins }, null, 2) + '\n',
            'utf-8',
        );
        return;
    }

    const formatOptions: jsonc.FormattingOptions = { tabSize: 2, insertSpaces: true };
    const edits = jsonc.modify(
        existing,
        ['enabledPlugins'],
        Object.keys(nextEnabledPlugins).length > 0 ? nextEnabledPlugins : undefined,
        { formattingOptions: formatOptions },
    );
    const updated = jsonc.applyEdits(existing, edits);
    const updatedParseErrors: jsonc.ParseError[] = [];
    const updatedParsed = jsonc.parse(updated, updatedParseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
    });
    if (
        updatedParseErrors.length === 0 &&
        updatedParsed &&
        typeof updatedParsed === 'object' &&
        !Array.isArray(updatedParsed) &&
        Object.keys(updatedParsed as Record<string, unknown>).length === 0
    ) {
        try {
            await fsp.unlink(settingsPath);
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw err;
            }
        }
        return;
    }

    await ensureLocalGitExcludeEntry(workspaceRoot, COPILOT_PLUGIN_SETTINGS_RELATIVE_PATH);
    await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsp.writeFile(settingsPath, updated, 'utf-8');
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
            experimental?: boolean;
        }
    >;
    repoMetadataById: Record<
        string,
        {
            name?: string;
            description?: string;
        }
    >;
    governanceContract?: GovernanceContract;
    governanceContractPath?: string;
    governanceContractErrors: ConfigError[];
    governanceCompliance?: GovernanceComplianceResult;
    capabilityWarnings: string[];
    configWarnings: string[];
    capabilityPluginMetadataDirtyVersion: number;
    capabilityPluginMetadataSettledVersion: number;
    capabilityDiagnosticFilePaths: string[];
    agentPluginCatalog: CapabilityPluginCatalogEntry[];
    localGitRepoIds: Set<string>;
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
        governanceContract: undefined,
        governanceContractPath: undefined,
        governanceContractErrors: [],
        governanceCompliance: undefined,
        capabilityWarnings: [],
        configWarnings: [],
        capabilityPluginMetadataDirtyVersion: 0,
        capabilityPluginMetadataSettledVersion: 0,
        capabilityDiagnosticFilePaths: [],
        agentPluginCatalog: [],
        localGitRepoIds: new Set<string>(),
        repoSyncByRepoId: {},
        builtInCapability: {
            enabled: false,
            layerEnabled: true,
            disabledByUser: false,
            synchronizedFiles: [],
            injection: undefined,
            sourceRoot: undefined,
            sourceId: 'unknown.extension',
            sourceDisplayName: 'unknown.extension',
        },
        treeSummaryCache: undefined,
        onDidChange: new vscode.EventEmitter<void>(),
    };
}

function cloneConfigError(error: ConfigError): ConfigError {
    return {
        message: error.message,
        ...(error.code !== undefined ? { code: error.code } : {}),
        ...(error.severity !== undefined ? { severity: error.severity } : {}),
        ...(error.line !== undefined ? { line: error.line } : {}),
        ...(error.column !== undefined ? { column: error.column } : {}),
    };
}

function formatConfigWarningMessage(warning: {
    message: string;
    code?: string | number;
    file?: string;
    startLine?: number;
    startColumn?: number;
}): string {
    const trimmedMessage = warning.message.trim();
    const code = warning.code !== undefined ? String(warning.code).trim() : '';
    const prefixedMessage =
        !code || trimmedMessage.startsWith(`[${code}]`)
            ? trimmedMessage
            : `[${code}] ${trimmedMessage}`;

    if (!warning.file) {
        return prefixedMessage;
    }

    return `${prefixedMessage} [${formatDiagnosticLocation(warning.file, warning.startLine, warning.startColumn)}]`;
}

function cloneBuiltInCapabilityRuntimeState(
    state: BuiltInCapabilityRuntimeState,
): BuiltInCapabilityRuntimeState {
    return {
        ...state,
        synchronizedFiles: [...state.synchronizedFiles],
        layerStates: { ...(state.layerStates ?? {}) },
        injection: sanitizeBuiltInInjectionConfig(state.injection),
    };
}

function previewBuiltInCapabilityWorkspaceState(
    currentState: BuiltInCapabilityRuntimeState,
    patch: BuiltInCapabilityWorkspaceState,
): BuiltInCapabilityRuntimeState {
    return {
        ...cloneBuiltInCapabilityRuntimeState(currentState),
        enabled: patch.enabled ?? currentState.enabled,
        layerEnabled: patch.layerEnabled ?? currentState.layerEnabled,
        disabledByUser: patch.disabledByUser ?? currentState.disabledByUser,
        synchronizedFiles: sanitizeSynchronizedFiles(
            patch.synchronizedFiles ?? currentState.synchronizedFiles,
        ),
        layerStates: sanitizeBuiltInLayerStates(patch.layerStates ?? currentState.layerStates),
        injection: sanitizeBuiltInInjectionConfig(patch.injection ?? currentState.injection),
    };
}

function previewBuiltInRootLayerEnabledState(
    currentState: BuiltInCapabilityRuntimeState,
    enabled: boolean,
): BuiltInCapabilityRuntimeState {
    return previewBuiltInCapabilityWorkspaceState(currentState, {
        enabled,
        layerEnabled: enabled,
        disabledByUser: !enabled,
        layerStates: {},
    });
}

function previewBuiltInLayerEnabledState(
    currentState: BuiltInCapabilityRuntimeState,
    layerPath: string,
    enabled: boolean,
): BuiltInCapabilityRuntimeState {
    const normalizedLayerPath = normalizeBuiltInLayerPath(layerPath);
    if (normalizedLayerPath === BUILT_IN_CAPABILITY_LAYER_PATH) {
        return previewBuiltInRootLayerEnabledState(currentState, enabled);
    }

    const nextLayerStates = { ...(currentState.layerStates ?? {}) };

    if (enabled === currentState.layerEnabled) {
        delete nextLayerStates[normalizedLayerPath];
    } else {
        nextLayerStates[normalizedLayerPath] = enabled;
    }

    return previewBuiltInCapabilityWorkspaceState(currentState, {
        layerStates: nextLayerStates,
    });
}

function previewBuiltInLayerEnabledStates(
    currentState: BuiltInCapabilityRuntimeState,
    layerPaths: Iterable<string>,
    enabled: boolean,
): BuiltInCapabilityRuntimeState {
    const normalizedLayerPaths = Array.from(layerPaths, (layerPath) =>
        normalizeBuiltInLayerPath(layerPath),
    );
    if (normalizedLayerPaths.includes(BUILT_IN_CAPABILITY_LAYER_PATH)) {
        return previewBuiltInRootLayerEnabledState(currentState, enabled);
    }

    const nextLayerStates = { ...(currentState.layerStates ?? {}) };

    for (const normalizedLayerPath of normalizedLayerPaths) {
        if (enabled === currentState.layerEnabled) {
            delete nextLayerStates[normalizedLayerPath];
        } else {
            nextLayerStates[normalizedLayerPath] = enabled;
        }
    }

    return previewBuiltInCapabilityWorkspaceState(currentState, {
        layerStates: nextLayerStates,
    });
}

type GovernedMutationEffect = 'allow' | 'warn' | 'block';

export interface GovernedMutationDecision {
    effect: GovernedMutationEffect;
    compliance?: GovernanceComplianceResult;
    sourceLabel?: string;
    summary?: string;
    detailLines: string[];
}

function buildGovernanceViolationRemediation(
    violation: GovernanceViolation,
    compliance: GovernanceComplianceResult,
): string {
    switch (violation.code) {
        case 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED':
            if (compliance.allowedProfiles.length > 0) {
                return `Switch to one of the allowed profiles (${compliance.allowedProfiles.join(', ')}) and retry.`;
            }
            return 'Select an allowed profile and retry.';
        case 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING':
        case 'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED': {
            const capabilityLabel =
                violation.repoId && violation.path
                    ? `${violation.repoId}/${violation.path}`
                    : 'the governed capability';
            return `Ensure ${capabilityLabel} is active in the candidate runtime state, then retry.`;
        }
        default:
            return 'Align the candidate state with the governance contract and retry.';
    }
}

function buildGovernedMutationDecision(
    actionLabel: string,
    contractPath: string | undefined,
    compliance: GovernanceComplianceResult,
): GovernedMutationDecision {
    if (compliance.status !== 'non-compliant') {
        return {
            effect: 'allow',
            compliance,
            detailLines: [],
        };
    }

    const effect: GovernedMutationEffect = compliance.severity === 'error' ? 'block' : 'warn';
    const sourceLabel = contractPath
        ? `Governance contract (${path.basename(contractPath)})`
        : 'Governance contract';
    const detailLines = compliance.violations.map((violation) => {
        const remediation = buildGovernanceViolationRemediation(violation, compliance);
        return `[${violation.id}] ${violation.message} Remediation: ${remediation}`;
    });
    const violationIds = compliance.violations.map((violation) => `[${violation.id}]`).join(', ');
    const summaryRemediation =
        compliance.violations.length === 1
            ? buildGovernanceViolationRemediation(compliance.violations[0], compliance)
            : 'Review the listed governance violations, align the candidate runtime state, and retry.';

    return {
        effect,
        compliance,
        sourceLabel,
        summary: `${sourceLabel} ${effect === 'block' ? 'blocked' : 'warned'} ${actionLabel}. Violations: ${violationIds}. Remediation: ${summaryRemediation}`,
        detailLines,
    };
}

function buildGovernanceEvaluationConfig(
    config: MetaFlowConfig,
    builtInCapability: BuiltInCapabilityRuntimeState,
): MetaFlowConfig {
    return projectConfigForProfile(withBuiltInCapabilityProjected(config, builtInCapability));
}

export function previewGovernedMutationDecision(options: {
    contract?: GovernanceContract;
    contractPath?: string;
    candidateConfig?: MetaFlowConfig;
    candidateBuiltInCapability: BuiltInCapabilityRuntimeState;
    actionLabel: string;
}): GovernedMutationDecision {
    if (!options.contract || !options.candidateConfig) {
        return {
            effect: 'allow',
            detailLines: [],
        };
    }

    const compliance = evaluateGovernanceCompliance(
        options.contract,
        buildGovernanceEvaluationConfig(
            options.candidateConfig,
            options.candidateBuiltInCapability,
        ),
    );
    return buildGovernedMutationDecision(options.actionLabel, options.contractPath, compliance);
}

function notifyGovernedMutationDecision(
    actionLabel: string,
    decision: GovernedMutationDecision,
): void {
    if (decision.effect === 'allow' || !decision.summary) {
        return;
    }

    showOutputChannel();
    const log = decision.effect === 'block' ? logError : logWarn;
    const notify =
        decision.effect === 'block'
            ? vscode.window.showErrorMessage.bind(vscode.window)
            : vscode.window.showWarningMessage.bind(vscode.window);

    log(
        `${decision.sourceLabel ?? 'Governance contract'} ${decision.effect === 'block' ? 'blocked' : 'warned'} ${actionLabel}.`,
    );
    for (const detailLine of decision.detailLines) {
        log(`  ${detailLine}`);
    }

    void notify(`MetaFlow: ${decision.summary}`);
}

async function executeGovernedMutation(options: {
    actionLabel: string;
    state: ExtensionState;
    candidateConfig?: MetaFlowConfig;
    candidateBuiltInCapability?: BuiltInCapabilityRuntimeState;
    persist: () => Promise<void>;
}): Promise<boolean> {
    const decision = previewGovernedMutationDecision({
        contract: options.state.governanceContract,
        contractPath: options.state.governanceContractPath,
        candidateConfig: options.candidateConfig,
        candidateBuiltInCapability:
            options.candidateBuiltInCapability ?? options.state.builtInCapability,
        actionLabel: options.actionLabel,
    });

    if (decision.effect === 'block') {
        notifyGovernedMutationDecision(options.actionLabel, decision);
        return false;
    }

    if (decision.effect === 'warn') {
        notifyGovernedMutationDecision(options.actionLabel, decision);
    }

    await options.persist();
    return true;
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
const PLUGIN_INJECTION_UPGRADE_SUPPRESSIONS_STATE_KEY =
    'metaflow.pluginInjectionUpgradeSuppressions.v1';
const PLUGIN_INJECTION_UPGRADE_DISABLED_SIGNATURE = 'disabled';
const PLUGIN_INJECTION_UPGRADE_ACTION = 'Update Config';
const PLUGIN_INJECTION_UPGRADE_REVIEW_ACTION = 'Review Injection Defaults';
const PLUGIN_INJECTION_UPGRADE_DISMISS_ACTION = "Don't Show Again";
const PLUGIN_INJECTION_RECOMMENDED_KEYS: readonly InjectionKey[] = [
    'instructions',
    'skills',
    'agents',
    'hooks',
];

type CheckRepoUpdatesOutcome =
    | { executed: true }
    | { executed: false; reason: 'no-config' | 'no-git-repos' | 'repo-not-found' | 'no-targets' };

type InjectionEditMode = 'settings' | 'synchronize' | 'plugin' | 'inherit';
type InjectionPreset = 'all-settings' | 'all-synchronize' | 'clear-all';

interface InjectionMutationSelection {
    artifactType?: InjectionKey;
    mode?: InjectionEditMode;
    preset?: InjectionPreset;
}

type InheritedInjectionSource = 'repo' | 'global' | 'default';

interface ResolvedInheritedInjectionMode {
    mode: 'settings' | 'synchronize' | 'plugin';
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
    return (
        value === 'settings' || value === 'synchronize' || value === 'plugin' || value === 'inherit'
    );
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

function formatInjectionModeLabel(mode: 'settings' | 'synchronize' | 'plugin' | undefined): string {
    if (mode === 'synchronize') {
        return 'synchronize';
    }
    if (mode === 'plugin') {
        return 'Plugin';
    }
    if (mode === 'settings') {
        return 'Settings';
    }
    return 'Inherit';
}

function formatInjectionModeOptionLabel(mode: 'settings' | 'synchronize' | 'plugin'): string {
    if (mode === 'synchronize') {
        return 'Synchronize';
    }
    if (mode === 'plugin') {
        return 'Plugin';
    }
    return 'Settings';
}

function supportsPluginInjection(artifactType: InjectionKey): boolean {
    return (
        artifactType === 'instructions' ||
        artifactType === 'skills' ||
        artifactType === 'agents' ||
        artifactType === 'hooks'
    );
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
    context: vscode.ExtensionContext,
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
        await applyBuiltInRepoInjectionMutation(context, state, mutation);
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

async function applyBuiltInRepoInjectionMutation(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    mutation: InjectionMutationSelection,
): Promise<void> {
    if (!isBuiltInCapabilityActive(state.builtInCapability)) {
        vscode.window.showWarningMessage('MetaFlow: Built-in capability is not active.');
        return;
    }

    const nextInjection = applyInjectionMutation(state.builtInCapability.injection, mutation);
    const candidateBuiltInCapability = previewBuiltInCapabilityWorkspaceState(
        state.builtInCapability,
        {
            injection: nextInjection,
        },
    );
    const candidateConfig = state.config ? cloneConfig(state.config) : undefined;
    const applied = await executeGovernedMutation({
        actionLabel: 'configuring built-in capability injection defaults',
        state,
        candidateConfig,
        candidateBuiltInCapability,
        persist: async () => {
            state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                context,
                state.builtInCapability,
                {
                    injection: nextInjection,
                },
            );
        },
    });
    if (!applied) {
        return;
    }

    logInfo(`Configured built-in capability injection defaults: ${describeInjectionConfig(nextInjection)}`);
    void vscode.window.showInformationMessage(
        'MetaFlow: Updated injection defaults for built-in MetaFlow capability.',
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
            ...(supportsPluginInjection(selection.artifactType)
                ? [
                      {
                          label: 'Plugin',
                          description:
                              'Activate the capability through local Copilot plugin discovery using chat.pluginLocations',
                          mode: 'plugin' as const,
                      },
                  ]
                : []),
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

function loadBuiltInCapabilityManifest(
    sourceRoot: string | undefined,
    layerPath: string = BUILT_IN_CAPABILITY_LAYER_PATH,
) {
    if (!sourceRoot) {
        return undefined;
    }

    const capabilityId = deriveCapabilityIdFromLayerPath(layerPath, sourceRoot);
    return loadCapabilityManifestForLayer(path.join(sourceRoot, layerPath), capabilityId);
}

function loadBuiltInRepoManifest(sourceRoot: string | undefined) {
    if (!sourceRoot) {
        return undefined;
    }

    return loadRepoManifestForRoot(sourceRoot);
}

function discoverBuiltInCapabilityLayerPaths(sourceRoot: string | undefined): string[] {
    if (!sourceRoot) {
        return [];
    }

    const discovered = Array.from(
        new Set(
            discoverLayersInRepo(sourceRoot).map((layerPath) =>
                normalizeBuiltInLayerPath(layerPath),
            ),
        ),
    );

    if (discovered.length === 0) {
        return [BUILT_IN_CAPABILITY_LAYER_PATH];
    }

    return discovered.sort((left, right) => {
        if (left === BUILT_IN_CAPABILITY_LAYER_PATH) {
            return -1;
        }
        if (right === BUILT_IN_CAPABILITY_LAYER_PATH) {
            return 1;
        }
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
}

function collectConfiguredCapabilityMetadata(
    config: MetaFlowConfig,
    workspaceRoot: string,
): Record<
    string,
    { id?: string; name?: string; description?: string; license?: string; experimental?: boolean }
> {
    const capabilityByLayer: Record<
        string,
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
            experimental?: boolean;
        }
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
                experimental: manifest.experimental,
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
                experimental: manifest.experimental,
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

function capabilityWarningIdentity(warning: CapabilityWarning): string {
    return [
        warning.severity ?? 'warning',
        warning.code,
        warning.filePath ?? '',
        warning.message,
    ].join('|');
}

function collectConfiguredCapabilityDiagnosticWarnings(
    config: MetaFlowConfig,
    workspaceRoot: string,
): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];
    const seen = new Set<string>();

    const appendManifestWarnings = (repoRoot: string, layerPath: string): void => {
        const layerAbsPath = path.join(repoRoot, layerPath);
        const capabilityFile = path.join(layerAbsPath, 'CAPABILITY.md');
        if (!fs.existsSync(capabilityFile)) {
            return;
        }

        const capabilityId = deriveCapabilityIdFromLayerPath(layerPath, repoRoot);
        const manifest = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
        for (const warning of manifest?.warnings ?? []) {
            const identity = capabilityWarningIdentity(warning);
            if (!seen.has(identity)) {
                seen.add(identity);
                warnings.push(warning);
            }
        }
    };

    if (config.metadataRepos && config.layerSources) {
        const repoById = new Map(config.metadataRepos.map((repo) => [repo.id, repo]));
        for (const source of config.layerSources) {
            const repo = repoById.get(source.repoId);
            if (!repo) {
                continue;
            }

            const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
            appendManifestWarnings(repoRoot, source.path);
        }

        return warnings;
    }

    if (config.metadataRepo && config.layers) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        for (const layerPath of config.layers) {
            appendManifestWarnings(repoRoot, layerPath);
        }
    }

    return warnings;
}

function toCapabilityDiagnosticSeverity(
    severity: CapabilityWarning['severity'],
): vscode.DiagnosticSeverity {
    if (severity === 'error') {
        return vscode.DiagnosticSeverity.Error;
    }
    if (severity === 'info') {
        return vscode.DiagnosticSeverity.Information;
    }
    return vscode.DiagnosticSeverity.Warning;
}

function replaceCapabilityWarningDiagnostics(
    collection: vscode.DiagnosticCollection,
    previousFilePaths: string[],
    warnings: CapabilityWarning[],
): string[] {
    const grouped = new Map<string, vscode.Diagnostic[]>();

    for (const warning of warnings) {
        if (!warning.filePath) {
            continue;
        }

        const filePath = path.normalize(warning.filePath);
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            warning.message,
            toCapabilityDiagnosticSeverity(warning.severity),
        );
        diagnostic.source = 'MetaFlow';
        diagnostic.code = warning.code;

        const diagnostics = grouped.get(filePath) ?? [];
        diagnostics.push(diagnostic);
        grouped.set(filePath, diagnostics);
    }

    for (const previousFilePath of previousFilePaths) {
        if (!grouped.has(previousFilePath)) {
            collection.delete(vscode.Uri.file(previousFilePath));
        }
    }

    for (const [filePath, diagnostics] of grouped) {
        collection.set(vscode.Uri.file(filePath), diagnostics);
    }

    return Array.from(grouped.keys()).sort((left, right) => left.localeCompare(right));
}

type DirectoryAccessibility =
    | { state: 'ok' }
    | { state: 'missing' }
    | { state: 'not-directory' }
    | { state: 'unreadable'; detail: string };

function inspectDirectoryAccessibility(targetPath: string): DirectoryAccessibility {
    try {
        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return { state: 'not-directory' };
        }

        return { state: 'ok' };
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') {
            return { state: 'missing' };
        }

        const detail = err instanceof Error ? err.message : String(err);
        return { state: 'unreadable', detail };
    }
}

function formatRepoPathWarning(
    repoId: string,
    configuredLocalPath: string,
    accessibility: Exclude<DirectoryAccessibility, { state: 'ok' }>,
): string {
    const normalizedPath = configuredLocalPath.replace(/\\/g, '/');

    switch (accessibility.state) {
        case 'missing':
            return `[REPO_PATH_MISSING] Metadata repo "${repoId}" localPath "${normalizedPath}" does not exist or is not currently mounted.`;
        case 'not-directory':
            return `[REPO_PATH_INVALID] Metadata repo "${repoId}" localPath "${normalizedPath}" is not a directory.`;
        case 'unreadable':
            return `[REPO_PATH_UNREADABLE] Metadata repo "${repoId}" localPath "${normalizedPath}" could not be read: ${accessibility.detail}`;
    }
}

function formatLayerPathWarning(
    repoId: string,
    layerPath: string,
    accessibility: Exclude<DirectoryAccessibility, { state: 'ok' }>,
): string {
    const normalizedLayerPath = layerPath.replace(/\\/g, '/');
    const layerLabel = `${repoId}/${normalizedLayerPath}`;

    switch (accessibility.state) {
        case 'missing':
            return `[LAYER_PATH_MISSING] Configured layer "${layerLabel}" does not exist or is not currently mounted.`;
        case 'not-directory':
            return `[LAYER_PATH_INVALID] Configured layer "${layerLabel}" is not a directory.`;
        case 'unreadable':
            return `[LAYER_PATH_UNREADABLE] Configured layer "${layerLabel}" could not be read: ${accessibility.detail}`;
    }
}

export interface ConfiguredSourceDiagnosticWarning {
    message: string;
    code: string;
    file?: string;
    startLine?: number;
    startColumn?: number;
}

const DIAGNOSTIC_ELIGIBLE_CONFIGURED_SOURCE_WARNING_CODES = new Set([
    'LAYER_PATH_MISSING',
    'LAYER_PATH_INVALID',
    'LAYER_PATH_UNREADABLE',
]);

function extractWarningCode(message: string): string | undefined {
    const match = /^\[([A-Z0-9_]+)\]/.exec(message);
    return match?.[1];
}

function addConfiguredSourceDiagnosticWarning(
    diagnostics: ConfiguredSourceDiagnosticWarning[],
    seenMessages: Set<string>,
    message: string,
    location?: {
        file: string;
        startLine: number;
        startColumn: number;
    },
): void {
    const code = extractWarningCode(message);
    if (!code || !DIAGNOSTIC_ELIGIBLE_CONFIGURED_SOURCE_WARNING_CODES.has(code)) {
        return;
    }

    if (seenMessages.has(message)) {
        return;
    }

    seenMessages.add(message);
    diagnostics.push({ message, code, ...location });
}

function getLineColumn(text: string, offset: number): { line: number; column: number } {
    const lines = text.slice(0, offset).split(/\r?\n/);
    return {
        line: lines.length - 1,
        column: lines[lines.length - 1]?.length ?? 0,
    };
}

function getObjectPropertyValueNode(
    node: jsonc.Node | undefined,
    propertyName: string,
): jsonc.Node | undefined {
    if (!node || node.type !== 'object') {
        return undefined;
    }

    for (const propertyNode of node.children ?? []) {
        const keyNode = propertyNode.children?.[0];
        const valueNode = propertyNode.children?.[1];
        if (keyNode?.value === propertyName) {
            return valueNode;
        }
    }

    return undefined;
}

function getObjectPropertyString(
    node: jsonc.Node | undefined,
    propertyName: string,
): string | undefined {
    const valueNode = getObjectPropertyValueNode(node, propertyName);
    return valueNode?.type === 'string' ? String(valueNode.value) : undefined;
}

function isConfigEntryEnabled(node: jsonc.Node | undefined): boolean {
    return getObjectPropertyValueNode(node, 'enabled')?.value !== false;
}

function normalizeConfiguredLayerPath(layerPath: string): string {
    return layerPath.replace(/\\/g, '/');
}

function findConfiguredLayerLocation(
    configPath: string | undefined,
    repoId: string,
    layerPath: string,
): { file: string; startLine: number; startColumn: number } | undefined {
    if (!configPath) {
        return undefined;
    }

    let text: string;
    try {
        text = fs.readFileSync(configPath, 'utf-8');
    } catch {
        return undefined;
    }

    const root = jsonc.parseTree(text);
    if (!root) {
        return undefined;
    }

    const normalizedLayerPath = normalizeConfiguredLayerPath(layerPath);
    const toLocation = (node: jsonc.Node | undefined) => {
        if (!node) {
            return undefined;
        }
        const position = getLineColumn(text, node.offset);
        return {
            file: configPath,
            startLine: position.line,
            startColumn: position.column,
        };
    };

    const layerSourcesNode = jsonc.findNodeAtLocation(root, ['layerSources']);
    if (layerSourcesNode?.type === 'array') {
        for (const sourceNode of layerSourcesNode.children ?? []) {
            if (sourceNode.type !== 'object' || !isConfigEntryEnabled(sourceNode)) {
                continue;
            }

            if (
                getObjectPropertyString(sourceNode, 'repoId') === repoId &&
                normalizeConfiguredLayerPath(getObjectPropertyString(sourceNode, 'path') ?? '') ===
                    normalizedLayerPath
            ) {
                return toLocation(getObjectPropertyValueNode(sourceNode, 'path'));
            }
        }
    }

    const metadataReposNode = jsonc.findNodeAtLocation(root, ['metadataRepos']);
    if (metadataReposNode?.type === 'array') {
        for (const repoNode of metadataReposNode.children ?? []) {
            if (
                repoNode.type !== 'object' ||
                !isConfigEntryEnabled(repoNode) ||
                getObjectPropertyString(repoNode, 'id') !== repoId
            ) {
                continue;
            }

            const capabilitiesNode = getObjectPropertyValueNode(repoNode, 'capabilities');
            if (capabilitiesNode?.type !== 'array') {
                continue;
            }

            for (const capabilityNode of capabilitiesNode.children ?? []) {
                if (capabilityNode.type !== 'object' || !isConfigEntryEnabled(capabilityNode)) {
                    continue;
                }

                if (
                    normalizeConfiguredLayerPath(
                        getObjectPropertyString(capabilityNode, 'path') ?? '',
                    ) === normalizedLayerPath
                ) {
                    return toLocation(getObjectPropertyValueNode(capabilityNode, 'path'));
                }
            }
        }
    }

    if (repoId === 'primary') {
        const layersNode = jsonc.findNodeAtLocation(root, ['layers']);
        if (layersNode?.type === 'array') {
            for (const layerNode of layersNode.children ?? []) {
                if (
                    layerNode.type === 'string' &&
                    normalizeConfiguredLayerPath(String(layerNode.value ?? '')) ===
                        normalizedLayerPath
                ) {
                    return toLocation(layerNode);
                }
            }
        }
    }

    return undefined;
}

export function collectEnabledConfiguredSourceDiagnosticWarnings(
    config: MetaFlowConfig,
    workspaceRoot: string,
    configPath?: string,
): ConfiguredSourceDiagnosticWarning[] {
    const diagnostics: ConfiguredSourceDiagnosticWarning[] = [];
    const seenMessages = new Set<string>();

    const appendRepoLayerDiagnostics = (
        repoId: string,
        configuredLocalPath: string,
        layerPaths: string[],
    ): void => {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, configuredLocalPath);
        const repoAccessibility = inspectDirectoryAccessibility(repoRoot);
        if (repoAccessibility.state !== 'ok') {
            return;
        }

        for (const layerPath of layerPaths) {
            const layerAbsPath = path.join(repoRoot, layerPath);
            const layerAccessibility = inspectDirectoryAccessibility(layerAbsPath);
            if (layerAccessibility.state === 'ok') {
                continue;
            }

            addConfiguredSourceDiagnosticWarning(
                diagnostics,
                seenMessages,
                formatLayerPathWarning(repoId, layerPath, layerAccessibility),
                findConfiguredLayerLocation(configPath, repoId, layerPath),
            );
        }
    };

    if (config.metadataRepos) {
        const enabledSourcesByRepoId = new Map<string, Set<string>>();
        for (const source of config.layerSources ?? []) {
            if (source.enabled === false) {
                continue;
            }

            const existing = enabledSourcesByRepoId.get(source.repoId) ?? new Set<string>();
            existing.add(source.path);
            enabledSourcesByRepoId.set(source.repoId, existing);
        }

        for (const repo of config.metadataRepos) {
            if (repo.enabled === false) {
                continue;
            }

            const enabledPaths = enabledSourcesByRepoId.get(repo.id) ?? new Set<string>();
            for (const capability of repo.capabilities ?? []) {
                if (capability.enabled === false) {
                    continue;
                }
                enabledPaths.add(capability.path);
            }

            appendRepoLayerDiagnostics(repo.id, repo.localPath, Array.from(enabledPaths));
        }

        return diagnostics;
    }

    if (config.metadataRepo && config.layers) {
        appendRepoLayerDiagnostics('primary', config.metadataRepo.localPath, config.layers);
    }

    return diagnostics;
}

export function collectConfiguredSourceWarnings(
    config: MetaFlowConfig,
    workspaceRoot: string,
    resolvedLayers: ReturnType<typeof resolveLayers>,
): string[] {
    const warnings = new Set<string>();

    const layerLookup = new Map<string, (typeof resolvedLayers)[number]>();
    for (const layer of resolvedLayers) {
        layerLookup.set(layer.layerId.replace(/\\/g, '/'), layer);
    }

    const formatEmptyLayerWarning = (repoId: string, layerPath: string): string => {
        const normalizedLayerPath = layerPath.replace(/\\/g, '/');
        return `[LAYER_PATH_EMPTY] Configured layer "${repoId}/${normalizedLayerPath}" exists but currently resolves to no capability metadata or surfaced files.`;
    };

    const appendWarningsForRepoLayers = (
        repoId: string,
        configuredLocalPath: string,
        layerPaths: string[],
        resolveLayerKey: (layerPath: string) => string,
    ): void => {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, configuredLocalPath);
        const repoAccessibility = inspectDirectoryAccessibility(repoRoot);
        if (repoAccessibility.state !== 'ok') {
            warnings.add(formatRepoPathWarning(repoId, configuredLocalPath, repoAccessibility));
            return;
        }

        for (const layerPath of layerPaths) {
            const layerAbsPath = path.join(repoRoot, layerPath);
            const layerAccessibility = inspectDirectoryAccessibility(layerAbsPath);
            if (layerAccessibility.state === 'ok') {
                const resolvedLayer = layerLookup.get(resolveLayerKey(layerPath));
                if (
                    resolvedLayer &&
                    resolvedLayer.files.length === 0 &&
                    !resolvedLayer.capability
                ) {
                    warnings.add(formatEmptyLayerWarning(repoId, layerPath));
                }
                continue;
            }

            warnings.add(formatLayerPathWarning(repoId, layerPath, layerAccessibility));
        }
    };

    if (config.metadataRepos && config.layerSources) {
        const repoById = new Map(config.metadataRepos.map((repo) => [repo.id, repo]));
        const layerPathsByRepoId = new Map<string, string[]>();

        for (const source of config.layerSources) {
            if (source.enabled === false) {
                continue;
            }

            const existing = layerPathsByRepoId.get(source.repoId) ?? [];
            existing.push(source.path);
            layerPathsByRepoId.set(source.repoId, existing);
        }

        for (const repo of config.metadataRepos) {
            if (repo.enabled === false) {
                continue;
            }

            appendWarningsForRepoLayers(
                repo.id,
                repo.localPath,
                layerPathsByRepoId.get(repo.id) ?? [],
                (layerPath) => `${repo.id}/${layerPath.replace(/\\/g, '/')}`,
            );
        }

        for (const [repoId] of layerPathsByRepoId) {
            if (repoById.has(repoId)) {
                continue;
            }

            warnings.add(
                `[LAYER_SOURCE_REPO_MISSING] Configured layer source references repoId "${repoId}", but no enabled metadata repo with that id is available.`,
            );
        }

        return Array.from(warnings);
    }

    if (config.metadataRepo && config.layers) {
        appendWarningsForRepoLayers(
            'primary',
            config.metadataRepo.localPath,
            config.layers,
            (layerPath) => layerPath.replace(/\\/g, '/'),
        );
    }

    return Array.from(warnings);
}

export function shouldSuppressBuiltInSurfacedFileConflictWarning(
    conflict: SurfacedFileConflict,
): boolean {
    const builtInRootLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/.`;

    if (conflict.winner.sourceRepo !== BUILT_IN_CAPABILITY_REPO_ID) {
        return false;
    }

    if (conflict.winner.sourceLayer === builtInRootLayerId) {
        return false;
    }

    return (
        conflict.contenders.length > 1 &&
        conflict.contenders.every((entry) => entry.sourceRepo === BUILT_IN_CAPABILITY_REPO_ID) &&
        conflict.contenders.some((entry) => entry.sourceLayer === builtInRootLayerId)
    );
}

function cloneConfig(config: MetaFlowConfig): MetaFlowConfig {
    return JSON.parse(JSON.stringify(config)) as MetaFlowConfig;
}

function withBuiltInCapabilityProjected(
    config: MetaFlowConfig,
    builtInState: BuiltInCapabilityRuntimeState,
): MetaFlowConfig {
    if (!isBuiltInCapabilityEnabled(builtInState) || !builtInState.sourceRoot) {
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
    const builtInRepoEnabled = resolveBuiltInRepoEnabled(builtInState);
    if (!existingRepo) {
        multiRepo.metadataRepos.push({
            id: BUILT_IN_CAPABILITY_REPO_ID,
            name: builtInRepoLabel,
            localPath: builtInState.sourceRoot,
            enabled: builtInRepoEnabled,
            injection: builtInState.injection,
        });
    } else {
        existingRepo.name = builtInRepoLabel;
        existingRepo.localPath = builtInState.sourceRoot;
        existingRepo.enabled = builtInRepoEnabled;
        existingRepo.injection = builtInState.injection;
    }

    multiRepo.layerSources = multiRepo.layerSources.filter(
        (layer) => layer.repoId !== BUILT_IN_CAPABILITY_REPO_ID,
    );

    if (!builtInRepoEnabled) {
        // Keep the built-in repo row visible in projected config, but do not
        // surface any built-in layers while the repo checkbox is off.
        projected.layerSources = multiRepo.layerSources;
        return projected;
    }

    const builtInLayerPaths = discoverBuiltInCapabilityLayerPaths(builtInState.sourceRoot);
    for (const layerPath of builtInLayerPaths) {
        multiRepo.layerSources.push({
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            path: layerPath,
            enabled: resolveBuiltInLayerEnabled(builtInState, layerPath),
        });
    }

    // ensureMultiRepoConfig returns references to config arrays, but
    // .filter() above created a new array — sync it back to the returned config.
    projected.layerSources = multiRepo.layerSources;

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
        disabledByUser: patch.disabledByUser ?? currentState.disabledByUser,
        synchronizedFiles: sanitizeSynchronizedFiles(
            patch.synchronizedFiles ?? currentState.synchronizedFiles,
        ),
        layerStates: sanitizeBuiltInLayerStates(patch.layerStates ?? currentState.layerStates),
    };
    const injection = sanitizeBuiltInInjectionConfig(patch.injection ?? currentState.injection);
    if (injection) {
        payload.injection = injection;
    }

    await context.workspaceState.update(BUILT_IN_CAPABILITY_STATE_KEY, payload);
    return loadBuiltInCapabilityRuntimeState(context);
}

async function writeBuiltInLayerEnabledState(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
    layerPath: string,
    enabled: boolean,
): Promise<BuiltInCapabilityRuntimeState> {
    const normalizedLayerPath = normalizeBuiltInLayerPath(layerPath);
    if (normalizedLayerPath === BUILT_IN_CAPABILITY_LAYER_PATH) {
        return writeBuiltInCapabilityWorkspaceState(context, currentState, {
            enabled,
            layerEnabled: enabled,
            disabledByUser: !enabled,
            layerStates: {},
        });
    }

    const nextLayerStates = { ...(currentState.layerStates ?? {}) };

    if (enabled === currentState.layerEnabled) {
        delete nextLayerStates[normalizedLayerPath];
    } else {
        nextLayerStates[normalizedLayerPath] = enabled;
    }

    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        layerStates: nextLayerStates,
    });
}

async function writeBuiltInLayerEnabledStates(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
    layerPaths: Iterable<string>,
    enabled: boolean,
): Promise<BuiltInCapabilityRuntimeState> {
    const normalizedLayerPaths = Array.from(layerPaths, (layerPath) =>
        normalizeBuiltInLayerPath(layerPath),
    );
    if (normalizedLayerPaths.includes(BUILT_IN_CAPABILITY_LAYER_PATH)) {
        return writeBuiltInCapabilityWorkspaceState(context, currentState, {
            enabled,
            layerEnabled: enabled,
            disabledByUser: !enabled,
            layerStates: {},
        });
    }

    const nextLayerStates = { ...(currentState.layerStates ?? {}) };

    for (const normalizedLayerPath of normalizedLayerPaths) {
        if (enabled === currentState.layerEnabled) {
            delete nextLayerStates[normalizedLayerPath];
        } else {
            nextLayerStates[normalizedLayerPath] = enabled;
        }
    }

    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        layerStates: nextLayerStates,
    });
}

async function enableBuiltInCapabilityInSettingsMode(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
): Promise<BuiltInCapabilityRuntimeState> {
    return writeBuiltInCapabilityWorkspaceState(context, currentState, {
        enabled: true,
        layerEnabled: true,
        disabledByUser: false,
    });
}

async function enableBuiltInCapabilityDuringInit(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
): Promise<BuiltInCapabilityRuntimeState> {
    if (isBuiltInCapabilityActive(currentState)) {
        return currentState;
    }

    const nextState = await enableBuiltInCapabilityInSettingsMode(context, currentState);
    vscode.window.showInformationMessage(
        'MetaFlow: Built-in MetaFlow capability enabled automatically (plugin-first defaults).',
    );
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

        await retryTransientFileLock(() => fsp.unlink(destination));
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
                await retryTransientFileLock(() => fsp.rmdir(currentDir));
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
        if (currentState.disabledByUser) {
            return currentState;
        }

        if (currentState.enabled) {
            return currentState;
        }

        logInfo('MetaFlow: Auto-applied built-in AI metadata in built-in layer mode.');
        return writeBuiltInCapabilityWorkspaceState(context, currentState, {
            enabled: true,
            layerEnabled: true,
            disabledByUser: false,
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
        layerResolutionCache?: ResolveLayersCache;
    },
    emitLogs: boolean = true,
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
    capabilityDiagnostics: CapabilityWarning[];
    agentPluginCatalog: CapabilityPluginCatalogEntry[];
} {
    const layers = resolveLayers(config, workspaceRoot, {
        enableDiscovery: options?.enableDiscovery,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
        cache: options?.layerResolutionCache,
    });

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
    const capabilityDiagnostics: CapabilityWarning[] = [];
    const seenCapabilityWarningMessages = new Set<string>();
    const seenCapabilityDiagnostics = new Set<string>();

    const appendCapabilityWarning = (warning: CapabilityWarning): void => {
        const diagnosticIdentity = capabilityWarningIdentity(warning);
        if (!seenCapabilityDiagnostics.has(diagnosticIdentity)) {
            seenCapabilityDiagnostics.add(diagnosticIdentity);
            capabilityDiagnostics.push(warning);
        }

        const message = formatCapabilityWarningMessage(warning);
        if (!seenCapabilityWarningMessages.has(message)) {
            seenCapabilityWarningMessages.add(message);
            capabilityWarnings.push(message);
            if (emitLogs) {
                logWarn(message);
            }
        }
    };

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
            appendCapabilityWarning(warning);
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

    for (const warning of collectConfiguredSourceWarnings(config, workspaceRoot, layers)) {
        if (!seenCapabilityWarningMessages.has(warning)) {
            seenCapabilityWarningMessages.add(warning);
            capabilityWarnings.push(warning);
            if (emitLogs) {
                logWarn(warning);
            }
        }
    }

    for (const warning of collectConfiguredCapabilityDiagnosticWarnings(config, workspaceRoot)) {
        appendCapabilityWarning(warning);
    }

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;

    if (profileName && !profile) {
        const message = `[ACTIVE_PROFILE_NOT_FOUND] Active profile "${profileName}" is not defined in config.profiles — all capabilities will be surfaced without profile filtering.`;
        if (!seenCapabilityWarningMessages.has(message)) {
            seenCapabilityWarningMessages.add(message);
            capabilityWarnings.push(message);
            if (emitLogs) {
                logWarn(message);
            }
        }
    }

    for (const conflict of detectSurfacedFileConflicts(layers, {
        filters: config.filters,
        layerSources: config.layerSources,
        profile,
    })) {
        if (shouldSuppressBuiltInSurfacedFileConflictWarning(conflict)) {
            continue;
        }

        const message = formatSurfacedFileConflictMessage(conflict);
        if (!seenCapabilityWarningMessages.has(message)) {
            seenCapabilityWarningMessages.add(message);
            capabilityWarnings.push(message);
            if (emitLogs) {
                logWarn(message);
            }
        }
    }

    const agentPluginCatalog = buildAgentPluginCatalog(layers);
    for (const warning of agentPluginCatalog.warnings) {
        appendCapabilityWarning(warning);
    }

    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);

    const baseProfileFiles = [...files];
    files = applyProfile(files, profile);

    classifyFiles(files, injection, config.layerSources);
    return {
        baseProfileFiles,
        effectiveFiles: files,
        capabilityByLayer,
        capabilityWarnings,
        capabilityDiagnostics,
        agentPluginCatalog: agentPluginCatalog.entries,
    };
}

function buildProfileEffectiveFilesLookup(
    config: MetaFlowConfig,
    workspaceRoot: string,
    injection: InjectionConfig,
    activeProfileId: string | undefined,
    activeProfileFiles: EffectiveFile[],
    options?: {
        enableDiscovery?: boolean;
        forceDiscoveryRepoIds?: string[];
        builtInCapability?: BuiltInCapabilityRuntimeState;
        layerResolutionCache?: ResolveLayersCache;
    },
): Record<string, EffectiveFile[]> {
    const profileIds = Object.keys(config.profiles ?? {});
    if (profileIds.length === 0) {
        return {};
    }

    const profileEffectiveFilesByName: Record<string, EffectiveFile[]> = {};
    for (const profileId of profileIds) {
        if (profileId === activeProfileId) {
            profileEffectiveFilesByName[profileId] = [...activeProfileFiles];
            continue;
        }

        const projectedProfileConfig = projectConfigForProfile(config, profileId);
        profileEffectiveFilesByName[profileId] = resolveOverlay(
            projectedProfileConfig,
            workspaceRoot,
            injection,
            options,
            false,
        ).effectiveFiles;
    }

    return profileEffectiveFilesByName;
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

interface CapabilityIdentityDriftRepairPreview {
    managedState: ReturnType<typeof loadManagedState>;
    repairResult: ReturnType<typeof applyCapabilityReferenceRepairs>;
}

function previewCapabilityIdentityDriftRepair(
    config: MetaFlowConfig,
    workspaceRoot: string,
): CapabilityIdentityDriftRepairPreview {
    const managedState = loadManagedState(workspaceRoot);
    const lastKnownIndex = managedStateToCapabilityIdentityIndex(managedState.capabilityIdentity);
    const currentIndex = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
    const resolutions = reconcileConfiguredCapabilityReferences(
        config,
        workspaceRoot,
        currentIndex,
        lastKnownIndex,
    );
    const repairResult = applyCapabilityReferenceRepairs(cloneConfig(config), resolutions);

    return { managedState, repairResult };
}

function applyCapabilityIdentityDriftRepair(
    config: MetaFlowConfig,
    workspaceRoot: string,
    managedState: ReturnType<typeof loadManagedState>,
): ReturnType<typeof applyCapabilityReferenceRepairs> {
    const lastKnownIndex = managedStateToCapabilityIdentityIndex(managedState.capabilityIdentity);
    const currentIndex = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
    const resolutions = reconcileConfiguredCapabilityReferences(
        config,
        workspaceRoot,
        currentIndex,
        lastKnownIndex,
    );
    const repairResult = applyCapabilityReferenceRepairs(config, resolutions);
    const nextIndex = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
    managedState.capabilityIdentity = capabilityIdentityIndexToManagedState(nextIndex);
    saveManagedState(workspaceRoot, managedState);
    return repairResult;
}

interface RefreshUpdateDecision {
    shouldPersist: boolean;
    rememberPreference: boolean;
}

async function decideConfigUpdate(
    configPath: string,
    reasons: string[],
): Promise<RefreshUpdateDecision> {
    const detail = reasons.map((reason) => `- ${reason}`).join('\n');
    const selection = await vscode.window.showWarningMessage(
        'MetaFlow found updates for .metaflow/config.jsonc. Update the config file now?',
        { modal: true, detail },
        'Update Config',
        AUTO_ACCEPT_REFRESH_UPDATES_ACTION,
        'Open Config',
        'Later',
    );

    if (selection === 'Open Config') {
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
        return { shouldPersist: false, rememberPreference: false };
    }

    if (selection === AUTO_ACCEPT_REFRESH_UPDATES_ACTION) {
        return { shouldPersist: true, rememberPreference: true };
    }

    return { shouldPersist: selection === 'Update Config', rememberPreference: false };
}

interface BuiltInCapabilityStateRepair {
    oldPath: string;
    newPath: string;
    enabled: boolean;
    matchReason: string;
}

interface BuiltInCapabilityStateRepairPreview {
    repairs: BuiltInCapabilityStateRepair[];
    layerStates: Record<string, boolean>;
}

function previewBuiltInCapabilityStateDriftRepair(
    builtInState: BuiltInCapabilityRuntimeState,
    workspaceRoot: string,
    lastKnownConfig: MetaFlowConfig,
): BuiltInCapabilityStateRepairPreview {
    if (!builtInState.sourceRoot || !builtInState.layerStates) {
        return { repairs: [], layerStates: {} };
    }

    const staleLayerStates = sanitizeBuiltInLayerStates(builtInState.layerStates);
    const staleLayerPaths = Object.keys(staleLayerStates);
    if (staleLayerPaths.length === 0) {
        return { repairs: [], layerStates: staleLayerStates };
    }

    const managedState = loadManagedState(workspaceRoot);
    const lastKnownIndex = managedStateToCapabilityIdentityIndex(managedState.capabilityIdentity);
    const currentIndex = buildCapabilityIdentityIndexFromConfig(lastKnownConfig, workspaceRoot);
    const staleReferenceConfig: MetaFlowConfig = {
        metadataRepos: [
            {
                id: BUILT_IN_CAPABILITY_REPO_ID,
                localPath: builtInState.sourceRoot,
            },
        ],
        layerSources: staleLayerPaths.map((layerPath) => ({
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            path: layerPath,
            enabled: staleLayerStates[layerPath],
        })),
    };
    const resolutions = reconcileConfiguredCapabilityReferences(
        staleReferenceConfig,
        workspaceRoot,
        currentIndex,
        lastKnownIndex,
    );
    const repairConfig = cloneConfig(staleReferenceConfig);
    const repairResult = applyCapabilityReferenceRepairs(repairConfig, resolutions);
    const nextLayerStates = { ...staleLayerStates };
    const repairs: BuiltInCapabilityStateRepair[] = [];

    for (const repair of repairResult.repaired) {
        const enabled = staleLayerStates[repair.oldPath];
        if (enabled === undefined || repair.oldPath === repair.newPath) {
            continue;
        }

        delete nextLayerStates[repair.oldPath];
        nextLayerStates[repair.newPath] = enabled;
        repairs.push({
            oldPath: repair.oldPath,
            newPath: repair.newPath,
            enabled,
            matchReason: repair.matchReason,
        });
    }

    return { repairs, layerStates: nextLayerStates };
}

async function decideBuiltInCapabilityStateUpdate(
    repairs: BuiltInCapabilityStateRepair[],
): Promise<RefreshUpdateDecision> {
    const detail = repairs
        .map((repair) => `- ${repair.oldPath} -> ${repair.newPath} (${repair.matchReason})`)
        .join('\n');
    const selection = await vscode.window.showWarningMessage(
        'MetaFlow found built-in capability selections that point to moved bundled metadata. Update those selections now?',
        { modal: true, detail },
        'Update Selections',
        AUTO_ACCEPT_REFRESH_UPDATES_ACTION,
        'Later',
    );

    if (selection === AUTO_ACCEPT_REFRESH_UPDATES_ACTION) {
        return { shouldPersist: true, rememberPreference: true };
    }

    return { shouldPersist: selection === 'Update Selections', rememberPreference: false };
}

async function persistAutoAcceptRefreshUpdatesPreference(
    workspaceConfig: vscode.WorkspaceConfiguration,
): Promise<void> {
    await workspaceConfig.update(
        AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY,
        true,
        vscode.ConfigurationTarget.Workspace,
    );
    logInfo('Enabled metaflow.autoAcceptRefreshUpdates for this workspace.');
}

function saveCapabilityIdentitySnapshot(config: MetaFlowConfig, workspaceRoot: string): void {
    const managedState = loadManagedState(workspaceRoot);
    const currentIndex = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
    managedState.capabilityIdentity = capabilityIdentityIndexToManagedState(currentIndex);
    saveManagedState(workspaceRoot, managedState);
}

function loadLatestConfigForMutation(
    workspaceRoot: string,
    state: ExtensionState,
): MetaFlowConfig | undefined {
    if (!state.configPath) {
        return state.config ? cloneConfig(state.config) : undefined;
    }

    const loaded = loadConfig(workspaceRoot);
    if (loaded.ok) {
        return cloneConfig(loaded.config);
    }

    return state.config ? cloneConfig(state.config) : undefined;
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

interface LocalGitRepositoryState {
    isGitRepo: boolean;
    remotes: GitRemoteInfo[];
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

async function discoverLocalGitRepositoryState(repoRoot: string): Promise<LocalGitRepositoryState> {
    try {
        const insideWorkTree = (
            await runGitCommand(repoRoot, ['rev-parse', '--is-inside-work-tree'])
        ).stdout.trim();
        if (insideWorkTree !== 'true') {
            return { isGitRepo: false, remotes: [] };
        }

        const topLevel = (
            await runGitCommand(repoRoot, ['rev-parse', '--show-toplevel'])
        ).stdout.trim();
        const normalizedRepoRoot = path.normalize(repoRoot);
        const normalizedTopLevel = path.normalize(topLevel);
        const stableRepoRoot =
            process.platform === 'win32' ? normalizedRepoRoot.toLowerCase() : normalizedRepoRoot;
        const stableTopLevel =
            process.platform === 'win32' ? normalizedTopLevel.toLowerCase() : normalizedTopLevel;
        if (stableTopLevel !== stableRepoRoot) {
            return { isGitRepo: false, remotes: [] };
        }

        const remotes = await runGitCommand(repoRoot, ['remote', '-v']);
        return {
            isGitRepo: true,
            remotes: parseGitRemoteVerboseOutput(remotes.stdout),
        };
    } catch {
        return { isGitRepo: false, remotes: [] };
    }
}

async function discoverLocalGitRepoIds(
    config: MetaFlowConfig,
    workspaceRoot: string,
): Promise<Set<string>> {
    const repoIds = new Set<string>();
    const candidates = resolveUntrackedLocalRepoSources(config, workspaceRoot);
    const states = await Promise.all(
        candidates.map(async (candidate) => ({
            repoId: candidate.repoId,
            state: await discoverLocalGitRepositoryState(candidate.localPath),
        })),
    );
    for (const { repoId, state } of states) {
        if (state.isGitRepo) {
            repoIds.add(repoId);
        }
    }
    return repoIds;
}

async function initializeLocalGitRepository(repoRoot: string): Promise<void> {
    await runGitCommand(repoRoot, ['init']);
    await runGitCommand(repoRoot, [
        '-c',
        'user.name=MetaFlow',
        '-c',
        'user.email=metaflow@local.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'chore: initialize metadata repository',
    ]);
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

function getInjectionUpgradeSignatureParts(
    scopeLabel: string,
    injection: InjectionConfig | undefined,
): string[] {
    if (!injection) {
        return [];
    }

    return PLUGIN_INJECTION_RECOMMENDED_KEYS.map(
        (key) => `${scopeLabel}.${key}=${injection[key] ?? 'inherit'}`,
    );
}

function collectPluginInjectionUpgradeSignature(config: MetaFlowConfig): string {
    const parts: string[] = [];
    parts.push(...getInjectionUpgradeSignatureParts('global', config.injection));
    for (const repo of config.metadataRepos ?? []) {
        parts.push(...getInjectionUpgradeSignatureParts(`repo:${repo.id}`, repo.injection));
        for (const capability of repo.capabilities ?? []) {
            parts.push(
                ...getInjectionUpgradeSignatureParts(
                    `capability:${repo.id}:${capability.path}`,
                    capability.injection,
                ),
            );
        }
    }
    for (const layerSource of config.layerSources ?? []) {
        parts.push(
            ...getInjectionUpgradeSignatureParts(
                `layerSource:${layerSource.repoId}:${layerSource.path}`,
                layerSource.injection,
            ),
        );
    }

    return createHash('sha1').update(parts.sort().join('|')).digest('hex');
}

function hasSettingsBackedPluginInjectionCandidate(config: MetaFlowConfig): boolean {
    const injectionConfigs: Array<InjectionConfig | undefined> = [config.injection];
    for (const repo of config.metadataRepos ?? []) {
        injectionConfigs.push(repo.injection);
        for (const capability of repo.capabilities ?? []) {
            injectionConfigs.push(capability.injection);
        }
    }
    for (const layerSource of config.layerSources ?? []) {
        injectionConfigs.push(layerSource.injection);
    }

    return injectionConfigs.some((injection) =>
        PLUGIN_INJECTION_RECOMMENDED_KEYS.some((key) => injection?.[key] === 'settings'),
    );
}

function applyPluginInjectionUpgrade(config: MetaFlowConfig): boolean {
    let changed = false;
    const updateInjection = (injection: InjectionConfig | undefined): void => {
        if (!injection) {
            return;
        }
        for (const key of PLUGIN_INJECTION_RECOMMENDED_KEYS) {
            if (injection[key] === 'settings') {
                injection[key] = 'plugin';
                changed = true;
            }
        }
    };

    updateInjection(config.injection);
    for (const repo of config.metadataRepos ?? []) {
        updateInjection(repo.injection);
        for (const capability of repo.capabilities ?? []) {
            updateInjection(capability.injection);
        }
    }
    for (const layerSource of config.layerSources ?? []) {
        updateInjection(layerSource.injection);
    }

    return changed;
}

async function offerPluginInjectionUpgrade(options: {
    context: vscode.ExtensionContext;
    state: ExtensionState;
    workspaceRoot: string;
    skipPrompt: boolean;
}): Promise<void> {
    const { context, state, workspaceRoot, skipPrompt } = options;
    if (skipPrompt || !state.config || !state.configPath) {
        return;
    }
    const configPath = state.configPath;
    if (!hasSettingsBackedPluginInjectionCandidate(state.config)) {
        return;
    }

    const suppressions = readWorkspaceSuppressions(
        context,
        PLUGIN_INJECTION_UPGRADE_SUPPRESSIONS_STATE_KEY,
    );
    const suppressionKey = buildWorkspaceScopedSuppressionKey(workspaceRoot);
    if (suppressions[suppressionKey] === PLUGIN_INJECTION_UPGRADE_DISABLED_SIGNATURE) {
        return;
    }

    const signature = collectPluginInjectionUpgradeSignature(state.config);
    if (suppressions[suppressionKey] === signature) {
        return;
    }

    const action = await vscode.window.showInformationMessage(
        'MetaFlow: Plugin injection is recommended for instructions, skills, and agents.',
        PLUGIN_INJECTION_UPGRADE_ACTION,
        PLUGIN_INJECTION_UPGRADE_REVIEW_ACTION,
        PLUGIN_INJECTION_UPGRADE_DISMISS_ACTION,
    );

    if (action === PLUGIN_INJECTION_UPGRADE_DISMISS_ACTION) {
        suppressions[suppressionKey] = PLUGIN_INJECTION_UPGRADE_DISABLED_SIGNATURE;
        await context.workspaceState.update(
            PLUGIN_INJECTION_UPGRADE_SUPPRESSIONS_STATE_KEY,
            suppressions,
        );
        return;
    }

    suppressions[suppressionKey] = signature;
    await context.workspaceState.update(
        PLUGIN_INJECTION_UPGRADE_SUPPRESSIONS_STATE_KEY,
        suppressions,
    );

    if (action === PLUGIN_INJECTION_UPGRADE_REVIEW_ACTION) {
        await vscode.commands.executeCommand('metaflow.configureGlobalInjectionDefaults');
        return;
    }

    if (action !== PLUGIN_INJECTION_UPGRADE_ACTION) {
        return;
    }

    const candidateConfig = cloneConfig(state.config);
    if (!applyPluginInjectionUpgrade(candidateConfig)) {
        return;
    }

    const applied = await executeGovernedMutation({
        actionLabel: 'updating plugin-capable injection defaults to plugin mode',
        state,
        candidateConfig,
        persist: async () => {
            await persistConfig(configPath, candidateConfig, state);
            state.config = candidateConfig;
        },
    });
    if (!applied) {
        return;
    }

    logInfo('Updated plugin-capable settings-backed injection defaults to plugin mode.');
    void vscode.window.showInformationMessage(
        'MetaFlow: Updated instructions, skills, and agents to plugin injection.',
    );
    await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
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

const BUNDLED_CAPABILITY_CONTRACT_GUIDANCE_RELATIVE_PATH = path.join(
    'assets',
    'metaflow-ai-metadata',
    '.github',
    'instructions',
    'metaflow-capability-contract.instructions.md',
);

const BUNDLED_CAPABILITY_CONTRACT_EXAMPLE_RELATIVE_PATH = path.join(
    'assets',
    'metaflow-ai-metadata',
    'capabilities',
    'metadata-authoring',
    'github-copilot-metadata-authoring',
    'CAPABILITY.md',
);

interface CapabilityManifestDestinationPick extends vscode.QuickPickItem {
    mode: 'suggested' | 'existing' | 'create';
    targetDirectory?: string;
}

interface ExistingCapabilityDirectoryPick extends vscode.QuickPickItem {
    mode: 'suggested' | 'existing';
    targetDirectory?: string;
}

interface FlatCapabilityDirectoryPick extends vscode.QuickPickItem {
    targetDirectory: string;
}

interface MetadataRepoPick extends vscode.QuickPickItem {
    repoId: string;
}

function normalizeCapabilityDirectorySegment(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim().replace(/\\/g, '/');
    if (normalized.length === 0 || normalized === '.' || normalized === '(root)') {
        return undefined;
    }

    return normalized;
}

function resolveCapabilityManifestSuggestedDirectory(
    state: ExtensionState,
    workspaceRoot: string,
    arg: unknown,
): string | undefined {
    if (!state.config) {
        return undefined;
    }

    const projectedConfig = buildGovernanceEvaluationConfig(state.config, state.builtInCapability);
    const { metadataRepos, layerSources } = ensureMultiRepoConfig(projectedConfig);
    const requestedRepoId = extractRepoId(arg);
    const requestedLayerPath = normalizeCapabilityDirectorySegment(extractLayerPath(arg));
    const requestedLayerIndex = extractLayerIndex(arg);

    if (requestedRepoId === BUILT_IN_CAPABILITY_REPO_ID) {
        return undefined;
    }

    if (typeof requestedRepoId === 'string') {
        const repo = metadataRepos.find((candidate) => candidate.id === requestedRepoId);
        if (!repo) {
            return undefined;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        let targetPath = requestedLayerPath;

        if (!targetPath && typeof requestedLayerIndex === 'number') {
            const layerSource = layerSources[requestedLayerIndex];
            if (layerSource?.repoId === requestedRepoId) {
                targetPath = normalizeCapabilityDirectorySegment(layerSource.path);
            }
        }

        return targetPath ? path.join(repoRoot, targetPath) : repoRoot;
    }

    if (requestedLayerPath && typeof requestedLayerIndex === 'number') {
        const source = layerSources[requestedLayerIndex];
        if (!source || source.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
            return undefined;
        }

        const repo = metadataRepos.find((candidate) => candidate.id === source.repoId);
        if (!repo) {
            return undefined;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        return path.join(repoRoot, requestedLayerPath);
    }

    return undefined;
}

async function promptForFlatCapabilityDirectory(
    state: ExtensionState,
    workspaceRoot: string,
): Promise<string | undefined> {
    if (!state.config) {
        return undefined;
    }

    const projectedConfig = buildGovernanceEvaluationConfig(state.config, state.builtInCapability);
    const { metadataRepos, layerSources } = ensureMultiRepoConfig(projectedConfig);

    const picks: FlatCapabilityDirectoryPick[] = [];
    for (const layerSource of layerSources) {
        if (layerSource.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
            continue;
        }

        const repo = metadataRepos.find((candidate) => candidate.id === layerSource.repoId);
        if (!repo) {
            continue;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        const normalizedLayerPath = normalizeCapabilityDirectorySegment(layerSource.path);
        const targetDirectory = normalizedLayerPath
            ? path.join(repoRoot, normalizedLayerPath)
            : repoRoot;
        const repoLabel = resolveRepoDisplayLabel(
            repo.id,
            repo.name,
            repo.localPath,
            state.repoMetadataById[repo.id]?.name,
        );
        const layerLabel = normalizedLayerPath ?? '(root)';

        picks.push({
            label: `${repoLabel} / ${layerLabel}`,
            description: repo.id,
            detail: targetDirectory,
            targetDirectory,
        });
    }

    if (picks.length === 0) {
        return undefined;
    }

    const selected = await vscode.window.showQuickPick(picks, {
        title: 'MetaFlow: Select Capability Destination',
        placeHolder: 'Select the capability directory to start from',
        ignoreFocusOut: true,
    });

    return selected?.targetDirectory;
}

async function promptForMetadataRepoId(state: ExtensionState): Promise<string | undefined> {
    if (!state.config) {
        return undefined;
    }

    const projectedConfig = buildGovernanceEvaluationConfig(state.config, state.builtInCapability);
    const { metadataRepos } = ensureMultiRepoConfig(projectedConfig);
    const picks: MetadataRepoPick[] = metadataRepos
        .filter((repo) => repo.id !== BUILT_IN_CAPABILITY_REPO_ID)
        .map((repo) => ({
            label: resolveRepoDisplayLabel(
                repo.id,
                repo.name,
                repo.localPath,
                state.repoMetadataById[repo.id]?.name,
            ),
            description: repo.id,
            detail: repo.localPath,
            repoId: repo.id,
        }));

    if (picks.length === 0) {
        return undefined;
    }

    if (picks.length === 1) {
        return picks[0].repoId;
    }

    const selected = await vscode.window.showQuickPick(picks, {
        title: 'MetaFlow: Select Repository Source',
        placeHolder:
            'Choose the metadata repository whose capability plugin metadata should be maintained',
        ignoreFocusOut: true,
    });

    return selected?.repoId;
}

async function promptForCapabilityManifestDirectory(options: {
    workspaceRoot: string;
    suggestedDirectory?: string;
}): Promise<string | undefined> {
    const picks: CapabilityManifestDestinationPick[] = [];
    if (options.suggestedDirectory) {
        picks.push({
            label: 'Use suggested directory',
            description: options.suggestedDirectory,
            detail: 'Create or open CAPABILITY.md in the contextual destination',
            mode: 'suggested',
            targetDirectory: options.suggestedDirectory,
        });
    }

    picks.push(
        {
            label: 'Choose existing directory',
            detail: 'Pick an existing folder for CAPABILITY.md',
            mode: 'existing',
        },
        {
            label: 'Create new directory',
            detail: 'Enter a directory path and create it if needed',
            mode: 'create',
        },
    );

    const selected = await vscode.window.showQuickPick(picks, {
        title: 'MetaFlow: Choose CAPABILITY.md Destination',
        placeHolder: 'Select how to choose the destination directory',
        ignoreFocusOut: true,
    });

    if (!selected) {
        return undefined;
    }

    if (selected.mode === 'suggested') {
        return selected.targetDirectory;
    }

    if (selected.mode === 'existing') {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Use Directory',
            defaultUri: vscode.Uri.file(options.suggestedDirectory ?? options.workspaceRoot),
        });
        return picked?.[0]?.fsPath;
    }

    const input = await vscode.window.showInputBox({
        title: 'MetaFlow: Create Capability Directory',
        prompt: 'Enter a directory path (absolute or relative to workspace root)',
        placeHolder: 'capabilities/new-capability',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value.trim()) {
                return 'Directory path is required.';
            }
            return undefined;
        },
    });

    if (!input) {
        return undefined;
    }

    const targetPath = path.isAbsolute(input.trim())
        ? input.trim()
        : path.join(options.workspaceRoot, input.trim());
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(targetPath));
    return targetPath;
}

async function promptForExistingCapabilityDirectory(options: {
    workspaceRoot: string;
    suggestedDirectory?: string;
}): Promise<string | undefined> {
    const picks: ExistingCapabilityDirectoryPick[] = [];
    if (options.suggestedDirectory) {
        picks.push({
            label: 'Use suggested capability directory',
            description: options.suggestedDirectory,
            detail: 'Maintain package metadata for the selected capability directory',
            mode: 'suggested',
            targetDirectory: options.suggestedDirectory,
        });
    }

    picks.push({
        label: 'Choose existing capability directory',
        detail: 'Pick an existing folder that already contains CAPABILITY.md',
        mode: 'existing',
    });

    const selected = await vscode.window.showQuickPick(picks, {
        title: 'MetaFlow: Choose Capability Directory',
        placeHolder: 'Select the capability directory to maintain',
        ignoreFocusOut: true,
    });

    if (!selected) {
        return undefined;
    }

    if (selected.mode === 'suggested') {
        return selected.targetDirectory;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use Capability Directory',
        defaultUri: vscode.Uri.file(options.suggestedDirectory ?? options.workspaceRoot),
    });
    return picked?.[0]?.fsPath;
}

function sanitizeCapabilityDirectoryName(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildCapabilityManifestStarterTemplateForName(capabilityName: string): string {
    const normalizedName = capabilityName.trim() || 'Capability Name';
    return [
        '---',
        `uid: ${randomUUID()}`,
        `name: ${normalizedName}`,
        'description: Describe what this capability offers in one direct declarative sentence.',
        'license: SEE-LICENSE-IN-REPO',
        'agentPlugin: true',
        '---',
        '',
        `# Capability: ${normalizedName}`,
        '',
        '## Mission',
        '',
        'Describe the primary purpose of this capability.',
        '',
        '## Scope',
        '',
        '- List the main assets, workflows, or concerns this capability owns.',
        '',
        '## Non-Goals',
        '',
        '- List 2 to 4 plausible adjacent responsibilities this capability intentionally does not own.',
        '- Keep these boundaries inside the same workflow or problem space; avoid unrelated disclaimer bullets.',
        '',
    ].join('\n');
}

function buildCapabilityPluginManifestStarterTemplate(
    capabilityName: string,
    capabilityDirectoryName: string,
): string {
    const normalizedCapabilityName = capabilityName.trim() || 'Capability Name';
    const normalizedPluginName =
        sanitizeCapabilityPluginName(capabilityDirectoryName) || 'capability';

    return `${JSON.stringify(
        {
            name: normalizedPluginName,
            version: '0.1.0',
            description: `${normalizedCapabilityName} agent plugin for MetaFlow capability consumers.`,
            keywords: ['metaflow', 'agent-plugin', 'capability'],
            agents: '.github/agents',
            skills: '.github/skills',
            rules: '.github/instructions',
            metaflow: {
                pluginHosts: ['github-copilot'],
                minimumMetaflowVersion: '^0.1.0-preview.0',
            },
        },
        null,
        2,
    )}\n`;
}

function isLikelySemverVersion(value: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.trim());
}

function normalizeStringArrayForPackage(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function sanitizeCapabilityPluginName(value: string): string {
    const normalizedBase = value.includes('/') ? (value.split('/').pop() ?? value) : value;
    return normalizedBase
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function ensureCapabilityManifestAgentPluginEnabled(rawText: string): {
    content: string;
    changed: boolean;
} {
    const normalized = rawText.replace(/^\uFEFF/, '');
    const frontmatterMatch = normalized.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?[\s\S]*)$/);
    if (!frontmatterMatch) {
        throw new Error(
            'CAPABILITY.md must contain valid frontmatter delimited by opening and closing --- markers.',
        );
    }

    const [, opening, frontmatterBody, suffix] = frontmatterMatch;
    const lines = frontmatterBody.split(/\r?\n/);
    let changed = false;
    let found = false;
    const updatedLines = lines.map((line) => {
        const match = line.match(/^\s*agentPlugin\s*:\s*(.*)$/);
        if (!match) {
            return line;
        }

        found = true;
        if (match[1].trim() === 'true') {
            return 'agentPlugin: true';
        }

        changed = true;
        return 'agentPlugin: true';
    });

    if (!found) {
        updatedLines.push('agentPlugin: true');
        changed = true;
    }

    return {
        content: `${opening}${updatedLines.join('\n')}${suffix}`,
        changed,
    };
}

export function mergeCapabilityWarningMessages(
    warnings: string[],
    nextWarnings: string[],
): boolean {
    let changed = false;

    for (const warning of nextWarnings) {
        const normalized = warning.trim();
        if (normalized.length === 0 || warnings.includes(normalized)) {
            continue;
        }

        warnings.push(normalized);
        changed = true;
    }

    return changed;
}

export function buildMaintainedCapabilityPluginManifestJson(options: {
    capabilityName: string;
    capabilityDescription?: string;
    capabilityDirectoryName: string;
    existingRawText?: string;
}): { content: string; changed: boolean } {
    let packageObject: Record<string, unknown> = {};
    const existingRawText = options.existingRawText;
    if (typeof existingRawText === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(existingRawText) as unknown;
        } catch (error) {
            throw new Error(`plugin.json could not be parsed: ${(error as Error).message}`);
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('plugin.json must contain a top-level JSON object.');
        }

        packageObject = { ...(parsed as Record<string, unknown>) };
    }

    const defaultPluginName =
        sanitizeCapabilityPluginName(options.capabilityDirectoryName) || 'capability';
    const currentName =
        typeof packageObject.name === 'string' && packageObject.name.trim().length > 0
            ? sanitizeCapabilityPluginName(packageObject.name)
            : undefined;
    packageObject.name = currentName || defaultPluginName;

    const currentVersion =
        typeof packageObject.version === 'string' && isLikelySemverVersion(packageObject.version)
            ? packageObject.version.trim()
            : undefined;
    packageObject.version = currentVersion ?? '0.1.0';

    const normalizedCapabilityName = options.capabilityName.trim() || 'Capability Name';
    const currentDescription =
        typeof packageObject.description === 'string' && packageObject.description.trim().length > 0
            ? packageObject.description.trim()
            : undefined;
    packageObject.description =
        currentDescription ??
        options.capabilityDescription?.trim() ??
        `${normalizedCapabilityName} agent plugin for MetaFlow capability consumers.`;

    const currentAgents =
        typeof packageObject.agents === 'string' && packageObject.agents.trim().length > 0
            ? packageObject.agents.trim()
            : undefined;
    packageObject.agents = currentAgents ?? '.github/agents';

    const currentSkills =
        typeof packageObject.skills === 'string' && packageObject.skills.trim().length > 0
            ? packageObject.skills.trim()
            : undefined;
    packageObject.skills = currentSkills ?? '.github/skills';

    const currentRules =
        typeof packageObject.rules === 'string' && packageObject.rules.trim().length > 0
            ? packageObject.rules.trim()
            : undefined;
    packageObject.rules = currentRules ?? '.github/instructions';

    const existingKeywords = normalizeStringArrayForPackage(packageObject.keywords) ?? [];
    const nextKeywords = [...existingKeywords];
    for (const keyword of ['metaflow', 'agent-plugin', 'capability']) {
        if (!nextKeywords.includes(keyword)) {
            nextKeywords.push(keyword);
        }
    }
    packageObject.keywords = nextKeywords;

    const existingMetaflow =
        packageObject.metaflow &&
        typeof packageObject.metaflow === 'object' &&
        !Array.isArray(packageObject.metaflow)
            ? { ...(packageObject.metaflow as Record<string, unknown>) }
            : {};
    const existingPluginHosts = normalizeStringArrayForPackage(existingMetaflow.pluginHosts);
    existingMetaflow.pluginHosts =
        existingPluginHosts && existingPluginHosts.length > 0
            ? existingPluginHosts
            : ['github-copilot'];
    const minimumMetaflowVersion =
        typeof existingMetaflow.minimumMetaflowVersion === 'string' &&
        existingMetaflow.minimumMetaflowVersion.trim().length > 0
            ? existingMetaflow.minimumMetaflowVersion.trim()
            : '^0.1.0';
    existingMetaflow.minimumMetaflowVersion = minimumMetaflowVersion;
    packageObject.metaflow = existingMetaflow;

    const nextContent = `${JSON.stringify(packageObject, null, 2)}\n`;
    return {
        content: nextContent,
        changed: existingRawText !== nextContent,
    };
}

export async function maintainCapabilityPluginMetadataInDirectory(
    capabilityDirectoryPath: string,
): Promise<{
    capabilityDirectoryPath: string;
    capabilityName: string;
    manifestPath: string;
    pluginJsonPath: string;
    manifestChanged: boolean;
    pluginJsonChanged: boolean;
}> {
    const manifestPath = path.join(capabilityDirectoryPath, 'CAPABILITY.md');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `${manifestPath} was not found. Choose a capability directory that already contains CAPABILITY.md.`,
        );
    }

    const manifestRawText = await fsp.readFile(manifestPath, 'utf-8');
    const manifestUpdate = ensureCapabilityManifestAgentPluginEnabled(manifestRawText);

    const capabilityId = path.basename(capabilityDirectoryPath);
    const manifest = loadCapabilityManifestForLayer(capabilityDirectoryPath, capabilityId);
    const capabilityName = manifest?.name?.trim() || capabilityId;
    const capabilityDescription = manifest?.description?.trim();

    const pluginJsonPath = path.join(capabilityDirectoryPath, 'plugin.json');
    const existingPluginJsonRawText = fs.existsSync(pluginJsonPath)
        ? await fsp.readFile(pluginJsonPath, 'utf-8')
        : undefined;

    const pluginUpdate = buildMaintainedCapabilityPluginManifestJson({
        capabilityName,
        capabilityDescription,
        capabilityDirectoryName: path.basename(capabilityDirectoryPath),
        existingRawText: existingPluginJsonRawText,
    });

    if (manifestUpdate.changed) {
        await fsp.writeFile(manifestPath, manifestUpdate.content, 'utf-8');
    }
    if (pluginUpdate.changed) {
        await fsp.writeFile(pluginJsonPath, pluginUpdate.content, 'utf-8');
    }

    return {
        capabilityDirectoryPath,
        capabilityName,
        manifestPath,
        pluginJsonPath,
        manifestChanged: manifestUpdate.changed,
        pluginJsonChanged: pluginUpdate.changed,
    };
}

export async function maintainCapabilityPluginMarketplaceInRepo(
    repoRoot: string,
    options: {
        repoId: string;
        excludePatterns?: string[];
        marketplaceName?: string;
        ownerName?: string;
    },
): Promise<{
    marketplacePath: string;
    changed: boolean;
    pluginCount: number;
    warnings: CapabilityWarning[];
}> {
    const layerPaths = discoverLayersInRepo(repoRoot, options.excludePatterns).sort((left, right) =>
        left.localeCompare(right),
    );
    const layers = layerPaths.map((layerPath) => {
        const capabilityDirectoryPath = path.join(repoRoot, layerPath);
        const capabilityId = path.basename(capabilityDirectoryPath);
        return {
            layerId: `${options.repoId}/${layerPath.replace(/\\/g, '/')}`,
            repoId: options.repoId,
            files: [],
            capability: loadCapabilityManifestForLayer(capabilityDirectoryPath, capabilityId),
        };
    });

    const agentPluginCatalog = buildAgentPluginCatalog(layers);
    const marketplace = buildCapabilityPluginMarketplaceManifest(agentPluginCatalog.entries, {
        repoRoot,
        marketplaceName: options.marketplaceName?.trim() || options.repoId,
        ownerName: options.ownerName?.trim() || path.basename(repoRoot),
    });

    const marketplacePath = path.join(repoRoot, '.github', 'plugin', 'marketplace.json');
    const nextContent = `${JSON.stringify(marketplace.manifest, null, 2)}\n`;
    const existingContent = fs.existsSync(marketplacePath)
        ? await fsp.readFile(marketplacePath, 'utf-8')
        : undefined;
    const changed = existingContent !== nextContent;

    if (changed) {
        await fsp.mkdir(path.dirname(marketplacePath), { recursive: true });
        await fsp.writeFile(marketplacePath, nextContent, 'utf-8');
    }

    return {
        marketplacePath,
        changed,
        pluginCount: marketplace.manifest.plugins.length,
        warnings: [...agentPluginCatalog.warnings, ...marketplace.warnings],
    };
}

export interface CapabilityPluginMaintenanceFailure {
    layerPath: string;
    message: string;
}

export interface CapabilityPluginMaintenanceResult {
    repoId: string;
    repoRoot: string;
    scannedCount: number;
    changedCount: number;
    unchangedCount: number;
    failureCount: number;
    changedCapabilities: string[];
    failures: CapabilityPluginMaintenanceFailure[];
    marketplacePath: string;
    marketplaceChanged: boolean;
    marketplacePluginCount: number;
    warnings: CapabilityWarning[];
}

function toRepoRelativeLayerPath(repoRoot: string, capabilityDirectoryPath: string): string {
    const absolutePath = path.isAbsolute(capabilityDirectoryPath)
        ? capabilityDirectoryPath
        : path.join(repoRoot, capabilityDirectoryPath);
    return path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
}

function hasCapabilityManifestAtPath(repoRoot: string, layerPath: string): boolean {
    const manifestPath = path.join(repoRoot, layerPath, 'CAPABILITY.md');
    try {
        return fs.statSync(manifestPath).isFile();
    } catch {
        return false;
    }
}

function discoverCapabilityDirectoryPathsInRepo(
    repoRoot: string,
    excludePatterns: string[] = [],
): string[] {
    return discoverLayersInRepo(repoRoot, excludePatterns).filter((layerPath) =>
        hasCapabilityManifestAtPath(repoRoot, layerPath),
    );
}

export function collectCapabilityPluginMaintenanceWarningMessages(options: {
    repoRoot: string;
    failures: CapabilityPluginMaintenanceFailure[];
    warnings: CapabilityWarning[];
}): string[] {
    const messages: string[] = [];

    for (const failure of options.failures) {
        const location = (
            path.isAbsolute(failure.layerPath)
                ? failure.layerPath
                : path.join(options.repoRoot, failure.layerPath)
        ).replace(/\\/g, '/');
        messages.push(
            `MetaFlow: Failed to maintain plugin metadata for ${failure.layerPath}. ${failure.message} [${location}]`,
        );
    }

    for (const warning of options.warnings) {
        messages.push(formatCapabilityWarningMessage(warning));
    }

    return messages;
}

export async function maintainAllCapabilityPluginMetadataInRepo(
    repoRoot: string,
    options: {
        repoId: string;
        excludePatterns?: string[];
        capabilityDirectoryPaths?: string[];
        marketplaceName?: string;
        ownerName?: string;
    },
): Promise<CapabilityPluginMaintenanceResult> {
    const layerPaths = (
        options.capabilityDirectoryPaths && options.capabilityDirectoryPaths.length > 0
            ? options.capabilityDirectoryPaths.map((capabilityDirectoryPath) =>
                  toRepoRelativeLayerPath(repoRoot, capabilityDirectoryPath),
              )
            : discoverCapabilityDirectoryPathsInRepo(repoRoot, options.excludePatterns)
    ).sort((left, right) => left.localeCompare(right));

    const changedResults: Array<
        Awaited<ReturnType<typeof maintainCapabilityPluginMetadataInDirectory>>
    > = [];
    const unchangedResults: Array<
        Awaited<ReturnType<typeof maintainCapabilityPluginMetadataInDirectory>>
    > = [];
    const failures: CapabilityPluginMaintenanceFailure[] = [];

    for (const layerPath of layerPaths) {
        try {
            const result = await maintainCapabilityPluginMetadataInDirectory(
                path.join(repoRoot, layerPath),
            );
            if (result.manifestChanged || result.pluginJsonChanged) {
                changedResults.push(result);
            } else {
                unchangedResults.push(result);
            }
        } catch (error: unknown) {
            failures.push({
                layerPath,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const marketplaceResult = await maintainCapabilityPluginMarketplaceInRepo(repoRoot, {
        repoId: options.repoId,
        excludePatterns: options.excludePatterns,
        marketplaceName: options.marketplaceName,
        ownerName: options.ownerName,
    });

    return {
        repoId: options.repoId,
        repoRoot,
        scannedCount: layerPaths.length,
        changedCount: changedResults.length,
        unchangedCount: unchangedResults.length,
        failureCount: failures.length,
        changedCapabilities: changedResults.map((result) =>
            toRepoRelativeLayerPath(repoRoot, result.capabilityDirectoryPath),
        ),
        failures,
        marketplacePath: marketplaceResult.marketplacePath,
        marketplaceChanged: marketplaceResult.changed,
        marketplacePluginCount: marketplaceResult.pluginCount,
        warnings: marketplaceResult.warnings,
    };
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
        // Refresh must stay local and responsive. Remote fetches belong to the
        // scheduled/manual repository update workflow, not the overlay refresh.
        const result = await checkRepoSyncStatus(target.localPath, undefined, { fetch: false });

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

export async function injectWorkspaceSettings(
    workspace: vscode.WorkspaceFolder,
    config: MetaFlowConfig,
    effectiveFiles: EffectiveFile[],
    context: vscode.ExtensionContext,
    builtInCapability: BuiltInCapabilityRuntimeState,
): Promise<void> {
    try {
        const previousState = readManagedSettingsState(context);
        const settingsEffectiveFiles = filterSettingsEligibleEffectiveFiles(
            effectiveFiles,
            builtInCapability,
        );
        const entries = computeSettingsEntries(
            settingsEffectiveFiles,
            workspace.uri.fsPath,
            config,
        );
        const entriesByKey = new Map(entries.map((entry) => [entry.key, entry.value] as const));
        const legacyEntriesByKey = new Map(
            computeLegacySettingsEntriesFromEffectiveFiles(
                settingsEffectiveFiles,
                workspace.uri.fsPath,
            ).map((entry) => [entry.key, entry.value] as const),
        );
        const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
        const managedKeys = computeSettingsKeysToRemove();

        const target = resolveSettingsInjectionTarget(workspace, config);

        if (!isBuiltInCapabilityEnabled(builtInCapability)) {
            await pruneDisabledBuiltInSettingsEntriesFromLocalScopes(wsConfig, managedKeys);
        }

        // Clean stale entries from a previously-used scope if the target changed
        if (previousState.effectiveTarget && previousState.effectiveTarget !== target.effective) {
            await cleanManagedEntriesFromScope(
                wsConfig,
                previousState.effectiveTarget,
                previousState.managedEntries?.[previousState.effectiveTarget],
                workspace,
            );
        }

        let managedPluginUris = normalizeManagedPluginUris(previousState.managedPluginUris);
        const newManagedEntriesByScope: Record<string, Record<string, unknown>> = {};

        for (const key of managedKeys) {
            try {
                const entryTarget = resolveSettingsEntryTarget(key, target);
                const existing = wsConfig.inspect(key);
                let scopeValue = getScopeValue(existing, entryTarget.effective);
                const newValue = entriesByKey.get(key);
                scopeValue = pruneBundledMetaFlowSettingsEntries(scopeValue, key, newValue);

                if (newValue === undefined) {
                    // Remove previously-managed entries for this key if any
                    const prevManaged =
                        previousState.managedEntries?.[entryTarget.effective]?.[key];
                    const legacyTargetManaged =
                        entryTarget.effective !== target.effective
                            ? previousState.managedEntries?.[target.effective]?.[key]
                            : undefined;
                    const legacyManaged = legacyEntriesByKey.get(key);
                    if (
                        prevManaged !== undefined ||
                        legacyTargetManaged !== undefined ||
                        legacyManaged !== undefined ||
                        scopeValue !== getScopeValue(existing, entryTarget.effective)
                    ) {
                        let cleaned = scopeValue;
                        if (prevManaged !== undefined) {
                            cleaned = removeSettingsEntries(cleaned, prevManaged);
                        }
                        if (legacyTargetManaged !== undefined) {
                            cleaned = removeSettingsEntries(cleaned, legacyTargetManaged);
                        }
                        if (legacyManaged !== undefined) {
                            cleaned = removeSettingsEntries(cleaned, legacyManaged);
                        }
                        await wsConfig.update(key, cleaned, entryTarget.configurationTarget);

                        if (legacyTargetManaged !== undefined) {
                            const legacyInspection = wsConfig.inspect(key);
                            const legacyScopeValue = getScopeValue(
                                legacyInspection,
                                target.effective,
                            );
                            const legacyCleaned = removeSettingsEntries(
                                legacyScopeValue,
                                legacyTargetManaged,
                            );
                            await wsConfig.update(key, legacyCleaned, target.configurationTarget);
                        }
                    }
                    continue;
                }

                // Remove previously-managed entries, then merge new ones
                const prevManaged = previousState.managedEntries?.[entryTarget.effective]?.[key];
                if (prevManaged !== undefined) {
                    scopeValue = removeSettingsEntries(scopeValue, prevManaged) ?? undefined;
                }

                if (entryTarget.effective !== target.effective) {
                    const legacyTargetManaged =
                        previousState.managedEntries?.[target.effective]?.[key];
                    if (legacyTargetManaged !== undefined) {
                        const legacyInspection = wsConfig.inspect(key);
                        const legacyScopeValue = getScopeValue(legacyInspection, target.effective);
                        const legacyCleaned = removeSettingsEntries(
                            legacyScopeValue,
                            legacyTargetManaged,
                        );
                        await wsConfig.update(key, legacyCleaned, target.configurationTarget);
                    }
                }

                const merged = mergeSettingsValue(scopeValue, newValue);
                await wsConfig.update(key, merged, entryTarget.configurationTarget);
                if (!newManagedEntriesByScope[entryTarget.effective]) {
                    newManagedEntriesByScope[entryTarget.effective] = {};
                }
                newManagedEntriesByScope[entryTarget.effective][key] = newValue;
            } catch (entryErr: unknown) {
                const entryMsg = entryErr instanceof Error ? entryErr.message : String(entryErr);
                logWarn(`Settings key update skipped (${key}): ${entryMsg}`);
            }
        }

        try {
            const nextManagedPluginUris = computePluginRootPaths(settingsEffectiveFiles).map(
                (pluginRoot) => vscode.Uri.file(pluginRoot).toString(),
            );
            await updateManagedCopilotPluginSettings(
                workspace.uri.fsPath,
                managedPluginUris,
                nextManagedPluginUris,
                collectConfiguredMetadataRepoRoots(config, workspace.uri.fsPath, builtInCapability),
            );
            managedPluginUris = normalizeManagedPluginUris(nextManagedPluginUris);
        } catch (pluginErr: unknown) {
            const pluginMsg = pluginErr instanceof Error ? pluginErr.message : String(pluginErr);
            logWarn(`Copilot plugin enablement update skipped: ${pluginMsg}`);
        }

        await writeManagedSettingsState(context, {
            requestedTarget: target.requested,
            effectiveTarget: target.effective,
            managedEntries: newManagedEntriesByScope,
            managedPluginUris: managedPluginUris.length > 0 ? managedPluginUris : undefined,
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

async function pruneDisabledBuiltInSettingsEntriesFromLocalScopes(
    wsConfig: vscode.WorkspaceConfiguration,
    keys: string[],
): Promise<void> {
    const targets: Array<{
        scope: SettingsInjectionTarget;
        target: vscode.ConfigurationTarget;
    }> = [
        { scope: 'workspace', target: vscode.ConfigurationTarget.Workspace },
        { scope: 'workspaceFolder', target: vscode.ConfigurationTarget.WorkspaceFolder },
    ];

    for (const key of keys) {
        for (const { scope, target } of targets) {
            try {
                const inspection = wsConfig.inspect(key);
                const scopeValue = getScopeValue(inspection, scope);
                const cleaned = pruneBundledMetaFlowSettingsEntries(scopeValue, key, undefined);
                if (cleaned !== scopeValue) {
                    await wsConfig.update(key, cleaned, target);
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logWarn(`Disabled built-in settings pruning skipped (${key}, ${scope}): ${msg}`);
            }
        }
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

export async function clearManagedWorkspaceSettings(
    workspace: vscode.WorkspaceFolder,
    context: vscode.ExtensionContext,
): Promise<void> {
    const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
    const keysToRemove = computeSettingsKeysToRemove();
    const previousState = readManagedSettingsState(context);

    // Clean managed entries from all scopes MetaFlow wrote to.
    if (previousState.managedEntries && Object.keys(previousState.managedEntries).length > 0) {
        for (const [scope, entries] of Object.entries(previousState.managedEntries)) {
            await cleanManagedEntriesFromScope(
                wsConfig,
                scope as SettingsInjectionTarget,
                entries,
                workspace,
            );
        }
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

    let remainingManagedPluginUris: string[] | undefined;
    if ((previousState.managedPluginUris?.length ?? 0) > 0) {
        try {
            await updateManagedCopilotPluginSettings(
                workspace.uri.fsPath,
                previousState.managedPluginUris ?? [],
                [],
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logWarn(`Copilot plugin enablement cleanup skipped: ${msg}`);
            remainingManagedPluginUris = normalizeManagedPluginUris(
                previousState.managedPluginUris,
            );
        }
    }

    await writeManagedSettingsState(
        context,
        remainingManagedPluginUris && remainingManagedPluginUris.length > 0
            ? { managedPluginUris: remainingManagedPluginUris }
            : {},
    );
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

        const latestConfig = loadLatestConfigForMutation(getWorkspace()?.uri.fsPath ?? '', state);

        return {
            config: latestConfig ?? state.config,
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

        const candidateConfig = cloneConfig(loaded.config);
        candidateConfig.activeProfile = profileId;
        const nextProfile = candidateConfig.profiles?.[profileId];
        const applied = await executeGovernedMutation({
            actionLabel: `switching profile to ${getProfileDisplayName(profileId, nextProfile)}`,
            state,
            candidateConfig,
            persist: async () => {
                await persistConfig(loaded.configPath, candidateConfig, state);
                state.config = candidateConfig;
                state.activeProfile = candidateConfig.activeProfile;
            },
        });
        if (!applied) {
            return;
        }

        logInfo(`Switched profile to: ${getProfileDisplayName(profileId, nextProfile)}`);
        await vscode.commands.executeCommand('metaflow.refresh', { preferStateConfig: true });
    };

    const refreshOpenCapabilityDetailsPanel = async (options?: { enabled?: boolean }) => {
        const request = capabilityDetailsPanel.getCurrentRequest();
        const ws = getWorkspace();
        const latestConfig = ws ? loadLatestConfigForMutation(ws.uri.fsPath, state) : undefined;
        const detailConfig = latestConfig ?? state.config;
        if (!request || !ws || !detailConfig) {
            return capabilityDetailsPanel.getSnapshot();
        }

        const target = resolveCapabilityDetailTarget(
            detailConfig,
            ws.uri.fsPath,
            state.builtInCapability,
            request,
        );
        if (!target) {
            if (options?.enabled !== undefined) {
                return capabilityDetailsPanel.updateEnabledState(options.enabled);
            }
            return capabilityDetailsPanel.getSnapshot();
        }

        const model = await loadCapabilityDetailModel(target, state.treeSummaryCache, {
            governanceContract: state.governanceContract,
            governanceContractErrors: state.governanceContractErrors,
            governanceCompliance: state.governanceCompliance,
        });
        capabilityDetailsPanel.update(
            options?.enabled === undefined ? model : { ...model, enabled: options.enabled },
        );
        return capabilityDetailsPanel.getSnapshot();
    };

    // ── metaflow.refresh ───────────────────────────────────────────
    const runRefresh = async (requestOptions: RefreshCommandOptions): Promise<void> => {
            const arg = requestOptions;
            const refreshOptions = extractRefreshCommandOptions(arg);
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const refreshTimer = createPerformanceTimer();
            const flushRefreshTimings = (terminalLabel: string): void => {
                refreshTimer.mark(terminalLabel);
                for (const timing of refreshTimer.records()) {
                    logDebug(
                        `MetaFlow refresh timing: ${timing.label} ${timing.durationMs.toFixed(1)}ms`,
                    );
                }
            };

            const notifyStateChanged = (): void => {
                if (!refreshOptions.skipStateChangeEvent) {
                    state.onDidChange.fire();
                }
            };
            const autoAcceptRefreshUpdatesInTests =
                context.extensionMode === vscode.ExtensionMode.Test;
            const workspaceConfig = vscode.workspace.getConfiguration('metaflow', ws.uri);
            const autoApplyEnabled = workspaceConfig.get<boolean>('autoApply', true);
            let autoAcceptRefreshUpdates =
                autoAcceptRefreshUpdatesInTests ||
                workspaceConfig.get<boolean>(AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY, false);
            const suppressRefreshUpdatePrompts =
                refreshOptions.nonInteractive === true && !autoAcceptRefreshUpdates;
            const pendingCapabilityPluginMetadataDirtyVersion =
                state.capabilityPluginMetadataDirtyVersion;
            logInfo('Refreshing overlay...');
            if (!refreshOptions.skipLoadingState) {
                updateStatusBar('loading');
                state.isLoading = true;
                notifyStateChanged();
            }

            try {
                const result =
                    refreshOptions.preferStateConfig === true && state.config && state.configPath
                        ? {
                              ok: true as const,
                              config: cloneConfig(state.config),
                              configPath: state.configPath,
                              migrated: false,
                              migrationMessages: [],
                          }
                        : loadConfig(ws.uri.fsPath);
                refreshTimer.mark('config-load');
                if (!result.ok) {
                    // A genuinely missing config (no configPath) is the first-run
                    // state, not an error: the config tree's welcome view surfaces an
                    // "Initialize Configuration" action. That welcome view only renders
                    // when the tree is empty, so the missing case must not emit a
                    // warning toast or a tree warning — otherwise the warning row
                    // suppresses the Initialize action. Invalid configs (configPath set)
                    // keep their warning surfaces.
                    const configMissing = !result.configPath;
                    logError(`Config errors: ${result.errors.map((e) => e.message).join('; ')}`);
                    publishConfigDiagnostics(diagnosticCollection, result);
                    await clearManagedWorkspaceSettings(ws, context);
                    if (configMissing) {
                        logWarn('MetaFlow: No .metaflow/config.jsonc found at workspace root.');
                    } else {
                        vscode.window.showWarningMessage(
                            'MetaFlow: Found config file, but it is invalid. Check Problems for details.',
                        );
                    }
                    updateStatusBar('error');
                    state.config = undefined;
                    state.configPath = undefined;
                    state.activeProfile = undefined;
                    state.baseProfileFiles = [];
                    state.effectiveFiles = [];
                    state.capabilityByLayer = {};
                    state.repoMetadataById = {};
                    state.governanceContract = undefined;
                    state.governanceContractPath = undefined;
                    state.governanceContractErrors = [];
                    state.governanceCompliance = undefined;
                    state.capabilityWarnings = [];
                    state.configWarnings = configMissing
                        ? []
                        : result.errors.map(formatConfigWarningMessage);
                    state.capabilityDiagnosticFilePaths = [];
                    state.agentPluginCatalog = [];
                    state.localGitRepoIds = new Set<string>();
                    state.treeSummaryCache = undefined;
                    invalidateRepoSyncStatus(state);
                    state.capabilityPluginMetadataSettledVersion = Math.max(
                        state.capabilityPluginMetadataSettledVersion,
                        pendingCapabilityPluginMetadataDirtyVersion,
                    );
                    state.isLoading = false;
                    notifyStateChanged();
                    flushRefreshTimings('refresh-invalid-config');
                    return;
                }

                clearDiagnostics(diagnosticCollection);
                state.configWarnings = [];
                state.capabilityDiagnosticFilePaths = [];
                const governanceResult = loadGovernanceContract(ws.uri.fsPath);
                publishGovernanceDiagnostics(diagnosticCollection, governanceResult);
                state.governanceContract = governanceResult.ok
                    ? governanceResult.contract
                    : undefined;
                state.governanceContractPath = governanceResult.contractPath;
                state.governanceContractErrors = governanceResult.ok
                    ? []
                    : governanceResult.errors.map(cloneConfigError);
                state.governanceCompliance = undefined;
                let shouldAdvanceCapabilityIdentitySnapshot = true;
                if (!refreshOptions.skipConfigMaintenance) {
                    const configNormalized = normalizeAndDeduplicateLayerPaths(result.config);
                    const discoveryResult = discoverAndPersistConfiguredRepoLayers(
                        result.config,
                        ws.uri.fsPath,
                        refreshOptions.forceDiscoveryRepoId,
                        { enableDiscovery: true },
                    );
                    let capabilityRepairPreview: CapabilityIdentityDriftRepairPreview | undefined;
                    try {
                        capabilityRepairPreview = previewCapabilityIdentityDriftRepair(
                            result.config,
                            ws.uri.fsPath,
                        );
                    } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        logWarn(`Capability identity drift repair skipped: ${message}`);
                    }
                    if (
                        (result.migrated ||
                            configNormalized ||
                            discoveryResult.totalAdded > 0 ||
                            (capabilityRepairPreview?.repairResult.repaired.length ?? 0) > 0) &&
                        result.configPath
                    ) {
                        const pendingConfigUpdateReasons: string[] = [];
                        if (result.migrated) {
                            pendingConfigUpdateReasons.push(
                                'Migrate existing config to the current MetaFlow format.',
                            );
                        }
                        if (configNormalized) {
                            pendingConfigUpdateReasons.push(
                                'Normalize redundant layer path entries.',
                            );
                        }
                        if (discoveryResult.totalAdded > 0) {
                            pendingConfigUpdateReasons.push(
                                `Add ${discoveryResult.totalAdded} discovered capability layer(s).`,
                            );
                        }
                        const pendingRepairCount =
                            capabilityRepairPreview?.repairResult.repaired.length ?? 0;
                        if (pendingRepairCount > 0) {
                            pendingConfigUpdateReasons.push(
                                `Heal ${pendingRepairCount} stale capability reference(s) after metadata moved.`,
                            );
                        }

                        const configUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates
                            ? { shouldPersist: true, rememberPreference: false }
                            : suppressRefreshUpdatePrompts
                              ? { shouldPersist: false, rememberPreference: false }
                              : await decideConfigUpdate(
                                    result.configPath,
                                    pendingConfigUpdateReasons,
                                );
                        if (configUpdateDecision.rememberPreference) {
                            await persistAutoAcceptRefreshUpdatesPreference(workspaceConfig);
                            autoAcceptRefreshUpdates = true;
                        }
                        const shouldPersistConfig = configUpdateDecision.shouldPersist;

                        if (shouldPersistConfig && capabilityRepairPreview) {
                            capabilityRepairPreview.repairResult =
                                applyCapabilityIdentityDriftRepair(
                                    result.config,
                                    ws.uri.fsPath,
                                    capabilityRepairPreview.managedState,
                                );
                        }

                        if (shouldPersistConfig) {
                            await persistConfig(result.configPath, result.config, state);
                        } else {
                            logInfo(
                                'Skipped writing pending .metaflow/config.jsonc updates after user selection.',
                            );
                            if (pendingRepairCount > 0) {
                                shouldAdvanceCapabilityIdentitySnapshot = false;
                            }
                        }

                        if (shouldPersistConfig && result.migrated) {
                            for (const message of result.migrationMessages ?? []) {
                                logInfo(message);
                            }
                            void vscode.window.showInformationMessage(
                                getConfigMigrationNoticeMessage(),
                            );
                        }
                        if (shouldPersistConfig && configNormalized) {
                            logInfo(
                                'Normalized layer paths in config (removed redundant .github suffix entries).',
                            );
                        }
                        if (shouldPersistConfig && discoveryResult.totalAdded > 0) {
                            const rescannedScope =
                                discoveryResult.rescannedRepoIds.length > 1
                                    ? `${discoveryResult.rescannedRepoIds.length} repositories`
                                    : (discoveryResult.rescannedRepoIds[0] ?? 'repository');
                            logInfo(
                                `Discovered ${discoveryResult.totalAdded} new layer(s) while rescanning ${rescannedScope}.`,
                            );
                        }
                        for (const repair of shouldPersistConfig
                            ? (capabilityRepairPreview?.repairResult.repaired ?? [])
                            : []) {
                            const scope =
                                repair.source === 'profiles.layerOverrides' && repair.profileId
                                    ? `${repair.repoId}/${repair.oldPath} in profile ${repair.profileId}`
                                    : `${repair.repoId}/${repair.oldPath}`;
                            logInfo(
                                `Repaired capability reference ${scope} -> ${repair.newPath} (${repair.matchReason}).`,
                            );
                        }
                    }
                }
                refreshTimer.mark('config-maintenance');
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
                if (!refreshOptions.skipBuiltInAutoApply) {
                    state.builtInCapability = await ensureBuiltInCapabilityFromAutoApplySetting(
                        context,
                        ws.uri.fsPath,
                        state.builtInCapability,
                        aiMetadataAutoApplyMode,
                    );
                }

                const projectedConfigForBuiltInRepair = withBuiltInCapabilityProjected(
                    result.config,
                    state.builtInCapability,
                );
                const builtInRepairPreview = previewBuiltInCapabilityStateDriftRepair(
                    state.builtInCapability,
                    ws.uri.fsPath,
                    projectedConfigForBuiltInRepair,
                );
                if (builtInRepairPreview.repairs.length > 0) {
                    const builtInUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates
                        ? { shouldPersist: true, rememberPreference: false }
                        : suppressRefreshUpdatePrompts
                          ? { shouldPersist: false, rememberPreference: false }
                          : await decideBuiltInCapabilityStateUpdate(builtInRepairPreview.repairs);
                    if (builtInUpdateDecision.rememberPreference) {
                        await persistAutoAcceptRefreshUpdatesPreference(workspaceConfig);
                        autoAcceptRefreshUpdates = true;
                    }
                    const shouldUpdateBuiltInState = builtInUpdateDecision.shouldPersist;
                    if (shouldUpdateBuiltInState) {
                        state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                            context,
                            state.builtInCapability,
                            { layerStates: builtInRepairPreview.layerStates },
                        );
                        for (const repair of builtInRepairPreview.repairs) {
                            logInfo(
                                `Repaired built-in capability selection ${repair.oldPath} -> ${repair.newPath} (${repair.matchReason}).`,
                            );
                        }
                    } else {
                        logInfo(
                            'Skipped writing pending built-in capability selection updates after user selection.',
                        );
                        shouldAdvanceCapabilityIdentitySnapshot = false;
                    }
                }

                const gitRepos = resolveGitBackedRepoSources(result.config, ws.uri.fsPath);
                state.localGitRepoIds = await discoverLocalGitRepoIds(result.config, ws.uri.fsPath);
                if (refreshOptions.skipRepoSync === true) {
                    pruneRepoSyncStatusToRepos(
                        state,
                        gitRepos.map((repo) => repo.repoId),
                    );
                } else {
                    await refreshRepoSyncStatusCache(state, gitRepos);
                }
                refreshTimer.mark('repo-status');

                let overlayResolved = false;
                const layerResolutionCache: ResolveLayersCache = {
                    layerContents: new Map(),
                    discoveredLayerPaths: new Map(),
                };

                try {
                    const injectionConfig = resolveInjectionConfig(ws, result.config);
                    const shouldEnableDiscovery =
                        autoApplyEnabled || refreshOptions.forceDiscovery === true;
                    const activeProfileConfig = projectConfigForProfile(result.config);
                    const projectedConfig = withBuiltInCapabilityProjected(
                        result.config,
                        state.builtInCapability,
                    );
                    if (shouldAdvanceCapabilityIdentitySnapshot) {
                        saveCapabilityIdentitySnapshot(projectedConfig, ws.uri.fsPath);
                    }
                    const activeProfileProjectedConfig = projectConfigForProfile(projectedConfig);
                    if (governanceResult.ok) {
                        state.governanceCompliance = evaluateGovernanceCompliance(
                            governanceResult.contract,
                            activeProfileProjectedConfig,
                        );
                        publishGovernanceComplianceDiagnostics(
                            diagnosticCollection,
                            governanceResult.contractPath,
                            state.governanceCompliance,
                        );
                    }
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
                            layerResolutionCache,
                        },
                    );
                    state.baseProfileFiles = overlay.baseProfileFiles;
                    state.effectiveFiles = overlay.effectiveFiles;
                    state.capabilityByLayer = overlay.capabilityByLayer;
                    state.capabilityWarnings = overlay.capabilityWarnings;
                    state.agentPluginCatalog = overlay.agentPluginCatalog;
                    const configuredSourceDiagnosticWarnings =
                        collectEnabledConfiguredSourceDiagnosticWarnings(
                            activeProfileConfig,
                            ws.uri.fsPath,
                            result.configPath,
                        );
                    for (const warning of configuredSourceDiagnosticWarnings) {
                        if (!state.capabilityWarnings.includes(warning.message)) {
                            state.capabilityWarnings.push(warning.message);
                            logWarn(warning.message);
                        }
                    }
                    publishConfigWarningDiagnostics(
                        diagnosticCollection,
                        result.configPath,
                        configuredSourceDiagnosticWarnings,
                    );
                    state.configWarnings = configuredSourceDiagnosticWarnings.map(
                        formatConfigWarningMessage,
                    );
                    state.capabilityDiagnosticFilePaths = replaceCapabilityWarningDiagnostics(
                        diagnosticCollection,
                        state.capabilityDiagnosticFilePaths,
                        overlay.capabilityDiagnostics,
                    );
                    const profileEffectiveFilesByName = buildProfileEffectiveFilesLookup(
                        projectedConfig,
                        ws.uri.fsPath,
                        injectionConfig,
                        result.config.activeProfile,
                        state.effectiveFiles,
                        {
                            enableDiscovery: shouldEnableDiscovery,
                            forceDiscoveryRepoIds: refreshOptions.forceDiscoveryRepoId
                                ? [refreshOptions.forceDiscoveryRepoId]
                                : undefined,
                            builtInCapability: state.builtInCapability,
                            layerResolutionCache,
                        },
                    );
                    state.treeSummaryCache = await buildTreeSummaryCache(
                        projectedConfig,
                        ws.uri.fsPath,
                        state.effectiveFiles,
                        state.baseProfileFiles,
                        state.builtInCapability,
                        profileEffectiveFilesByName,
                    );
                    refreshTimer.mark('overlay-and-tree-summary');
                    if (!refreshOptions.skipSettingsInjection) {
                        await injectWorkspaceSettings(
                            ws,
                            result.config,
                            state.effectiveFiles,
                            context,
                            state.builtInCapability,
                        );
                        refreshTimer.mark('settings-injection');
                    }
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
                    state.configWarnings = [];
                    state.localGitRepoIds = new Set<string>();
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

                state.capabilityPluginMetadataSettledVersion = Math.max(
                    state.capabilityPluginMetadataSettledVersion,
                    pendingCapabilityPluginMetadataDirtyVersion,
                );
                state.isLoading = false;
                notifyStateChanged();
                refreshTimer.mark('state-ready');

                if (!refreshOptions.skipAutoApply && overlayResolved) {
                    if (autoApplyEnabled) {
                        logInfo('Auto-apply enabled; applying overlay after refresh.');
                        await vscode.commands.executeCommand('metaflow.apply', {
                            skipRefresh: true,
                            markApply: result.migrated,
                        });
                    }
                }

                await offerPluginInjectionUpgrade({
                    context,
                    state,
                    workspaceRoot: ws.uri.fsPath,
                    skipPrompt:
                        refreshOptions.nonInteractive === true ||
                        context.extensionMode === vscode.ExtensionMode.Test,
                });
                flushRefreshTimings('refresh-complete');
            } catch (err: unknown) {
                state.isLoading = false;
                notifyStateChanged();
                flushRefreshTimings('refresh-error');
                throw err;
            }
        };

    const refreshCoordinator = createRefreshCoordinator<RefreshCommandOptions>({
        execute: runRefresh,
        merge: mergeRefreshCommandOptions,
    });
    context.subscriptions.push({ dispose: () => refreshCoordinator.dispose() });
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.refresh', (arg?: unknown) =>
            refreshCoordinator.request(extractRefreshCommandOptions(arg)),
        ),
    );

    // ── metaflow.preview ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.preview', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            try {
                const changes = preview(
                    ws.uri.fsPath,
                    state.effectiveFiles,
                    undefined,
                    state.config.fileNamingStrategy,
                    state.config.layerSources,
                );
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
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                showOutputChannel();
                logError(message);
                vscode.window.showErrorMessage(`MetaFlow: ${message}`);
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
            const config = state.config;

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
                            fileNamingStrategy: config.fileNamingStrategy,
                            layerSources: config.layerSources,
                        });

                        // Inject settings for settings-backed files (may fail if Copilot extension not present)
                        await injectWorkspaceSettings(
                            ws,
                            config,
                            state.effectiveFiles,
                            context,
                            state.builtInCapability,
                        );
                        logInfo(
                            `Apply complete: ${result.written.length} written, ${result.skipped.length} skipped, ${result.removed.length} removed.`,
                        );
                        if (applyOptions.markApply) {
                            const managedState = loadManagedState(ws.uri.fsPath);
                            managedState.lastApply = new Date().toISOString();
                            saveManagedState(ws.uri.fsPath, managedState);
                        }
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
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                showOutputChannel();
                logError(message);
                vscode.window.showErrorMessage(`MetaFlow: ${message}`);
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

            // Skip the confirmation dialog when there is nothing to clean.
            const syncedFilesCount = Object.keys(loadManagedState(ws.uri.fsPath).files).length;
            const managedSettingsState = readManagedSettingsState(context);
            const hasManagedSettings =
                Object.values(managedSettingsState.managedEntries ?? {}).some(
                    (entries) => Object.keys(entries).length > 0,
                ) || (managedSettingsState.managedPluginUris?.length ?? 0) > 0;

            if (syncedFilesCount === 0 && !hasManagedSettings) {
                vscode.window.showInformationMessage('MetaFlow: Nothing to clean.');
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
                        skipSettingsInjection: true,
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

            if (state.governanceContractErrors.length > 0) {
                emitWarn(
                    `Governance: invalid (${state.governanceContractErrors.length} contract diagnostic(s))`,
                );
            } else if (state.governanceCompliance?.status === 'not-applicable') {
                emitInfo('Governance: not configured');
            } else if (state.governanceCompliance) {
                emitInfo(
                    `Governance: ${state.governanceCompliance.status} (severity: ${state.governanceCompliance.severity})`,
                );
                if (state.governanceCompliance.allowedProfiles.length > 0) {
                    emitInfo(
                        `Governance Allowed Profiles: ${state.governanceCompliance.allowedProfiles.join(', ')}`,
                    );
                }
                if (state.governanceCompliance.lockedProfiles.length > 0) {
                    emitInfo(
                        `Governance Locked Profiles: ${state.governanceCompliance.lockedProfiles.join(', ')}`,
                    );
                }
                if (state.governanceCompliance.activeProfileLocked) {
                    emitInfo('Governance Active Profile Lock: active');
                }
                if (state.governanceCompliance.violations.length > 0) {
                    emitWarn(
                        `Governance Violations: ${state.governanceCompliance.violations.length}`,
                    );
                    for (const violation of state.governanceCompliance.violations) {
                        emitWarn(`  [${violation.id}] ${violation.message}`);
                    }
                }
            }

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
            const deferRefresh =
                typeof arg === 'object' &&
                arg !== null &&
                (arg as { deferRefresh?: unknown }).deferRefresh === true;
            if (repoIdFromArg === BUILT_IN_CAPABILITY_REPO_ID) {
                const nextLayerEnabled =
                    typeof requestedCheckedState === 'boolean'
                        ? requestedCheckedState
                        : !state.builtInCapability.layerEnabled;
                const candidateBuiltInCapability =
                    typeof requestedLayerPath === 'string'
                        ? previewBuiltInLayerEnabledState(
                              state.builtInCapability,
                              requestedLayerPath,
                              nextLayerEnabled,
                          )
                        : previewBuiltInRootLayerEnabledState(
                              state.builtInCapability,
                              nextLayerEnabled,
                          );
                const candidateConfig = state.config ? cloneConfig(state.config) : undefined;
                const applied = await executeGovernedMutation({
                    actionLabel: `toggling built-in MetaFlow capability${typeof requestedLayerPath === 'string' ? ` layer ${normalizeBuiltInLayerPath(requestedLayerPath)}` : ''}`,
                    state,
                    candidateConfig,
                    candidateBuiltInCapability,
                    persist: async () => {
                        state.builtInCapability =
                            typeof requestedLayerPath === 'string'
                                ? await writeBuiltInLayerEnabledState(
                                      context,
                                      state.builtInCapability,
                                      requestedLayerPath,
                                      nextLayerEnabled,
                                  )
                                : await writeBuiltInCapabilityWorkspaceState(
                                      context,
                                      state.builtInCapability,
                                      {
                                          enabled: nextLayerEnabled,
                                          layerEnabled: nextLayerEnabled,
                                          disabledByUser: !nextLayerEnabled,
                                          layerStates: {},
                                      },
                                  );
                    },
                });
                if (!applied) {
                    return;
                }

                logInfo(
                    `Toggled built-in MetaFlow capability${typeof requestedLayerPath === 'string' ? ` layer ${normalizeBuiltInLayerPath(requestedLayerPath)}` : ''}: ${nextLayerEnabled ? 'enabled' : 'disabled'}`,
                );
                if (!deferRefresh) {
                    await vscode.commands.executeCommand('metaflow.refresh', {
                        skipRepoSync: true,
                        preferStateConfig: true,
                    });
                }
                return refreshOpenCapabilityDetailsPanel({ enabled: nextLayerEnabled });
            }

            if (!state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            try {
                const candidateConfig = cloneConfig(state.config);
                const projectedConfig = projectConfigForProfile(candidateConfig);
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
                    candidateConfig,
                    layerSource.repoId,
                    layerSource.path,
                    { enabled: nextLayerEnabled },
                );

                if (!scopedMutation.scopedToProfile) {
                    const runtimeConfig = ensureMultiRepoConfig(candidateConfig);
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
                    syncLayerSourceToCapabilityConfig(candidateConfig, runtimeLayerSource);
                }

                let repoAutoEnabled = false;
                if (nextLayerEnabled) {
                    const runtimeRepos = ensureMultiRepoConfig(candidateConfig).metadataRepos;
                    const runtimeRepo = runtimeRepos.find(
                        (candidate) => candidate.id === layerSource.repoId,
                    );
                    if (runtimeRepo) {
                        repoAutoEnabled = runtimeRepo.enabled === false;
                        runtimeRepo.enabled = true;
                    }
                }

                const applied = await executeGovernedMutation({
                    actionLabel: `toggling layer ${layerSource.repoId}/${layerSource.path}`,
                    state,
                    candidateConfig,
                    persist: async () => {
                        if (state.configPath) {
                            await persistConfig(state.configPath, candidateConfig, state);
                        }
                        state.config = candidateConfig;
                        state.activeProfile = candidateConfig.activeProfile;
                    },
                });
                if (!applied) {
                    return;
                }

                logInfo(
                    `Toggled layer ${layerSource.repoId}/${layerSource.path}: ${nextLayerEnabled ? 'enabled' : 'disabled'}${scopedMutation.profileId ? ` (profile: ${scopedMutation.profileId})` : ''}`,
                );
                if (repoAutoEnabled) {
                    logInfo(`Enabled repo source ${layerSource.repoId} because layer was enabled.`);
                }
                if (!deferRefresh) {
                    await vscode.commands.executeCommand('metaflow.refresh', {
                        skipRepoSync: true,
                        preferStateConfig: true,
                    });
                }
                return refreshOpenCapabilityDetailsPanel({ enabled: nextLayerEnabled });
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
            const deferRefresh =
                typeof arg === 'object' &&
                arg !== null &&
                (arg as { deferRefresh?: unknown }).deferRefresh === true;
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
            const candidateConfig = cloneConfig(state.config);
            const runtimeConfig = ensureMultiRepoConfig(candidateConfig);
            const projectedConfig = withBuiltInCapabilityProjected(
                projectConfigForProfile(candidateConfig),
                state.builtInCapability,
            );
            const { metadataRepos } = runtimeConfig;
            const { layerSources: projectedLayerSources } = ensureMultiRepoConfig(projectedConfig);
            const matchedLayers = new Map<
                string,
                {
                    repoId: string;
                    path: string;
                    layerSource?: (typeof runtimeConfig.layerSources)[number];
                    capability?: NonNullable<
                        NonNullable<(typeof metadataRepos)[number]['capabilities']>
                    >[number];
                }
            >();
            const updatedLayerIds = new Set<string>();
            const scopedMutation = getScopedLayerMutationProfile(candidateConfig);

            for (const layerSource of projectedLayerSources) {
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

            const updatedBuiltInLayerPaths = new Set<string>();

            for (const matchedLayer of matchedLayers.values()) {
                if (matchedLayer.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    updatedBuiltInLayerPaths.add(matchedLayer.path);
                    updatedLayerIds.add(
                        `${matchedLayer.repoId}:${normalizeCommandLayerPath(matchedLayer.path)}`,
                    );
                    continue;
                }

                if (scopedMutation) {
                    updateProfileLayerOverride(
                        scopedMutation.profile,
                        matchedLayer.repoId,
                        matchedLayer.path,
                        { enabled: requestedCheckedState },
                    );
                } else if (matchedLayer.layerSource) {
                    matchedLayer.layerSource.enabled = requestedCheckedState;
                    syncLayerSourceToCapabilityConfig(candidateConfig, matchedLayer.layerSource);
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

            const candidateBuiltInCapability =
                updatedBuiltInLayerPaths.size > 0
                    ? previewBuiltInLayerEnabledStates(
                          state.builtInCapability,
                          updatedBuiltInLayerPaths,
                          requestedCheckedState,
                      )
                    : state.builtInCapability;

            const applied = await executeGovernedMutation({
                actionLabel: `toggling branch ${requestedRepoId ?? 'all repos'}/${normalizedBranchPath}`,
                state,
                candidateConfig,
                candidateBuiltInCapability,
                persist: async () => {
                    if (updatedBuiltInLayerPaths.size > 0) {
                        state.builtInCapability = await writeBuiltInLayerEnabledStates(
                            context,
                            state.builtInCapability,
                            updatedBuiltInLayerPaths,
                            requestedCheckedState,
                        );
                    }
                    if (state.configPath) {
                        await persistConfig(state.configPath, candidateConfig, state);
                    }
                    state.config = candidateConfig;
                    state.activeProfile = candidateConfig.activeProfile;
                },
            });
            if (!applied) {
                return;
            }

            logInfo(
                `Toggled branch ${requestedRepoId ?? 'all repos'}/${normalizedBranchPath}: ${requestedCheckedState ? 'enabled' : 'disabled'} (${updatedLayerIds.size} layer(s))${scopedMutation ? ` (profile: ${scopedMutation.profileId})` : ''}`,
            );
            if (!deferRefresh) {
                await vscode.commands.executeCommand('metaflow.refresh', {
                    skipRepoSync: true,
                });
            }
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
                const candidateConfig = cloneConfig(state.config);
                const projectedConfig = withBuiltInCapabilityProjected(
                    projectConfigForProfile(candidateConfig),
                    state.builtInCapability,
                );
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                const scopedMutation = getScopedLayerMutationProfile(candidateConfig);
                const builtInLayerPaths = new Set<string>();
                for (const i of indices) {
                    const layerSource = layerSources[i];
                    if (!layerSource) {
                        continue;
                    }
                    if (layerSource.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                        builtInLayerPaths.add(layerSource.path);
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
                        const runtime = ensureMultiRepoConfig(candidateConfig);
                        runtime.layerSources[i].enabled = true;
                        syncLayerSourceToCapabilityConfig(candidateConfig, runtime.layerSources[i]);
                    }
                }
                const candidateBuiltInCapability =
                    builtInLayerPaths.size > 0
                        ? previewBuiltInLayerEnabledStates(
                              state.builtInCapability,
                              builtInLayerPaths,
                              true,
                          )
                        : state.builtInCapability;
                const applied = await executeGovernedMutation({
                    actionLabel: 'selecting all matched layers',
                    state,
                    candidateConfig,
                    candidateBuiltInCapability,
                    persist: async () => {
                        if (builtInLayerPaths.size > 0) {
                            state.builtInCapability = await writeBuiltInLayerEnabledStates(
                                context,
                                state.builtInCapability,
                                builtInLayerPaths,
                                true,
                            );
                        }
                        if (state.configPath) {
                            await persistConfig(state.configPath, candidateConfig, state);
                        }
                        state.config = candidateConfig;
                        state.activeProfile = candidateConfig.activeProfile;
                    },
                });
                if (!applied) {
                    return;
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
                const candidateConfig = cloneConfig(state.config);
                const projectedConfig = withBuiltInCapabilityProjected(
                    projectConfigForProfile(candidateConfig),
                    state.builtInCapability,
                );
                const { layerSources } = ensureMultiRepoConfig(projectedConfig);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                const scopedMutation = getScopedLayerMutationProfile(candidateConfig);
                const builtInLayerPaths = new Set<string>();
                for (const i of indices) {
                    const layerSource = layerSources[i];
                    if (!layerSource) {
                        continue;
                    }
                    if (layerSource.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                        builtInLayerPaths.add(layerSource.path);
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
                        const runtime = ensureMultiRepoConfig(candidateConfig);
                        runtime.layerSources[i].enabled = false;
                        syncLayerSourceToCapabilityConfig(candidateConfig, runtime.layerSources[i]);
                    }
                }
                const candidateBuiltInCapability =
                    builtInLayerPaths.size > 0
                        ? previewBuiltInLayerEnabledStates(
                              state.builtInCapability,
                              builtInLayerPaths,
                              false,
                          )
                        : state.builtInCapability;
                const applied = await executeGovernedMutation({
                    actionLabel: 'deselecting all matched layers',
                    state,
                    candidateConfig,
                    candidateBuiltInCapability,
                    persist: async () => {
                        if (builtInLayerPaths.size > 0) {
                            state.builtInCapability = await writeBuiltInLayerEnabledStates(
                                context,
                                state.builtInCapability,
                                builtInLayerPaths,
                                false,
                            );
                        }
                        if (state.configPath) {
                            await persistConfig(state.configPath, candidateConfig, state);
                        }
                        state.config = candidateConfig;
                        state.activeProfile = candidateConfig.activeProfile;
                    },
                });
                if (!applied) {
                    return;
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
                    const mutation =
                        buildInjectionSelectionFromArg(arg) ??
                        (await promptForInjectionMutation(
                            'built-in MetaFlow capability',
                            state.builtInCapability.injection,
                            'Clear all built-in defaults',
                            (artifactType) =>
                                resolveInheritedInjectionMode(
                                    artifactType,
                                    undefined,
                                    state.config?.injection,
                                ),
                        ));
                    if (mutation) {
                        await applyBuiltInRepoInjectionMutation(context, state, mutation);
                    }
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
                    const mutation =
                        buildInjectionSelectionFromArg(arg) ??
                        (await promptForInjectionMutation(
                            'built-in MetaFlow capability',
                            state.builtInCapability.injection,
                            'Clear all built-in defaults',
                            (artifactType) =>
                                resolveInheritedInjectionMode(
                                    artifactType,
                                    undefined,
                                    state.config?.injection,
                                ),
                        ));
                    if (mutation) {
                        await applyBuiltInRepoInjectionMutation(context, state, mutation);
                    }
                    return;
                }

                const { metadataRepos } = ensureMultiRepoConfig(state.config);
                if (!repoId) {
                    const builtInRepoPick =
                        isBuiltInCapabilityActive(state.builtInCapability) &&
                        state.builtInCapability.sourceRoot
                            ? [
                                  {
                                      label: resolveBuiltInCapabilityDisplayName(
                                          state.repoMetadataById[BUILT_IN_CAPABILITY_REPO_ID]?.name,
                                          state.builtInCapability.sourceDisplayName,
                                      ),
                                      description: BUILT_IN_CAPABILITY_REPO_ID,
                                      detail: `Current defaults: ${describeInjectionConfig(state.builtInCapability.injection)}`,
                                      repoId: BUILT_IN_CAPABILITY_REPO_ID,
                                  },
                              ]
                            : [];
                    const selection = await vscode.window.showQuickPick(
                        [
                            ...metadataRepos.map((repo) => ({
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
                            ...builtInRepoPick,
                        ],
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

                if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    const mutation =
                        buildInjectionSelectionFromArg(arg) ??
                        (await promptForInjectionMutation(
                            'built-in MetaFlow capability',
                            state.builtInCapability.injection,
                            'Clear all built-in defaults',
                            (artifactType) =>
                                resolveInheritedInjectionMode(
                                    artifactType,
                                    undefined,
                                    state.config?.injection,
                                ),
                        ));
                    if (mutation) {
                        await applyBuiltInRepoInjectionMutation(context, state, mutation);
                    }
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
        const modes: InjectionEditMode[] = ['settings', 'synchronize', 'inherit'];
        if (supportsPluginInjection(artifactType)) {
            modes.push('plugin');
        }
        for (const mode of modes) {
            const mutation: InjectionMutationSelection = { artifactType, mode };
            context.subscriptions.push(
                vscode.commands.registerCommand(
                    buildDirectsynchronizationCommandId(artifactType, mode),
                    async (arg?: unknown) =>
                        runDirectsynchronizationCommand(context, state, arg, mutation),
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
                async (arg?: unknown) =>
                    runDirectsynchronizationCommand(context, state, arg, { preset }),
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
            const repoId = extractRepoId(arg);
            const requestedCheckedState = extractLayerCheckedState(arg);
            const deferRefresh =
                typeof arg === 'object' &&
                arg !== null &&
                (arg as { deferRefresh?: unknown }).deferRefresh === true;

            if (typeof repoId !== 'string' || repoId.length === 0) {
                logWarn('Toggle repo source requires a valid repo id.');
                return;
            }

            const ws = getWorkspace();
            if (!ws) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                const nextEnabled =
                    typeof requestedCheckedState === 'boolean'
                        ? requestedCheckedState
                        : !state.builtInCapability.layerEnabled;

                const candidateBuiltInCapability = previewBuiltInCapabilityWorkspaceState(
                    state.builtInCapability,
                    {
                        enabled: nextEnabled,
                        layerEnabled: nextEnabled,
                        disabledByUser: !nextEnabled,
                        layerStates: {},
                    },
                );
                const candidateConfig = state.config ? cloneConfig(state.config) : undefined;
                const applied = await executeGovernedMutation({
                    actionLabel: `toggling repo source ${repoId}`,
                    state,
                    candidateConfig,
                    candidateBuiltInCapability,
                    persist: async () => {
                        state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                            context,
                            state.builtInCapability,
                            {
                                enabled: nextEnabled,
                                layerEnabled: nextEnabled,
                                disabledByUser: !nextEnabled,
                                layerStates: {},
                            },
                        );
                    },
                });
                if (!applied) {
                    return;
                }

                logInfo(
                    `Toggled built-in repo source ${repoId}: ${nextEnabled ? 'enabled' : 'disabled'}`,
                );
                if (!deferRefresh) {
                    await vscode.commands.executeCommand('metaflow.refresh', {
                        skipRepoSync: true,
                    });
                }
                return;
            }

            if (!state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            try {
                const candidateConfig = cloneConfig(state.config);
                const { metadataRepos } = ensureMultiRepoConfig(candidateConfig);
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

                const applied = await executeGovernedMutation({
                    actionLabel: `toggling repo source ${repoId}`,
                    state,
                    candidateConfig,
                    persist: async () => {
                        if (state.configPath) {
                            await persistConfig(state.configPath, candidateConfig, state);
                        }
                        state.config = candidateConfig;
                        state.activeProfile = candidateConfig.activeProfile;
                    },
                });
                if (!applied) {
                    return;
                }

                logInfo(`Toggled repo source ${repoId}: ${repo.enabled ? 'enabled' : 'disabled'}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle repo source failed: ${message}`);
            }

            if (!deferRefresh) {
                await vscode.commands.executeCommand('metaflow.refresh', {
                    skipRepoSync: true,
                });
            }
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
            const initialized: string[] = [];
            const suppressions = readGitRemotePromotionSuppressions(context);
            let suppressionsChanged = false;

            for (const candidate of candidates) {
                const gitState = await discoverLocalGitRepositoryState(candidate.localPath);
                if (!gitState.isGitRepo) {
                    const action = await vscode.window.showInformationMessage(
                        `MetaFlow: Repository source "${candidate.repoId}" is not a git repository. Initialize it for local promotion workflows?`,
                        'Initialize Git',
                        'Skip',
                    );

                    if (action === 'Initialize Git') {
                        try {
                            await initializeLocalGitRepository(candidate.localPath);
                            initialized.push(candidate.repoId);
                            logInfo(
                                `Initialized local git repository for ${candidate.repoId} with an empty initial commit.`,
                            );
                        } catch (error: unknown) {
                            const message = error instanceof Error ? error.message : String(error);
                            logWarn(
                                `Failed to initialize local git repository for ${candidate.repoId}: ${message}`,
                            );
                            vscode.window.showWarningMessage(
                                `MetaFlow: Failed to initialize git repository for ${candidate.repoId}. ${message}`,
                            );
                        }
                    }
                    continue;
                }

                if (gitState.remotes.length === 0) {
                    logInfo(
                        `Repository source ${candidate.repoId} is a local git repository with no configured remotes yet.`,
                    );
                    vscode.window.showInformationMessage(
                        `MetaFlow: Repository source "${candidate.repoId}" is a local git repository with no configured remotes yet. Local promotion workflows are available; add a remote later to enable update checks.`,
                    );
                    continue;
                }

                const suppressionKey = buildGitRemotePromotionSuppressionKey(candidate);
                const signature = buildGitRemotePromotionSignature(gitState.remotes);
                if (suppressions[suppressionKey] === signature) {
                    continue;
                }

                const action = await vscode.window.showInformationMessage(
                    `MetaFlow: Repository source "${candidate.repoId}" is a local git repo with ${gitState.remotes.length} remote${gitState.remotes.length === 1 ? '' : 's'} but no configured URL. Promote it to a git-backed source?`,
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

                const selectedRemote = await pickRemoteForPromotion(candidate, gitState.remotes);
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

            if (promoted.length === 0 && initialized.length === 0) {
                return;
            }

            if (promoted.length > 0) {
                state.config = workingConfig;
                await persistConfig(state.configPath, workingConfig, state);
            }
            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });

            if (promoted.length > 0) {
                vscode.window.showInformationMessage(
                    `MetaFlow: Promoted ${promoted.length} repository source${promoted.length === 1 ? '' : 's'} to git-backed tracking.`,
                );
            }
            if (initialized.length > 0) {
                vscode.window.showInformationMessage(
                    `MetaFlow: Initialized ${initialized.length} local metadata repositor${initialized.length === 1 ? 'y' : 'ies'} for git-backed local promotion workflows.`,
                );
            }
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

    // ── metaflow.pushRepository ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.pushRepository', async (arg?: unknown) => {
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
                    'MetaFlow: Push Repository',
                    'Select git-backed repository to push',
                );
                if (!target) {
                    return;
                }
            }

            const pushResult = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `MetaFlow: Pushing changes for ${target.repoId}...`,
                },
                async () => pushRepository(target.localPath),
            );

            if (!pushResult.ok) {
                const failureMessage = `MetaFlow: Push failed for ${target.repoId}. ${pushResult.message}`;
                logWarn(failureMessage);
                state.repoSyncByRepoId[target.repoId] = {
                    state: 'unknown',
                    lastCheckedAt: new Date().toISOString(),
                    error: pushResult.message,
                };
                state.onDidChange.fire();
                vscode.window.showWarningMessage(failureMessage);
                return;
            }

            logInfo(`MetaFlow: Push complete for ${target.repoId}. ${pushResult.message}`);

            await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                repoId: target.repoId,
                silent: true,
            });

            vscode.window.showInformationMessage(`MetaFlow: Pushed changes for ${target.repoId}.`);
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
                state.configWarnings = [];
                state.capabilityDiagnosticFilePaths = [];
                state.agentPluginCatalog = [];
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
                    void vscode.window.showInformationMessage(getConfigMigrationNoticeMessage());
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
            const latestConfig = ws ? loadLatestConfigForMutation(ws.uri.fsPath, state) : undefined;
            const detailConfig = latestConfig ?? state.config;
            if (!ws || !detailConfig) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

            const target = resolveCapabilityDetailTarget(
                detailConfig,
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

            const model = await loadCapabilityDetailModel(target, state.treeSummaryCache, {
                governanceContract: state.governanceContract,
                governanceContractErrors: state.governanceContractErrors,
                governanceCompliance: state.governanceCompliance,
            });
            return capabilityDetailsPanel.show(model, {
                layerIndex: target.layerIndex,
                layerPath: target.layerPath,
                repoId: target.repoId,
            });
        }),
    );

    // ── metaflow.openCapabilityManifest ────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.openCapabilityManifest',
            async (arg?: unknown) => {
                const manifestPath =
                    typeof (arg as { manifestPath?: unknown } | undefined)?.manifestPath ===
                    'string'
                        ? ((arg as { manifestPath: string }).manifestPath as string)
                        : undefined;

                if (!manifestPath) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: No CAPABILITY.md file is available for the selected capability.',
                    );
                    return;
                }

                try {
                    const doc = await vscode.workspace.openTextDocument(manifestPath);
                    await vscode.window.showTextDocument(doc);
                    return manifestPath;
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    vscode.window.showWarningMessage(
                        `MetaFlow: Could not open CAPABILITY.md. ${message}`,
                    );
                    return;
                }
            },
        ),
    );

    // ── metaflow.createCapabilityManifest ─────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.createCapabilityManifest',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws) {
                    return;
                }

                let suggestedDirectory = resolveCapabilityManifestSuggestedDirectory(
                    state,
                    ws.uri.fsPath,
                    arg,
                );

                if (!suggestedDirectory && !extractRepoId(arg) && !extractLayerPath(arg)) {
                    suggestedDirectory = await promptForFlatCapabilityDirectory(
                        state,
                        ws.uri.fsPath,
                    );
                }

                const targetDirectory = await promptForCapabilityManifestDirectory({
                    workspaceRoot: ws.uri.fsPath,
                    suggestedDirectory,
                });
                if (!targetDirectory) {
                    return;
                }

                const capabilityName = await vscode.window.showInputBox({
                    title: 'MetaFlow: Capability Name',
                    prompt: 'Enter the capability display name',
                    placeHolder: 'Capability Name',
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        if (!value.trim()) {
                            return 'Capability name is required.';
                        }
                        return undefined;
                    },
                });
                if (!capabilityName) {
                    return;
                }

                const defaultDirectoryName = sanitizeCapabilityDirectoryName(capabilityName);
                const capabilityDirectoryNameInput = await vscode.window.showInputBox({
                    title: 'MetaFlow: Capability Directory Name',
                    prompt: 'Enter the directory name to create under the selected parent directory',
                    value: defaultDirectoryName,
                    placeHolder: 'new-capability',
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        if (!value.trim()) {
                            return 'Capability directory name is required.';
                        }
                        if (value.includes('/') || value.includes('\\')) {
                            return 'Capability directory name must not include path separators.';
                        }
                        if (value === '.' || value === '..') {
                            return 'Capability directory name must not be . or ..';
                        }
                        return undefined;
                    },
                });
                if (!capabilityDirectoryNameInput) {
                    return;
                }

                const capabilityDirectoryName = capabilityDirectoryNameInput.trim();
                const capabilityDirectoryPath = path.join(targetDirectory, capabilityDirectoryName);
                const capabilityGithubDirectoryPath = path.join(capabilityDirectoryPath, '.github');

                const guidancePath = path.join(
                    context.extensionPath,
                    BUNDLED_CAPABILITY_CONTRACT_GUIDANCE_RELATIVE_PATH,
                );
                const examplePath = path.join(
                    context.extensionPath,
                    BUNDLED_CAPABILITY_CONTRACT_EXAMPLE_RELATIVE_PATH,
                );

                if (!fs.existsSync(guidancePath) || !fs.existsSync(examplePath)) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: Bundled CAPABILITY.md authoring guidance is unavailable in this extension build.',
                    );
                    return;
                }

                const guidanceDoc = await vscode.workspace.openTextDocument(guidancePath);
                await vscode.window.showTextDocument(guidanceDoc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                    preserveFocus: true,
                });

                const exampleDoc = await vscode.workspace.openTextDocument(examplePath);
                await vscode.window.showTextDocument(exampleDoc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                    preserveFocus: true,
                });

                await fsp.mkdir(capabilityDirectoryPath, { recursive: true });
                await fsp.mkdir(capabilityGithubDirectoryPath, { recursive: true });
                const manifestPath = path.join(capabilityDirectoryPath, 'CAPABILITY.md');
                const pluginJsonPath = path.join(capabilityDirectoryPath, 'plugin.json');
                const manifestExists = fs.existsSync(manifestPath);
                if (!manifestExists) {
                    await fsp.writeFile(
                        manifestPath,
                        buildCapabilityManifestStarterTemplateForName(capabilityName),
                        'utf-8',
                    );
                }

                const pluginJsonExists = fs.existsSync(pluginJsonPath);
                if (!pluginJsonExists) {
                    await fsp.writeFile(
                        pluginJsonPath,
                        buildCapabilityPluginManifestStarterTemplate(
                            capabilityName,
                            capabilityDirectoryName,
                        ),
                        'utf-8',
                    );
                }

                const pluginJsonDoc = await vscode.workspace.openTextDocument(pluginJsonPath);
                await vscode.window.showTextDocument(pluginJsonDoc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                    preserveFocus: true,
                });

                const draftDoc = await vscode.workspace.openTextDocument(manifestPath);
                await vscode.window.showTextDocument(draftDoc, {
                    preview: false,
                    viewColumn: vscode.ViewColumn.Active,
                });

                vscode.window.showInformationMessage(
                    `MetaFlow: Opened CAPABILITY.md authoring guidance, an example contract, and ${manifestExists ? 'opened' : 'created'} ${manifestPath} plus ${pluginJsonExists ? 'opened' : 'created'} ${pluginJsonPath}.`,
                );

                return {
                    guidancePath,
                    examplePath,
                    draftUri: draftDoc.uri.toString(),
                    manifestPath,
                    pluginJsonPath,
                    targetDirectory,
                    capabilityDirectoryPath,
                    capabilityGithubDirectoryPath,
                    capabilityName: capabilityName.trim(),
                    capabilityDirectoryName,
                };
            },
        ),
    );

    // ── metaflow.maintainCapabilityPluginMetadata ────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.maintainCapabilityPluginMetadata',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws) {
                    return;
                }

                let suggestedDirectory = resolveCapabilityManifestSuggestedDirectory(
                    state,
                    ws.uri.fsPath,
                    arg,
                );

                if (!suggestedDirectory && !extractRepoId(arg) && !extractLayerPath(arg)) {
                    suggestedDirectory = await promptForFlatCapabilityDirectory(
                        state,
                        ws.uri.fsPath,
                    );
                }

                const capabilityDirectoryPath = await promptForExistingCapabilityDirectory({
                    workspaceRoot: ws.uri.fsPath,
                    suggestedDirectory,
                });
                if (!capabilityDirectoryPath) {
                    return;
                }

                const guidancePath = path.join(
                    context.extensionPath,
                    BUNDLED_CAPABILITY_CONTRACT_GUIDANCE_RELATIVE_PATH,
                );
                if (fs.existsSync(guidancePath)) {
                    const guidanceDoc = await vscode.workspace.openTextDocument(guidancePath);
                    await vscode.window.showTextDocument(guidanceDoc, {
                        viewColumn: vscode.ViewColumn.Beside,
                        preview: true,
                        preserveFocus: true,
                    });
                }

                let result: Awaited<ReturnType<typeof maintainCapabilityPluginMetadataInDirectory>>;
                try {
                    result =
                        await maintainCapabilityPluginMetadataInDirectory(capabilityDirectoryPath);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    vscode.window.showWarningMessage(
                        `MetaFlow: Could not maintain capability plugin metadata. ${message}`,
                    );
                    return;
                }

                const pluginJsonDoc = await vscode.workspace.openTextDocument(
                    result.pluginJsonPath,
                );
                await vscode.window.showTextDocument(pluginJsonDoc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                    preserveFocus: true,
                });

                const manifestDoc = await vscode.workspace.openTextDocument(result.manifestPath);
                await vscode.window.showTextDocument(manifestDoc, {
                    preview: false,
                    viewColumn: vscode.ViewColumn.Active,
                });

                vscode.window.showInformationMessage(
                    `MetaFlow: ${result.manifestChanged ? 'Updated' : 'Checked'} ${result.manifestPath} and ${result.pluginJsonChanged ? 'updated' : 'checked'} ${result.pluginJsonPath} for capability plugin compatibility.`,
                );

                return {
                    manifestPath: result.manifestPath,
                    pluginJsonPath: result.pluginJsonPath,
                    capabilityDirectoryPath: result.capabilityDirectoryPath,
                    capabilityName: result.capabilityName,
                    guidancePath: fs.existsSync(guidancePath) ? guidancePath : undefined,
                    manifestChanged: result.manifestChanged,
                    pluginJsonChanged: result.pluginJsonChanged,
                };
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.maintainAllCapabilityPluginMetadata',
            async (arg?: unknown) => {
                const ws = getWorkspace();
                if (!ws || !state.config) {
                    return;
                }

                let repoId = extractRepoId(arg);
                if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    vscode.window.showWarningMessage(
                        'MetaFlow: Built-in bundled metadata is read-only. Choose a regular metadata repository source instead.',
                    );
                    return;
                }

                if (!repoId) {
                    repoId = await promptForMetadataRepoId(state);
                }
                if (!repoId) {
                    return;
                }

                const projectedConfig = buildGovernanceEvaluationConfig(
                    state.config,
                    state.builtInCapability,
                );
                const { metadataRepos } = ensureMultiRepoConfig(projectedConfig);
                const repo = metadataRepos.find((candidate) => candidate.id === repoId);
                if (!repo) {
                    vscode.window.showWarningMessage(
                        `MetaFlow: Repository source "${repoId}" is not available in the active configuration.`,
                    );
                    return;
                }

                const repoRoot = resolvePathFromWorkspace(ws.uri.fsPath, repo.localPath);
                const layerPaths = discoverCapabilityDirectoryPathsInRepo(
                    repoRoot,
                    repo.discover?.exclude,
                ).sort((left, right) => left.localeCompare(right));
                if (layerPaths.length === 0) {
                    vscode.window.showInformationMessage(
                        `MetaFlow: No capability directories with CAPABILITY.md were found in ${repoRoot}.`,
                    );
                    return;
                }

                const changedResults: Array<
                    Awaited<ReturnType<typeof maintainCapabilityPluginMetadataInDirectory>>
                > = [];
                const unchangedResults: Array<
                    Awaited<ReturnType<typeof maintainCapabilityPluginMetadataInDirectory>>
                > = [];
                const failures: Array<{ layerPath: string; message: string }> = [];

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'MetaFlow: Maintaining capability plugin metadata',
                        cancellable: false,
                    },
                    async (progress) => {
                        for (let index = 0; index < layerPaths.length; index += 1) {
                            const layerPath = layerPaths[index];
                            progress.report({
                                message: `${index + 1}/${layerPaths.length}: ${layerPath}`,
                                increment: 100 / layerPaths.length,
                            });

                            try {
                                const result = await maintainCapabilityPluginMetadataInDirectory(
                                    path.join(repoRoot, layerPath),
                                );
                                if (result.manifestChanged || result.pluginJsonChanged) {
                                    changedResults.push(result);
                                } else {
                                    unchangedResults.push(result);
                                }
                            } catch (error: unknown) {
                                failures.push({
                                    layerPath,
                                    message: error instanceof Error ? error.message : String(error),
                                });
                            }
                        }
                    },
                );

                if (changedResults.length > 0) {
                    await vscode.commands.executeCommand('metaflow.refresh', {
                        skipRepoSync: true,
                    });
                }

                if (failures.length > 0) {
                    showOutputChannel();
                    for (const failure of failures) {
                        logWarn(
                            `MetaFlow: Failed to maintain plugin metadata for ${failure.layerPath}. ${failure.message}`,
                        );
                    }

                    const warningsChanged = mergeCapabilityWarningMessages(
                        state.capabilityWarnings,
                        collectCapabilityPluginMaintenanceWarningMessages({
                            repoRoot,
                            failures,
                            warnings: [],
                        }),
                    );
                    if (warningsChanged) {
                        state.onDidChange.fire();
                    }
                }

                const summary =
                    `MetaFlow: Checked ${layerPaths.length} capability director${layerPaths.length === 1 ? 'y' : 'ies'} in ${repoId}. ` +
                    `${changedResults.length} changed, ${unchangedResults.length} already up to date, ${failures.length} failed.`;

                if (failures.length > 0) {
                    vscode.window.showWarningMessage(summary);
                } else {
                    vscode.window.showInformationMessage(summary);
                }

                return {
                    repoId,
                    repoRoot,
                    scannedCount: layerPaths.length,
                    changedCount: changedResults.length,
                    unchangedCount: unchangedResults.length,
                    failureCount: failures.length,
                    changedCapabilities: changedResults.map(
                        (result) => result.capabilityDirectoryPath,
                    ),
                    failures,
                };
            },
        ),
    );

    // ── metaflow.toggleFilesViewMode ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleFilesViewMode', async () => {
            const ws = getManagedViewWorkspace();
            if (!ws) {
                return;
            }

            const currentMode = readManagedViewsState(ws.uri.fsPath).filesViewMode;
            const nextMode: FilesViewMode = currentMode === 'unified' ? 'repoTree' : 'unified';

            writeManagedViewsState(ws.uri.fsPath, { filesViewMode: nextMode });
            await vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', nextMode);
            try {
                await vscode.commands.executeCommand('metaflow.refreshManagedViewModeContext');
            } catch {
                // Tests and partial activation hosts may not have registered the tree refresh hook.
            }
            logInfo(`Effective Files view mode set to: ${nextMode}`);
        }),
    );

    async function setLayersViewMode(
        ws: vscode.WorkspaceFolder,
        nextMode: LayersViewMode,
    ): Promise<void> {
        writeManagedViewsState(ws.uri.fsPath, { layersViewMode: nextMode });
        await vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', nextMode);
        try {
            await vscode.commands.executeCommand('metaflow.refreshManagedViewModeContext');
        } catch {
            // Tests and partial activation hosts may not have registered the tree refresh hook.
        }
        logInfo(`Layers view mode set to: ${nextMode}`);
    }

    // ── metaflow.showLayersFlatMode ────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.showLayersFlatMode', async () => {
            const ws = getManagedViewWorkspace();
            if (!ws) {
                return;
            }

            await setLayersViewMode(ws, 'flat');
        }),
    );

    // ── metaflow.showLayersTreeMode ────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.showLayersTreeMode', async () => {
            const ws = getManagedViewWorkspace();
            if (!ws) {
                return;
            }

            await setLayersViewMode(ws, 'tree');
        }),
    );

    // ── metaflow.toggleLayersViewMode ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleLayersViewMode', async () => {
            const ws = getManagedViewWorkspace();
            if (!ws) {
                return;
            }

            const currentMode = readManagedViewsState(ws.uri.fsPath).layersViewMode;
            const nextMode: LayersViewMode = currentMode === 'flat' ? 'tree' : 'flat';

            await setLayersViewMode(ws, nextMode);
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
                state.builtInCapability = await enableBuiltInCapabilityDuringInit(
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

            state.builtInCapability = await enableBuiltInCapabilityInSettingsMode(
                context,
                state.builtInCapability,
            );

            vscode.window.showInformationMessage(
                'MetaFlow: Built-in MetaFlow capability enabled (plugin-first defaults).',
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

            const hasBuiltInMode = isBuiltInCapabilityActive(state.builtInCapability);
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
                    { enabled: false, layerEnabled: false, disabledByUser: false },
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
                        disabledByUser: false,
                        synchronizedFiles: [],
                    },
                );
            }

            await vscode.commands.executeCommand('metaflow.refresh', {
                skipRepoSync: true,
                skipBuiltInAutoApply: true,
            });
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

    // ── metaflow.openWarningSource / metaflow.copyWarningMessage ──
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.openWarningSource', async (arg?: unknown) => {
            const sourcePath =
                typeof arg === 'string'
                    ? arg
                    : typeof (arg as { sourcePath?: unknown } | undefined)?.sourcePath === 'string'
                      ? ((arg as { sourcePath: string }).sourcePath as string)
                      : undefined;
            const sourceKind =
                typeof (arg as { sourceKind?: unknown } | undefined)?.sourceKind === 'string'
                    ? ((arg as { sourceKind: string }).sourceKind as 'file' | 'directory')
                    : undefined;
            const sourceLine =
                typeof (arg as { sourceLine?: unknown } | undefined)?.sourceLine === 'number'
                    ? ((arg as { sourceLine: number }).sourceLine as number)
                    : undefined;
            const sourceColumn =
                typeof (arg as { sourceColumn?: unknown } | undefined)?.sourceColumn === 'number'
                    ? ((arg as { sourceColumn: number }).sourceColumn as number)
                    : undefined;

            if (!sourcePath) {
                vscode.window.showWarningMessage(
                    'MetaFlow: No warning source location is available for this item.',
                );
                return;
            }

            try {
                if (sourceKind === 'directory') {
                    const uri = vscode.Uri.file(sourcePath);
                    await vscode.commands.executeCommand('revealInExplorer', uri);
                    return sourcePath;
                }

                const document = await vscode.workspace.openTextDocument(sourcePath);
                const editor = await vscode.window.showTextDocument(document, {
                    preview: false,
                    selection:
                        typeof sourceLine === 'number'
                            ? new vscode.Range(
                                  sourceLine,
                                  sourceColumn ?? 0,
                                  sourceLine,
                                  sourceColumn ?? 0,
                              )
                            : undefined,
                });
                if (typeof sourceLine === 'number') {
                    const position = new vscode.Position(sourceLine, sourceColumn ?? 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                }
                return sourcePath;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showWarningMessage(
                    `MetaFlow: Could not open warning source. ${message}`,
                );
                return;
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.copyWarningMessage', async (arg?: unknown) => {
            const warningMessage =
                typeof arg === 'string'
                    ? arg
                    : typeof (arg as { warningMessage?: unknown } | undefined)?.warningMessage ===
                        'string'
                      ? ((arg as { warningMessage: string }).warningMessage as string)
                      : undefined;

            if (!warningMessage) {
                vscode.window.showWarningMessage(
                    'MetaFlow: No warning message is available to copy.',
                );
                return;
            }

            await vscode.env.clipboard.writeText(warningMessage);
            return warningMessage;
        }),
    );

    // ── metaflow.getDiagnosticsSnapshot ────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.getDiagnosticsSnapshot', () => {
            return buildDiagnosticsSnapshot(state, diagnosticCollection);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.getAgentPluginCatalog', () => {
            return {
                entries: state.agentPluginCatalog.map((entry) => ({
                    ...entry,
                    pluginHosts: [...entry.pluginHosts],
                })),
            };
        }),
    );
}
