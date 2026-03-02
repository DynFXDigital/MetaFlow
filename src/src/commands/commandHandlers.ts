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
import {
    BUNDLED_REPO_ID,
    type BundledMetadataMode,
    materializeBundledMetadata,
    mergeConfigWithBundledMetadata,
    readBundledMetadataSettings,
} from './bundledMetadata';
import {
    normalizeMcpConfigMode,
    scaffoldWorkspaceMcpConfig,
    validateWorkspaceMcpConfig,
} from './mcpConfig';
import {
    evaluateAiToolsCompatibility,
    getAiToolsMinVersion,
} from './aiTools';
import {
    RepoSyncStatus,
    checkRepoSyncStatus,
    pullRepositoryFastForward,
} from './repoSyncStatus';

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
    bundledMetadata?: {
        enabled: boolean;
        mode: BundledMetadataMode;
        sourcePath?: string;
        layerCount?: number;
        updated?: boolean;
        warning?: string;
    };
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
        bundledMetadata: {
            enabled: false,
            mode: 'off',
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

type CheckRepoUpdatesOutcome =
    | { executed: true }
    | { executed: false; reason: 'no-config' | 'no-git-repos' | 'repo-not-found' | 'no-targets' };

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
    try {
        const wsConfig = vscode.workspace.getConfiguration(undefined, workspace.uri);
        const keysToRemove = computeSettingsKeysToRemove();
        for (const key of keysToRemove) {
            await wsConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`Settings cleanup skipped: ${msg}`);
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
                state.bundledMetadata = {
                    enabled: false,
                    mode: 'off',
                };
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
            invalidateRepoSyncStatus(state);

            let runtimeConfig = result.config;
            const bundledSettings = readBundledMetadataSettings((key, defaultValue) => {
                return vscode.workspace.getConfiguration('metaflow', ws.uri).get(key, defaultValue);
            });

            state.bundledMetadata = {
                enabled: false,
                mode: bundledSettings.mode,
            };

            const bundledMode = bundledSettings.mode;
            const bundledModeActive = bundledSettings.enabled && bundledMode !== 'off';
            if (bundledModeActive) {
                try {
                    const extensionVersion = typeof context.extension.packageJSON.version === 'string'
                        ? context.extension.packageJSON.version
                        : 'dev';
                    const bundled = await materializeBundledMetadata({
                        workspaceRoot: ws.uri.fsPath,
                        extensionPath: context.extensionPath,
                        extensionVersion,
                        updatePolicy: bundledSettings.updatePolicy,
                    });

                    if (!bundled) {
                        const warning = 'Bundled metadata assets are unavailable in this extension build.';
                        logWarn(warning);
                        state.bundledMetadata.warning = warning;
                    } else {
                        runtimeConfig = mergeConfigWithBundledMetadata(
                            result.config,
                            bundled.targetRoot,
                            bundled.layerPaths,
                            bundledMode
                        );
                        state.bundledMetadata = {
                            enabled: true,
                            mode: bundledMode,
                            sourcePath: bundled.targetRoot,
                            layerCount: bundled.layerPaths.length,
                            updated: bundled.updated,
                        };
                    }
                } catch (bundledError: unknown) {
                    const warning = bundledError instanceof Error ? bundledError.message : String(bundledError);
                    logWarn(`Bundled metadata initialization failed: ${warning}`);
                    state.bundledMetadata.warning = warning;
                }
            }

            const autoApplyEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('autoApply', true);

            try {
                const injectionConfig = resolveInjectionConfig(ws, runtimeConfig);
                const shouldEnableDiscovery = autoApplyEnabled || refreshOptions.forceDiscovery === true;
                const overlay = resolveOverlay(runtimeConfig, ws.uri.fsPath, injectionConfig, {
                    enableDiscovery: shouldEnableDiscovery,
                    forceDiscoveryRepoIds: refreshOptions.forceDiscoveryRepoId
                        && refreshOptions.forceDiscoveryRepoId !== BUNDLED_REPO_ID
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

            if (state.bundledMetadata?.enabled) {
                emitInfo(
                    `Bundled Metadata: enabled (${state.bundledMetadata.mode}, layers: ${state.bundledMetadata.layerCount ?? 0})`
                );
                if (state.bundledMetadata.sourcePath) {
                    emitInfo(`Bundled Source: ${state.bundledMetadata.sourcePath}`);
                }
            } else if (state.bundledMetadata?.warning) {
                emitWarn(`Bundled Metadata: requested but unavailable (${state.bundledMetadata.warning ?? 'unknown reason'})`);
            } else {
                emitInfo('Bundled Metadata: disabled');
            }

            const mcpAssistEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('mcp.assistEnabled', false);
            const aiToolsEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('aiTools.enabled', false);
            const aiToolsCompatibility = evaluateAiToolsCompatibility(vscode.version);
            emitInfo(
                `AI Tools: ${aiToolsEnabled ? 'enabled' : 'disabled'} (${aiToolsCompatibility.supported ? 'compatible' : 'incompatible'}; min ${aiToolsCompatibility.minVersion}, current ${aiToolsCompatibility.currentVersion})`
            );
            if (aiToolsEnabled && !aiToolsCompatibility.supported && aiToolsCompatibility.reason) {
                emitWarn(`AI Tools Compatibility: ${aiToolsCompatibility.reason}`);
            }

            const mcpMode = normalizeMcpConfigMode(
                vscode.workspace.getConfiguration('metaflow', ws.uri).get<unknown>('mcp.configMode', 'workspace')
            );
            emitInfo(`MCP Assist: ${mcpAssistEnabled ? 'enabled' : 'disabled'} (${mcpMode})`);
            if (mcpAssistEnabled) {
                const mcpValidation = await validateWorkspaceMcpConfig(ws.uri.fsPath);
                if (mcpValidation.issues.length === 0) {
                    emitInfo(`MCP Config: OK (${mcpValidation.configPath})`);
                } else {
                    emitWarn(`MCP Config Issues: ${mcpValidation.issues.length} (${mcpValidation.configPath})`);
                }
            }

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
            if (!ws || !state.config) {
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

                const requestedCheckedState = extractLayerCheckedState(arg);
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
                await vscode.commands.executeCommand('metaflow.refresh');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Toggle layer failed: ${message}`);
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
                await vscode.commands.executeCommand('metaflow.refresh');
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

            await vscode.commands.executeCommand('metaflow.refresh');
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
                    enabled: true,
                });
                seenLayerKeys.add(layerKey);
            }

            await persistConfig(state.configPath, state.config);
            logInfo(`Added repo source ${repoId} with ${selection.layers.length} discovered layer(s).`);
            await vscode.commands.executeCommand('metaflow.refresh');
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
                await vscode.commands.executeCommand('metaflow.refresh');
                return;
            }

            await persistConfig(state.configPath, state.config);
            logInfo(`Removed repo source ${repoId} and ${layerCount} layer(s).`);
            await vscode.commands.executeCommand('metaflow.refresh');
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

    // ── metaflow.refreshBundledMetadata ───────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.checkAiToolsCompatibility', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const aiToolsEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('aiTools.enabled', false);

            if (!aiToolsEnabled) {
                vscode.window.showWarningMessage('MetaFlow: AI tools lane is disabled. Enable metaflow.aiTools.enabled first.');
                return;
            }

            const compatibility = evaluateAiToolsCompatibility(vscode.version);
            const summary = compatibility.supported
                ? `MetaFlow: AI tools compatibility OK (VS Code ${compatibility.currentVersion}, min ${compatibility.minVersion}).`
                : `MetaFlow: AI tools compatibility check failed (${compatibility.reason ?? `requires ${getAiToolsMinVersion()}+`}).`;

            if (compatibility.supported) {
                vscode.window.showInformationMessage(summary);
            } else {
                vscode.window.showWarningMessage(summary);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.refreshBundledMetadata', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const bundledSettings = readBundledMetadataSettings((key, defaultValue) => {
                return vscode.workspace.getConfiguration('metaflow', ws.uri).get(key, defaultValue);
            });

            if (!bundledSettings.enabled || bundledSettings.mode === 'off') {
                vscode.window.showWarningMessage('MetaFlow: Bundled metadata is disabled. Enable it in settings first.');
                return;
            }

            const extensionVersion = typeof context.extension.packageJSON.version === 'string'
                ? context.extension.packageJSON.version
                : 'dev';

            const bundled = await materializeBundledMetadata({
                workspaceRoot: ws.uri.fsPath,
                extensionPath: context.extensionPath,
                extensionVersion,
                updatePolicy: bundledSettings.updatePolicy,
                forceRefresh: true,
            });

            if (!bundled) {
                vscode.window.showWarningMessage('MetaFlow: Bundled metadata assets are unavailable in this extension build.');
                return;
            }

            vscode.window.showInformationMessage(
                `MetaFlow: Refreshed bundled metadata (${bundled.layerPaths.length} layer(s)).`
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        })
    );

    // ── metaflow.scaffoldMcpConfig ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.scaffoldMcpConfig', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const mcpAssistEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('mcp.assistEnabled', false);

            if (!mcpAssistEnabled) {
                vscode.window.showWarningMessage('MetaFlow: MCP assist is disabled. Enable metaflow.mcp.assistEnabled first.');
                return;
            }

            const mode = normalizeMcpConfigMode(
                vscode.workspace.getConfiguration('metaflow', ws.uri).get<unknown>('mcp.configMode', 'workspace')
            );
            if (mode === 'profile') {
                vscode.window.showWarningMessage(
                    'MetaFlow: profile-mode MCP scaffolding is not yet implemented; using workspace mode.'
                );
            }

            const scaffoldResult = await scaffoldWorkspaceMcpConfig(ws.uri.fsPath);
            vscode.window.showInformationMessage(
                `MetaFlow: MCP config ${scaffoldResult.created ? 'created' : 'updated'} at ${scaffoldResult.configPath}.`
            );
        })
    );

    // ── metaflow.validateMcpConfig ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.validateMcpConfig', async () => {
            const ws = getWorkspace();
            if (!ws) {
                return;
            }

            const mode = normalizeMcpConfigMode(
                vscode.workspace.getConfiguration('metaflow', ws.uri).get<unknown>('mcp.configMode', 'workspace')
            );

            if (mode === 'profile') {
                vscode.window.showWarningMessage(
                    'MetaFlow: profile-mode MCP validation is not yet implemented; validating workspace mode.'
                );
            }

            const validation = await validateWorkspaceMcpConfig(ws.uri.fsPath);
            showOutputChannel();
            logInfo('=== MetaFlow MCP Validation ===');
            logInfo(`Config: ${validation.configPath}`);
            if (validation.issues.length === 0) {
                logInfo('No MCP configuration issues found.');
                vscode.window.showInformationMessage('MetaFlow: MCP config validation passed.');
                return;
            }

            for (const issue of validation.issues) {
                if (issue.severity === 'error') {
                    logError(issue.message);
                } else {
                    logWarn(issue.message);
                }
            }

            const hasErrors = validation.issues.some(issue => issue.severity === 'error');
            const summary = `MetaFlow: MCP validation found ${validation.issues.length} issue(s).`;
            if (hasErrors) {
                vscode.window.showWarningMessage(summary);
            } else {
                vscode.window.showInformationMessage(summary);
            }
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
