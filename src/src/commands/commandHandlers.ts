/**
 * Command handlers for MetaFlow extension.
 *
 * Wires overlay engine + materializer into VS Code commands.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import type { ApplyResult } from '@metaflow/engine';
import {
    loadConfig,
    MetaFlowConfig,
    InjectionConfig,
    resolveLayers,
    loadCapabilityManifestForLayer,
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
} from '@metaflow/engine';
import { publishConfigDiagnostics, clearDiagnostics } from '../diagnostics/configDiagnostics';
import { logInfo, logWarn, logError, showOutputChannel } from '../views/outputChannel';
import { updateStatusBar } from '../views/statusBar';
import { initConfig, resolveSourceSelection, InitSourceMode } from './initConfig';
import { pickWorkspaceFolder } from './workspaceSelection';
import { formatCapabilityWarningMessage } from './capabilityWarnings';
import {
    isInjectionMode,
    deriveRepoId,
    ensureMultiRepoConfig,
    extractLayerIndex,
    extractLayerCheckedState,
    extractRepoId,
    extractRepoScopeOptions,
    extractRefreshCommandOptions,
    extractApplyCommandOptions,
    normalizeFilesViewMode,
    normalizeLayersViewMode,
    type FilesViewMode,
    type LayersViewMode,
    normalizeAndDeduplicateLayerPaths,
    pruneStaleLayerSources,
} from './commandHelpers';
import { scaffoldMetaFlowAiMetadata } from './starterMetadata';
import {
    checkRepoSyncStatus,
    pullRepositoryFastForward,
    RepoSyncStatus,
    runGitCommand,
} from './repoSyncStatus';
import {
    BUILT_IN_CAPABILITY_REPO_ID,
    BUILT_IN_CAPABILITY_REPO_LABEL,
    BUILT_IN_CAPABILITY_STATE_KEY,
    BuiltInCapabilityRuntimeState,
    BuiltInCapabilityWorkspaceState,
    readBuiltInCapabilityRuntimeState,
    sanitizeMaterializedFiles,
} from '../builtInCapability';

const INJECTION_KEYS = ['instructions', 'prompts', 'skills', 'agents', 'hooks'] as const;
type InjectionKey = typeof INJECTION_KEYS[number];

const DEFAULT_INJECTION_MODE: Record<InjectionKey, 'settings' | 'materialize'> = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
};

const INJECTION_OVERRIDE_SETTING_KEY = 'metaflow.injection.modes';
const FILES_VIEW_MODE_SETTING_KEY = 'filesViewMode';
const LAYERS_VIEW_MODE_SETTING_KEY = 'layersViewMode';
const BUILT_IN_CAPABILITY_LAYER_PATH = '.github';

const LEGACY_INJECTION_SETTING_KEYS: Record<InjectionKey, string> = {
    instructions: 'metaflow.injection.instructionsMode',
    prompts: 'metaflow.injection.promptsMode',
    skills: 'metaflow.injection.skillsMode',
    agents: 'metaflow.injection.agentsMode',
    hooks: 'metaflow.injection.hooksMode',
};

/** Cached state for the current workspace. */
export interface ExtensionState {
    config?: MetaFlowConfig;
    configPath?: string;
    effectiveFiles: EffectiveFile[];
    capabilityByLayer: Record<string, {
        id?: string;
        name?: string;
        description?: string;
        license?: string;
    }>;
    capabilityWarnings: string[];
    repoSyncByRepoId: Record<string, RepoSyncStatus>;
    builtInCapability: BuiltInCapabilityRuntimeState;
    activeProfile?: string;
    /** Event emitter to notify TreeViews of changes. */
    onDidChange: vscode.EventEmitter<void>;
}

/**
 * Create a fresh state with an event emitter.
 */
export function createState(): ExtensionState {
    return {
        effectiveFiles: [],
        capabilityByLayer: {},
        capabilityWarnings: [],
        repoSyncByRepoId: {},
        builtInCapability: {
            enabled: false,
            layerEnabled: true,
            materializedFiles: [],
            sourceRoot: undefined,
        },
        onDidChange: new vscode.EventEmitter<void>(),
    };
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

type CheckRepoUpdatesOutcome =
    | { executed: true }
    | { executed: false; reason: 'no-config' | 'no-git-repos' | 'repo-not-found' | 'no-targets' };

function resolveLayerIndicesForItem(
    layerSources: { repoId: string; path: string }[],
    item: unknown
): number[] {
    const normalize = (p: string) => (p === '.' ? '' : p);
    const contextValue = typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>).contextValue as string | undefined
        : undefined;

    if (!contextValue) {
        return layerSources.map((_, i) => i);
    }

    const repoId = (item as Record<string, unknown>).repoId as string | undefined;
    const rawLayerIndex = (item as Record<string, unknown>).layerIndex;
    const pathKey = (item as Record<string, unknown>).pathKey as string | undefined;

    if (contextValue === 'layerRepo' && typeof repoId === 'string') {
        return layerSources.flatMap((ls, i) => (ls.repoId === repoId ? [i] : []));
    }

    if (contextValue === 'layer' && typeof rawLayerIndex === 'number') {
        return [rawLayerIndex];
    }

    if (contextValue === 'layerFolder') {
        const prefix = pathKey === '(root)' ? '' : (pathKey ?? '');
        return layerSources.flatMap((ls, i) => {
            const normalizedPath = normalize(ls.path);
            const pathMatch = normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
            const repoMatch = !repoId || ls.repoId === repoId;
            return pathMatch && repoMatch ? [i] : [];
        });
    }

    return layerSources.map((_, i) => i);
}

function normalizeLayerId(layerId: string): string {
    const normalized = layerId.replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized === '' ? '.' : normalized;
}

function deriveCapabilityIdFromLayerPath(layerPath: string, repoRoot: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

function collectConfiguredCapabilityMetadata(
    config: MetaFlowConfig,
    workspaceRoot: string
): Record<string, { id?: string; name?: string; description?: string; license?: string }> {
    const capabilityByLayer: Record<string, { id?: string; name?: string; description?: string; license?: string }> = {};

    if (config.metadataRepos && config.layerSources) {
        const repoById = new Map(config.metadataRepos.map(repo => [repo.id, repo]));

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

function collectConfiguredCapabilityWarnings(config: MetaFlowConfig, workspaceRoot: string): string[] {
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
        const repoById = new Map(config.metadataRepos.map(repo => [repo.id, repo]));
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
    builtInState: BuiltInCapabilityRuntimeState
): MetaFlowConfig {
    if (!builtInState.enabled || !builtInState.sourceRoot) {
        return config;
    }

    const projected = cloneConfig(config);
    const multiRepo = ensureMultiRepoConfig(projected);

    const existingRepo = multiRepo.metadataRepos.find(repo => repo.id === BUILT_IN_CAPABILITY_REPO_ID);
    if (!existingRepo) {
        multiRepo.metadataRepos.push({
            id: BUILT_IN_CAPABILITY_REPO_ID,
            name: BUILT_IN_CAPABILITY_REPO_LABEL,
            localPath: builtInState.sourceRoot,
            enabled: true,
        });
    }

    const existingLayer = multiRepo.layerSources.find(
        layer => layer.repoId === BUILT_IN_CAPABILITY_REPO_ID && layer.path === BUILT_IN_CAPABILITY_LAYER_PATH
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

async function writeBuiltInCapabilityWorkspaceState(
    context: vscode.ExtensionContext,
    currentState: BuiltInCapabilityRuntimeState,
    patch: BuiltInCapabilityWorkspaceState
): Promise<BuiltInCapabilityRuntimeState> {
    const payload: BuiltInCapabilityWorkspaceState = {
        enabled: patch.enabled ?? currentState.enabled,
        layerEnabled: patch.layerEnabled ?? currentState.layerEnabled,
        materializedFiles: sanitizeMaterializedFiles(
            patch.materializedFiles ?? currentState.materializedFiles
        ),
    };

    await context.workspaceState.update(BUILT_IN_CAPABILITY_STATE_KEY, payload);
    return readBuiltInCapabilityRuntimeState(context.workspaceState, context.extensionPath);
}

async function removeMaterializedCapabilityFiles(
    workspaceRoot: string,
    trackedFiles: string[]
): Promise<number> {
    let removedCount = 0;

    for (const trackedRelativePath of sanitizeMaterializedFiles(trackedFiles)) {
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
        while (currentDir !== workspaceRoot && currentDir.startsWith(path.join(workspaceRoot, '.github'))) {
            const entries = await fsp.readdir(currentDir);
            if (entries.length > 0) {
                break;
            }
            await fsp.rmdir(currentDir);
            currentDir = path.dirname(currentDir);
        }
    }

    return removedCount;
}

/**
 * Resolve the overlay from config and return effective files.
 */
function resolveOverlay(
    config: MetaFlowConfig,
    workspaceRoot: string,
    injection: InjectionConfig,
    options?: { enableDiscovery?: boolean; forceDiscoveryRepoIds?: string[] }
): {
    effectiveFiles: EffectiveFile[];
    capabilityByLayer: Record<string, {
        id?: string;
        name?: string;
        description?: string;
        license?: string;
    }>;
    capabilityWarnings: string[];
} {
    const layers = resolveLayers(config, workspaceRoot, {
        enableDiscovery: options?.enableDiscovery,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
    });

    const capabilityByLayer: Record<string, {
        id?: string;
        name?: string;
        description?: string;
        license?: string;
    }> = {};
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

    for (const warning of collectConfiguredCapabilityWarnings(config, workspaceRoot)) {
        if (!capabilityWarnings.includes(warning)) {
            capabilityWarnings.push(warning);
            logWarn(warning);
        }
    }

    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);
    files = applyExcludedTypeFilters(files, config.layerSources);

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, injection);
    return {
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

function resolveInjectionConfig(workspace: vscode.WorkspaceFolder, config: MetaFlowConfig): InjectionConfig {
    const workspaceConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
    const modes = workspaceConfig.get<Record<string, unknown>>(
        INJECTION_OVERRIDE_SETTING_KEY,
        {}
    );
    const injection: InjectionConfig = {
        ...(config.injection ?? {}),
    };

    for (const key of INJECTION_KEYS) {
        const overrideMode = modes?.[key];
        if (isInjectionMode(overrideMode)) {
            injection[key] = overrideMode;
            continue;
        }

        const legacySettingMode = workspaceConfig.get<unknown>(
            LEGACY_INJECTION_SETTING_KEYS[key],
            undefined
        );
        if (isInjectionMode(legacySettingMode)) {
            injection[key] = legacySettingMode;
            continue;
        }

        if (injection[key] === undefined) {
            injection[key] = DEFAULT_INJECTION_MODE[key];
        }
    }

    return injection;
}

/**
 * Write config to disk. When the file already exists, uses JSONC edit operations
 * to preserve comments and formatting where possible. Falls back to JSON.stringify
 * for new files or when the existing content cannot be parsed.
 */
async function persistConfig(configPath: string, config: MetaFlowConfig): Promise<void> {
    let existing: string | undefined;
    try {
        existing = await fsp.readFile(configPath, 'utf-8');
    } catch {
        // File does not exist yet — will write fresh JSON below.
    }

    if (existing !== undefined) {
        // Apply each top-level property as a targeted JSONC edit to preserve comments.
        let updated = existing;
        const formatOptions: jsonc.FormattingOptions = { tabSize: 2, insertSpaces: true };
        for (const [key, value] of Object.entries(config)) {
            const edits = jsonc.modify(updated, [key], value, { formattingOptions: formatOptions });
            updated = jsonc.applyEdits(updated, edits);
        }
        await fsp.writeFile(configPath, updated, 'utf-8');
    } else {
        await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
}

function discoverAndPersistRepoLayers(
    config: MetaFlowConfig,
    workspaceRoot: string,
    repoId: string
): number {
    if (config.metadataRepos && config.layerSources) {
        const repo = config.metadataRepos.find(candidate => candidate.id === repoId);
        if (!repo) {
            return 0;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        const discoveredLayers = discoverLayersInRepo(repoRoot, repo.discover?.exclude);
        const existing = new Set(
            config.layerSources
                .filter(source => source.repoId === repoId)
                .map(source => source.path)
        );

        let added = 0;
        for (const layerPath of discoveredLayers) {
            if (existing.has(layerPath)) {
                continue;
            }
            config.layerSources.push({
                repoId,
                path: layerPath,
                enabled: true,
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

function resolveGitBackedRepoSources(config: MetaFlowConfig, workspaceRoot: string): ResolvedRepoSource[] {
    if (config.metadataRepos) {
        return config.metadataRepos
            .filter(repo => isGitRemoteUrl(repo.url))
            .map(repo => ({
                repoId: repo.id,
                label: repo.name?.trim() || repo.id,
                localPath: resolvePathFromWorkspace(workspaceRoot, repo.localPath),
                repoUrl: repo.url,
            }));
    }

    if (config.metadataRepo && isGitRemoteUrl(config.metadataRepo.url)) {
        return [{
            repoId: 'primary',
            label: 'primary',
            localPath: resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath),
            repoUrl: config.metadataRepo.url,
        }];
    }

    return [];
}

function resolveUntrackedLocalRepoSources(config: MetaFlowConfig, workspaceRoot: string): UntrackedLocalRepoSource[] {
    if (config.metadataRepos) {
        return config.metadataRepos
            .filter(repo => !isGitRemoteUrl(repo.url))
            .map(repo => ({
                repoId: repo.id,
                label: repo.name?.trim() || repo.id,
                localPath: resolvePathFromWorkspace(workspaceRoot, repo.localPath),
            }));
    }

    if (config.metadataRepo && !isGitRemoteUrl(config.metadataRepo.url)) {
        return [{
            repoId: 'primary',
            label: 'primary',
            localPath: resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath),
        }];
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
        const insideWorkTree = (await runGitCommand(repoRoot, ['rev-parse', '--is-inside-work-tree'])).stdout.trim();
        if (insideWorkTree !== 'true') {
            return [];
        }

        const remotes = await runGitCommand(repoRoot, ['remote', '-v']);
        return parseGitRemoteVerboseOutput(remotes.stdout);
    } catch {
        return [];
    }
}

async function pickRemoteForPromotion(
    repo: UntrackedLocalRepoSource,
    remotes: GitRemoteInfo[]
): Promise<GitRemoteInfo | undefined> {
    if (remotes.length === 1) {
        return remotes[0];
    }

    const picked = await vscode.window.showQuickPick(
        remotes.map(remote => ({
            label: remote.name,
            description: remote.url,
            remote,
        })),
        {
            title: `MetaFlow: Select Remote for ${repo.repoId}`,
            placeHolder: 'Choose the remote URL to track in MetaFlow config',
            ignoreFocusOut: true,
        }
    );

    return picked?.remote;
}

function setRepoRemoteUrl(config: MetaFlowConfig, repoId: string, url: string): boolean {
    if (config.metadataRepos) {
        const repo = config.metadataRepos.find(candidate => candidate.id === repoId);
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

async function pickGitBackedRepo(
    repos: ResolvedRepoSource[],
    title: string,
    placeHolder: string
): Promise<ResolvedRepoSource | undefined> {
    if (repos.length === 1) {
        return repos[0];
    }

    const pickedRepoId = await vscode.window.showQuickPick(
        repos.map(repo => ({
            label: repo.label,
            description: repo.repoId,
            detail: repo.localPath,
            repoId: repo.repoId,
        })),
        {
            title,
            placeHolder,
            ignoreFocusOut: true,
        }
    );

    if (!pickedRepoId) {
        return undefined;
    }

    return repos.find(repo => repo.repoId === pickedRepoId.repoId);
}

async function injectWorkspaceSettings(
    workspace: vscode.WorkspaceFolder,
    config: MetaFlowConfig,
    effectiveFiles: EffectiveFile[]
): Promise<void> {
    try {
        const hooksEnabled = vscode.workspace
            .getConfiguration('metaflow', workspace.uri)
            .get<boolean>('hooksEnabled', true);
        const configForSettings = hooksEnabled
            ? config
            : { ...config, hooks: undefined };
        const entries = computeSettingsEntries(
            effectiveFiles,
            workspace.uri.fsPath,
            configForSettings
        );
        const entriesByKey = new Map(entries.map(entry => [entry.key, entry.value] as const));
        const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
        const managedKeys = computeSettingsKeysToRemove();

        for (const key of managedKeys) {
            try {
                const value = entriesByKey.get(key);
                await wsConfig.update(
                    key,
                    value === undefined ? undefined : value,
                    vscode.ConfigurationTarget.Workspace
                );
            } catch (entryErr: unknown) {
                const entryMsg = entryErr instanceof Error ? entryErr.message : String(entryErr);
                logWarn(`Settings key update skipped (${key}): ${entryMsg}`);
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`Settings injection skipped: ${msg}`);
    }
}

async function clearManagedWorkspaceSettings(workspace: vscode.WorkspaceFolder): Promise<void> {
    const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
    const keysToRemove = computeSettingsKeysToRemove();
    const targets: Array<{ value: vscode.ConfigurationTarget; label: string }> = [
        { value: vscode.ConfigurationTarget.Workspace, label: 'workspace' },
        { value: vscode.ConfigurationTarget.WorkspaceFolder, label: 'workspaceFolder' },
    ];

    for (const key of keysToRemove) {
        for (const target of targets) {
            try {
                await wsConfig.update(key, undefined, target.value);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logWarn(`Settings cleanup skipped (${key}, ${target.label}): ${msg}`);
            }
        }
    }
}

/**
 * Register all MetaFlow command handlers.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    diagnosticCollection: vscode.DiagnosticCollection
): void {
    state.builtInCapability = readBuiltInCapabilityRuntimeState(
        context.workspaceState,
        context.extensionPath
    );

    const getWorkspace = () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage('MetaFlow: No workspace folder open.');
            return undefined;
        }

        const activeUri = vscode.window.activeTextEditor?.document?.uri;
        const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;

        return pickWorkspaceFolder(
            folders,
            activeFolder,
            // Sync stat check kept intentionally: pickWorkspaceFolder is a synchronous
            // heuristic and existsSync is fast for local filesystems. Remote-FS callers
            // should use the explicit workspace-folder arg path instead.
            folder => fs.existsSync(path.join(folder.uri.fsPath, '.metaflow', 'config.jsonc'))
        );
    };

    // ── metaflow.refresh ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.refresh', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws) { return; }

            const refreshOptions = extractRefreshCommandOptions(arg);

            logInfo('Refreshing overlay...');
            updateStatusBar('loading');

            const result = loadConfig(ws.uri.fsPath);
            if (!result.ok) {
                logError(`Config errors: ${result.errors.map(e => e.message).join('; ')}`);
                publishConfigDiagnostics(diagnosticCollection, result);
                await clearManagedWorkspaceSettings(ws);
                if (result.configPath) {
                    vscode.window.showWarningMessage('MetaFlow: Found config file, but it is invalid. Check Problems for details.');
                } else {
                    const message = 'MetaFlow: No .metaflow/config.jsonc found at workspace root.';
                    logWarn(message);
                    vscode.window.showWarningMessage(message);
                }
                updateStatusBar('error');
                state.config = undefined;
                state.configPath = undefined;
                state.activeProfile = undefined;
                state.effectiveFiles = [];
                state.capabilityByLayer = {};
                state.capabilityWarnings = [];
                invalidateRepoSyncStatus(state);
                state.onDidChange.fire();
                return;
            }

            clearDiagnostics(diagnosticCollection);
            const configNormalized = normalizeAndDeduplicateLayerPaths(result.config);
            const prunedLayers = pruneStaleLayerSources(result.config, ws.uri.fsPath);
            if ((configNormalized || prunedLayers.length > 0) && result.configPath) {
                await persistConfig(result.configPath, result.config);
                if (configNormalized) {
                    logInfo('Normalized layer paths in config (removed redundant .github suffix entries).');
                }
                if (prunedLayers.length > 0) {
                    logInfo(`Pruned ${prunedLayers.length} stale layer source(s) from config: ${prunedLayers.join(', ')}`);
                }
            }
            state.config = result.config;
            state.configPath = result.configPath;
            state.activeProfile = result.config.activeProfile;
            state.builtInCapability = readBuiltInCapabilityRuntimeState(
                context.workspaceState,
                context.extensionPath
            );
            invalidateRepoSyncStatus(state);

            const autoApplyEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('autoApply', true);

            try {
                const injectionConfig = resolveInjectionConfig(ws, result.config);
                const shouldEnableDiscovery = autoApplyEnabled || refreshOptions.forceDiscovery === true;
                const projectedConfig = withBuiltInCapabilityProjected(result.config, state.builtInCapability);
                const overlay = resolveOverlay(projectedConfig, ws.uri.fsPath, injectionConfig, {
                    enableDiscovery: shouldEnableDiscovery,
                    forceDiscoveryRepoIds: refreshOptions.forceDiscoveryRepoId
                        ? [refreshOptions.forceDiscoveryRepoId]
                        : undefined,
                });
                state.effectiveFiles = overlay.effectiveFiles;
                state.capabilityByLayer = overlay.capabilityByLayer;
                state.capabilityWarnings = overlay.capabilityWarnings;
                logInfo(`Resolved ${state.effectiveFiles.length} effective files.`);
                updateStatusBar('idle', state.activeProfile, state.effectiveFiles.length);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`Overlay resolution failed: ${msg}`);
                state.capabilityByLayer = {};
                state.capabilityWarnings = [];
                updateStatusBar('error');
            }

            state.onDidChange.fire();

            if (!refreshOptions.skipAutoApply) {
                if (autoApplyEnabled) {
                    logInfo('Auto-apply enabled; applying overlay after refresh.');
                    await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });
                }
            }
        })
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
        })
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

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'MetaFlow: Applying overlay...' },
                async () => {
                    const result = apply({
                        workspaceRoot: ws.uri.fsPath,
                        effectiveFiles: state.effectiveFiles,
                        activeProfile: state.activeProfile,
                    });

                    // Inject settings for settings-backed files (may fail if Copilot extension not present)
                    await injectWorkspaceSettings(ws, state.config!, state.effectiveFiles);

                    logInfo(`Apply complete: ${result.written.length} written, ${result.skipped.length} skipped, ${result.removed.length} removed.`);
                    for (const w of result.warnings) {
                        logWarn(w);
                    }

                    vscode.window.showInformationMessage(
                        `MetaFlow: Applied ${result.written.length} files.`
                    );

                    // Refresh views
                    if (!applyOptions.skipRefresh) {
                        await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
                    }
                }
            );
        })
    );

    // ── metaflow.clean ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.clean', async () => {
            const ws = getWorkspace();
            if (!ws) { return; }

            const confirm = await vscode.window.showWarningMessage(
                'MetaFlow: Remove all managed files?',
                'Yes',
                'No'
            );
            if (confirm !== 'Yes') { return; }

            return await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'MetaFlow: Cleaning managed files...' },
                async (): Promise<ApplyResult> => {
                    const result = clean(ws.uri.fsPath);

                    await clearManagedWorkspaceSettings(ws);

                    logInfo(`Clean complete: ${result.removed.length} removed, ${result.skipped.length} skipped.`);
                    for (const w of result.warnings) {
                        logWarn(w);
                    }

                    vscode.window.showInformationMessage(
                        `MetaFlow: Cleaned ${result.removed.length} files.`
                    );

                    await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });

                    return result;
                }
            );
        })
    );

    // ── metaflow.status ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.status', async () => {
            const ws = getWorkspace();
            if (!ws) { return; }

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
            emitInfo(`Active Profile: ${state.activeProfile ?? 'None'}`);
            emitInfo(`Effective Files: ${state.effectiveFiles.length}`);
            const managedState = loadManagedState(ws.uri.fsPath);
            const trackedCount = Object.keys(managedState.files).length;
            emitInfo(`Managed Files: ${trackedCount}`);
            emitInfo(`Last Apply: ${managedState.lastApply}`);

            if (trackedCount > 0) {
                const driftResults = checkAllDrift(ws.uri.fsPath, '.github', managedState);
                const drifted = driftResults.filter(r => r.status === 'drifted');
                const missing = driftResults.filter(r => r.status === 'missing');
                emitInfo(`Drifted: ${drifted.length}, Missing: ${missing.length}`);
                for (const d of drifted) {
                    emitWarn(`  Drifted: ${d.relativePath}`);
                }
            }

            if (state.capabilityWarnings.length > 0) {
                emitInfo(`Capability Warnings: ${state.capabilityWarnings.length}`);
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
                `Repo Sync: ${syncStatuses.length} tracked (up-to-date: ${counts.upToDate}, behind: ${counts.behind}, ahead: ${counts.ahead}, diverged: ${counts.diverged}, unknown: ${counts.unknown})`
            );
            for (const [repoId, status] of Object.entries(state.repoSyncByRepoId)) {
                const details = [
                    status.trackingRef ? `upstream: ${status.trackingRef}` : undefined,
                    typeof status.behindCount === 'number' ? `${status.behindCount} behind` : undefined,
                    typeof status.aheadCount === 'number' ? `${status.aheadCount} ahead` : undefined,
                    status.error ? `error: ${status.error}` : undefined,
                    `checked: ${status.lastCheckedAt}`,
                ].filter((value): value is string => Boolean(value));
                emitInfo(`  [${repoId}] ${status.state}${details.length > 0 ? ` (${details.join(', ')})` : ''}`);
            }

            return lines;
        })
    );

    // ── metaflow.switchProfile ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.switchProfile', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.config.profiles) {
                vscode.window.showWarningMessage('MetaFlow: No profiles available.');
                return;
            }

            const profiles = Object.keys(state.config.profiles);
            const selected = await vscode.window.showQuickPick(profiles, {
                placeHolder: 'Select active profile',
            });

            if (!selected || !state.configPath) { return; }

            // Update the config file using JSONC-safe edit to preserve comments
            const raw = await fsp.readFile(state.configPath, 'utf-8');
            const formatOptions: jsonc.FormattingOptions = { tabSize: 2, insertSpaces: true };
            const edits = jsonc.modify(raw, ['activeProfile'], selected, { formattingOptions: formatOptions });
            const updated = jsonc.applyEdits(raw, edits);
            await fsp.writeFile(state.configPath, updated, 'utf-8');

            logInfo(`Switched profile to: ${selected}`);
            await vscode.commands.executeCommand('metaflow.refresh');
        })
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
            if (repoIdFromArg === BUILT_IN_CAPABILITY_REPO_ID) {
                const nextLayerEnabled = typeof requestedCheckedState === 'boolean'
                    ? requestedCheckedState
                    : !state.builtInCapability.layerEnabled;
                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    { layerEnabled: nextLayerEnabled }
                );
                logInfo(`Toggled built-in MetaFlow capability layer: ${nextLayerEnabled ? 'enabled' : 'disabled'}`);
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
                return;
            }

            if (!state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const layerIndex = extractLayerIndex(arg);
            if (typeof layerIndex !== 'number') {
                logWarn('Toggle layer requires a valid layer index.');
                return;
            }

            try {
                const { metadataRepos, layerSources } = ensureMultiRepoConfig(state.config);
                const layerSource = layerSources[layerIndex];
                if (!layerSource) {
                    logWarn(`Toggle layer failed: layer index ${layerIndex} not found.`);
                    return;
                }

                const nextLayerEnabled = typeof requestedCheckedState === 'boolean'
                    ? requestedCheckedState
                    : layerSource.enabled === false;
                layerSource.enabled = nextLayerEnabled;

                let repoAutoEnabled = false;
                if (nextLayerEnabled) {
                    const repo = metadataRepos.find(r => r.id === layerSource.repoId);
                    if (repo && repo.enabled === false) {
                        repo.enabled = true;
                        repoAutoEnabled = true;
                    }
                }

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config);
                }

                logInfo(`Toggled layer ${layerSource.repoId}/${layerSource.path}: ${layerSource.enabled ? 'enabled' : 'disabled'}`);
                if (repoAutoEnabled) {
                    logInfo(`Enabled repo source ${layerSource.repoId} because layer was enabled.`);
                }
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle layer failed: ${message}`);
            }
        })
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
                const { layerSources } = ensureMultiRepoConfig(state.config);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                for (const i of indices) {
                    layerSources[i].enabled = true;
                }
                if (state.configPath) {
                    await persistConfig(state.configPath, state.config);
                }
                logInfo(`Selected ${indices.length} layer(s).`);
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Select layers failed: ${message}`);
            }
        })
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
                const { layerSources } = ensureMultiRepoConfig(state.config);
                const indices = resolveLayerIndicesForItem(layerSources, item);
                for (const i of indices) {
                    layerSources[i].enabled = false;
                }
                if (state.configPath) {
                    await persistConfig(state.configPath, state.config);
                }
                logInfo(`Deselected ${indices.length} layer(s).`);
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Deselect layers failed: ${message}`);
            }
        })
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

                const layerIndex = typeof (item as { layerIndex?: unknown })?.layerIndex === 'number'
                    ? (item as { layerIndex: number }).layerIndex
                    : undefined;
                const artifactType = typeof (item as { artifactType?: unknown })?.artifactType === 'string'
                    ? (item as { artifactType: string }).artifactType as ExcludableArtifactType
                    : undefined;

                if (typeof layerIndex !== 'number' || !artifactType) {
                    logWarn('toggleLayerArtifactType: missing layerIndex or artifactType.');
                    return;
                }

                const { layerSources } = ensureMultiRepoConfig(state.config);

                if (!layerSources[layerIndex]) {
                    logWarn(`toggleLayerArtifactType: layer index ${layerIndex} not found.`);
                    return;
                }

                const isExcluded = newState === vscode.TreeItemCheckboxState.Unchecked;
                const layerSource = layerSources[layerIndex];
                const current = layerSource.excludedTypes ?? [];

                if (isExcluded) {
                    if (!current.includes(artifactType)) {
                        layerSource.excludedTypes = [...current, artifactType];
                    }
                } else {
                    const next = current.filter(t => t !== artifactType);
                    layerSource.excludedTypes = next.length > 0 ? next : undefined;
                }

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config);
                }

                logInfo(`Layer ${layerSource.repoId}/${layerSource.path}: ${artifactType} ${isExcluded ? 'excluded' : 'included'}`);
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
            }
        )
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

            if (typeof repoId !== 'string' || repoId.length === 0) {
                logWarn('Toggle repo source requires a valid repo id.');
                return;
            }

            try {
                const { metadataRepos } = ensureMultiRepoConfig(state.config);
                const repo = metadataRepos.find(r => r.id === repoId);
                if (!repo) {
                    logWarn(`Toggle repo source failed: repoId "${repoId}" not found.`);
                    return;
                }

                repo.enabled = repo.enabled === false ? true : false;

                if (state.configPath) {
                    await persistConfig(state.configPath, state.config);
                }

                logInfo(`Toggled repo source ${repoId}: ${repo.enabled ? 'enabled' : 'disabled'}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle repo source failed: ${message}`);
            }

            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        })
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
                repoId = await vscode.window.showQuickPick(
                    state.config.metadataRepos.map(repo => repo.id),
                    {
                        title: 'MetaFlow: Rescan Repository',
                        placeHolder: 'Select repository source to rescan',
                        ignoreFocusOut: true,
                    }
                );
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
                await persistConfig(state.configPath, state.config);
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
                : `MetaFlow: Rescan complete for ${repoId}${addedLayers > 0 ? ` (${addedLayers} new layer(s))` : ''}. Run Apply to materialize changes (autoApply is off).`;

            logInfo(completionMessage);
            vscode.window.showInformationMessage(completionMessage);
        })
    );

    // ── metaflow.checkRepoUpdates ────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.checkRepoUpdates', async (arg?: unknown) => {
            const scope = extractRepoScopeOptions(arg);
            const silent = scope.silent === true;

            const ws = getWorkspace();
            if (!ws || !state.config) {
                if (!silent) {
                    vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
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
                return { executed: false, reason: 'no-git-repos' } satisfies CheckRepoUpdatesOutcome;
            }

            let targets: ResolvedRepoSource[] = [];
            if (scope.allRepos) {
                targets = gitRepos;
            } else if (scope.repoId) {
                const target = gitRepos.find(repo => repo.repoId === scope.repoId);
                if (!target) {
                    const message = `MetaFlow: Repository "${scope.repoId}" is not git-backed or not found.`;
                    logWarn(message);
                    if (!silent) {
                        vscode.window.showWarningMessage(message);
                    }
                    return { executed: false, reason: 'repo-not-found' } satisfies CheckRepoUpdatesOutcome;
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
                        ...gitRepos.map(repo => ({
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
                    }
                );

                if (!selection) {
                    return;
                }

                if ('allRepos' in selection && selection.allRepos) {
                    targets = gitRepos;
                } else if ('repoId' in selection && selection.repoId) {
                    const picked = gitRepos.find(repo => repo.repoId === selection.repoId);
                    if (picked) {
                        targets = [picked];
                    }
                }
            }

            if (targets.length === 0) {
                return { executed: false, reason: 'no-targets' } satisfies CheckRepoUpdatesOutcome;
            }

            const runCheck = async (): Promise<CheckRepoUpdatesOutcome> => {
                let nonGitCount = 0;
                const summaryCounts = {
                    upToDate: 0,
                    behind: 0,
                    ahead: 0,
                    diverged: 0,
                    unknown: 0,
                };

                for (const target of targets) {
                    const result = await checkRepoSyncStatus(target.localPath);

                    if (result.kind === 'nonGit') {
                        nonGitCount += 1;
                        delete state.repoSyncByRepoId[target.repoId];
                        logWarn(`Repo update check skipped for ${target.repoId}: ${result.reason ?? 'not a git repository.'}`);
                        continue;
                    }

                    const status = result.status!;
                    state.repoSyncByRepoId[target.repoId] = status;
                    summaryCounts[status.state] += 1;

                    if (status.state === 'behind') {
                        logInfo(`Repo ${target.repoId} has updates upstream (${status.behindCount ?? 0} behind, ${status.aheadCount ?? 0} ahead).`);
                    } else if (status.state === 'unknown') {
                        logWarn(`Repo ${target.repoId} update state unknown: ${status.error ?? 'unknown error'}`);
                    } else {
                        logInfo(`Repo ${target.repoId} sync state: ${status.state}.`);
                    }
                }

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
                    runCheck
                );
            }
        })
    );

    // ── metaflow.offerGitRemotePromotion ─────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.offerGitRemotePromotion', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.configPath) {
                return;
            }

            const candidates = resolveUntrackedLocalRepoSources(state.config, ws.uri.fsPath);
            if (candidates.length === 0) {
                return;
            }

            const promoted: string[] = [];

            for (const candidate of candidates) {
                const remotes = await discoverGitRemotes(candidate.localPath);
                if (remotes.length === 0) {
                    continue;
                }

                const action = await vscode.window.showInformationMessage(
                    `MetaFlow: Repository source "${candidate.repoId}" is a local git repo with ${remotes.length} remote${remotes.length === 1 ? '' : 's'} but no configured URL. Promote it to a git-backed source?`,
                    'Promote',
                    'Skip'
                );

                if (action !== 'Promote') {
                    continue;
                }

                const selectedRemote = await pickRemoteForPromotion(candidate, remotes);
                if (!selectedRemote) {
                    continue;
                }

                if (!setRepoRemoteUrl(state.config, candidate.repoId, selectedRemote.url)) {
                    continue;
                }

                promoted.push(`${candidate.repoId} -> ${selectedRemote.name}`);
                logInfo(
                    `Promoted repository source ${candidate.repoId} to git-backed using remote ${selectedRemote.name} (${selectedRemote.url}).`
                );
            }

            if (promoted.length === 0) {
                return;
            }

            await persistConfig(state.configPath, state.config);
            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });

            vscode.window.showInformationMessage(
                `MetaFlow: Promoted ${promoted.length} repository source${promoted.length === 1 ? '' : 's'} to git-backed tracking.`
            );
        })
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
                target = gitRepos.find(repo => repo.repoId === repoId);
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
                    'Select git-backed repository to pull'
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
                async () => pullRepositoryFastForward(target.localPath)
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
            await vscode.commands.executeCommand('metaflow.checkRepoUpdates', { repoId: target.repoId, silent: true });

            vscode.window.showInformationMessage(`MetaFlow: Pulled updates for ${target.repoId}.`);
        })
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
                }
            );

            if (!modePick) {
                return;
            }

            const selection = await resolveSourceSelection(modePick.mode, ws);
            if (!selection) {
                return;
            }

            const multiRepoConfig = ensureMultiRepoConfig(state.config);
            const existingIds = new Set(multiRepoConfig.metadataRepos.map(repo => repo.id));
            const sourceLocalPath = toConfigLocalPath(ws, selection.metadataRoot.fsPath);
            const repoId = deriveRepoId(sourceLocalPath, selection.metadataUrl, existingIds);

            multiRepoConfig.metadataRepos.push({
                id: repoId,
                name: repoId,
                localPath: sourceLocalPath,
                ...(selection.metadataUrl ? { url: selection.metadataUrl } : {}),
                enabled: true,
            });

            const seenLayerKeys = new Set(multiRepoConfig.layerSources.map(layer => `${layer.repoId}:${layer.path}`));
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

            await persistConfig(state.configPath, state.config);
            logInfo(`Added repo source ${repoId} with ${selection.layers.length} discovered layer(s).`);
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        })
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
                vscode.window.showWarningMessage('MetaFlow: Remove repo source requires a valid config with at least one repository.');
                return;
            }

            const repoIdFromArg = extractRepoId(arg);
            const repoIds = state.config.metadataRepos!.map(repo => repo.id);
            const repoId = repoIdFromArg ?? await vscode.window.showQuickPick(repoIds, {
                title: 'MetaFlow: Remove Repository Source',
                placeHolder: 'Select repository source to remove',
                ignoreFocusOut: true,
            });

            if (!repoId) {
                return;
            }

            const repo = state.config.metadataRepos!.find(candidate => candidate.id === repoId);
            if (!repo) {
                logWarn(`Remove repo source failed: repoId "${repoId}" not found.`);
                return;
            }

            const layerCount = state.config.layerSources!.filter(layer => layer.repoId === repoId).length;
            const confirmation = await vscode.window.showWarningMessage(
                `Remove source "${repoId}" and ${layerCount} associated layer(s)?`,
                'Remove',
                'Cancel'
            );

            if (confirmation !== 'Remove') {
                return;
            }

            state.config.metadataRepos = state.config.metadataRepos!.filter(candidate => candidate.id !== repoId);
            state.config.layerSources = state.config.layerSources!.filter(layer => layer.repoId !== repoId);

            const removedLastRepo = state.config.metadataRepos.length === 0;
            if (removedLastRepo) {
                await fsp.unlink(state.configPath);
                logInfo(`Removed final repo source ${repoId}; configuration file deleted.`);
                vscode.window.showInformationMessage('MetaFlow: All repository sources removed. Initialize Configuration to start again.');
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
                return;
            }

            await persistConfig(state.configPath, state.config);
            logInfo(`Removed repo source ${repoId} and ${layerCount} layer(s).`);
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        })
    );

    // ── metaflow.openConfig ────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.openConfig', async () => {
            if (state.configPath) {
                const doc = await vscode.workspace.openTextDocument(state.configPath);
                await vscode.window.showTextDocument(doc);
            } else {
                vscode.window.showWarningMessage('MetaFlow: No config file found.');
            }
        })
    );

    // ── metaflow.toggleFilesViewMode ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleFilesViewMode', async () => {
            const ws = getWorkspace();
            const config = vscode.workspace.getConfiguration('metaflow', ws?.uri);
            const currentMode = normalizeFilesViewMode(
                config.get<unknown>(FILES_VIEW_MODE_SETTING_KEY, 'unified')
            );
            const nextMode: FilesViewMode = currentMode === 'unified' ? 'repoTree' : 'unified';
            const target = ws ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

            await config.update(FILES_VIEW_MODE_SETTING_KEY, nextMode, target);
            await vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', nextMode);
            logInfo(`Effective Files view mode set to: ${nextMode}`);
        })
    );

    // ── metaflow.toggleLayersViewMode ──────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleLayersViewMode', async () => {
            const ws = getWorkspace();
            const config = vscode.workspace.getConfiguration('metaflow', ws?.uri);
            const currentMode = normalizeLayersViewMode(
                config.get<unknown>(LAYERS_VIEW_MODE_SETTING_KEY, 'flat')
            );
            const nextMode: LayersViewMode = currentMode === 'flat' ? 'tree' : 'flat';
            const target = ws ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

            await config.update(LAYERS_VIEW_MODE_SETTING_KEY, nextMode, target);
            await vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', nextMode);
            logInfo(`Layers view mode set to: ${nextMode}`);
        })
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
                        openAction
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
                    if (!picked) { return; }
                    ws = picked;
                }

                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'MetaFlow: Initializing configuration…' },
                    async () => {
                        await initConfig(ws);
                        await vscode.commands.executeCommand('metaflow.refresh');
                    }
                );
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`initConfig failed: ${msg}`);
                vscode.window.showErrorMessage(`MetaFlow: Initialize Configuration failed — ${msg}`);
            }
        })
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
                        label: 'Materialize MetaFlow capability files into .github',
                        description: 'Overwrite managed MetaFlow capability files in this workspace.',
                        mode: 'materialize' as const,
                    },
                    {
                        label: 'Enable built-in MetaFlow capability (settings-only)',
                        description: 'Use bundled MetaFlow capability files without modifying .metaflow/config.jsonc.',
                        mode: 'builtin' as const,
                    },
                ],
                {
                    title: 'MetaFlow: Initialize MetaFlow Capability',
                    placeHolder: 'Choose how to initialize MetaFlow capability support',
                    ignoreFocusOut: true,
                }
            );

            if (!setupMode) {
                return;
            }

            if (setupMode.mode === 'materialize') {
                const materialized = await scaffoldMetaFlowAiMetadata({
                    workspaceRoot: ws.uri.fsPath,
                    extensionPath: context.extensionPath,
                    overwriteExisting: true,
                });

                if (!materialized) {
                    vscode.window.showWarningMessage('MetaFlow: MetaFlow capability assets are unavailable in this extension build.');
                    return;
                }

                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    {
                        materializedFiles: materialized.writtenFiles,
                    }
                );

                vscode.window.showInformationMessage(
                    `MetaFlow: Materialized ${materialized.writtenFiles.length} MetaFlow capability file(s) into .github.`
                );
                return;
            }

            state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                context,
                state.builtInCapability,
                {
                    enabled: true,
                    layerEnabled: true,
                }
            );

            vscode.window.showInformationMessage('MetaFlow: Built-in MetaFlow capability enabled (settings-only mode).');
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.removeMetaFlowCapability', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const removeOptions: Array<{ label: string; detail: string; mode: 'disableBuiltin' | 'removeMaterialized' }> = [];
            if (state.builtInCapability.enabled) {
                removeOptions.push({
                    label: 'Disable built-in MetaFlow capability mode',
                    detail: 'Turn off settings-only built-in capability projection.',
                    mode: 'disableBuiltin',
                });
            }
            if (state.builtInCapability.materializedFiles.length > 0) {
                removeOptions.push({
                    label: 'Remove materialized MetaFlow capability files from .github',
                    detail: `Delete ${state.builtInCapability.materializedFiles.length} tracked file(s) created by initialization.`,
                    mode: 'removeMaterialized',
                });
            }

            if (removeOptions.length === 0) {
                vscode.window.showInformationMessage('MetaFlow: No built-in mode or materialized capability files are currently tracked.');
                return;
            }

            const selected = await vscode.window.showQuickPick(removeOptions, {
                title: 'MetaFlow: Remove MetaFlow Capability',
                placeHolder: 'Choose what to remove',
                ignoreFocusOut: true,
            });
            if (!selected) {
                return;
            }

            if (selected.mode === 'disableBuiltin') {
                state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                    context,
                    state.builtInCapability,
                    { enabled: false, layerEnabled: false }
                );
                await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
                vscode.window.showInformationMessage('MetaFlow: Built-in MetaFlow capability mode disabled.');
                return;
            }

            const removed = await removeMaterializedCapabilityFiles(
                ws.uri.fsPath,
                state.builtInCapability.materializedFiles
            );
            state.builtInCapability = await writeBuiltInCapabilityWorkspaceState(
                context,
                state.builtInCapability,
                { materializedFiles: [] }
            );

            vscode.window.showInformationMessage(`MetaFlow: Removed ${removed} tracked MetaFlow capability materialized file(s).`);
        })
    );

    // ── metaflow.promote ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.promote', async () => {
            const ws = getWorkspace();
            if (!ws) { return; }

            const managedState = loadManagedState(ws.uri.fsPath);
            const driftResults = checkAllDrift(ws.uri.fsPath, '.github', managedState);
            const drifted = driftResults.filter(r => r.status === 'drifted');

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
        })
    );
}
