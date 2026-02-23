/**
 * Command handlers for MetaFlow extension.
 *
 * Wires overlay engine + materializer into VS Code commands.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    loadConfig,
    MetaFlowConfig,
    InjectionConfig,
    resolveLayers,
    discoverLayersInRepo,
    buildEffectiveFileMap,
    resolvePathFromWorkspace,
    applyFilters,
    applyProfile,
    classifyFiles,
    EffectiveFile,
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
import {
    isInjectionMode,
    deriveRepoId,
    ensureMultiRepoConfig,
    extractLayerIndex,
    extractLayerCheckedState,
    extractRepoId,
    extractRefreshCommandOptions,
    extractApplyCommandOptions,
    normalizeFilesViewMode,
    normalizeLayersViewMode,
    type FilesViewMode,
    type LayersViewMode,
    normalizeAndDeduplicateLayerPaths,
} from './commandHelpers';

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
        onDidChange: new vscode.EventEmitter<void>(),
    };
}

/**
 * Resolve the overlay from config and return effective files.
 */
function resolveOverlay(
    config: MetaFlowConfig,
    workspaceRoot: string,
    injection: InjectionConfig,
    options?: { enableDiscovery?: boolean; forceDiscoveryRepoIds?: string[] }
): EffectiveFile[] {
    const layers = resolveLayers(config, workspaceRoot, {
        enableDiscovery: options?.enableDiscovery,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
    });
    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, injection);
    return files;
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

function persistConfig(configPath: string, config: MetaFlowConfig): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
                state.onDidChange.fire();
                return;
            }

            clearDiagnostics(diagnosticCollection);
            const configNormalized = normalizeAndDeduplicateLayerPaths(result.config);
            if (configNormalized && result.configPath) {
                persistConfig(result.configPath, result.config);
                logInfo('Normalized layer paths in config (removed redundant .github suffix entries).');
            }
            state.config = result.config;
            state.configPath = result.configPath;
            state.activeProfile = result.config.activeProfile;

            const autoApplyEnabled = vscode.workspace
                .getConfiguration('metaflow', ws.uri)
                .get<boolean>('autoApply', true);

            try {
                const injectionConfig = resolveInjectionConfig(ws, result.config);
                const shouldEnableDiscovery = autoApplyEnabled || refreshOptions.forceDiscovery === true;
                state.effectiveFiles = resolveOverlay(result.config, ws.uri.fsPath, injectionConfig, {
                    enableDiscovery: shouldEnableDiscovery,
                    forceDiscoveryRepoIds: refreshOptions.forceDiscoveryRepoId
                        ? [refreshOptions.forceDiscoveryRepoId]
                        : undefined,
                });
                logInfo(`Resolved ${state.effectiveFiles.length} effective files.`);
                updateStatusBar('idle', state.activeProfile, state.effectiveFiles.length);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`Overlay resolution failed: ${msg}`);
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

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'MetaFlow: Cleaning managed files...' },
                async () => {
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
                }
            );
        })
    );

    // ── metaflow.status ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.status', async () => {
            const ws = getWorkspace();
            if (!ws) { return; }

            showOutputChannel();
            logInfo('=== MetaFlow Status ===');
            logInfo(`Config: ${state.configPath ?? 'Not loaded'}`);
            logInfo(`Active Profile: ${state.activeProfile ?? 'None'}`);
            logInfo(`Effective Files: ${state.effectiveFiles.length}`);

            const managedState = loadManagedState(ws.uri.fsPath);
            const trackedCount = Object.keys(managedState.files).length;
            logInfo(`Managed Files: ${trackedCount}`);
            logInfo(`Last Apply: ${managedState.lastApply}`);

            if (trackedCount > 0) {
                const driftResults = checkAllDrift(ws.uri.fsPath, '.github', managedState);
                const drifted = driftResults.filter(r => r.status === 'drifted');
                const missing = driftResults.filter(r => r.status === 'missing');
                logInfo(`Drifted: ${drifted.length}, Missing: ${missing.length}`);
                for (const d of drifted) {
                    logWarn(`  Drifted: ${d.relativePath}`);
                }
            }
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

            // Update the config file
            const raw = fs.readFileSync(state.configPath, 'utf-8');
            const current = state.config.activeProfile;
            let updated: string;
            if (current) {
                updated = raw.replace(
                    `"activeProfile": "${current}"`,
                    `"activeProfile": "${selected}"`
                );
            } else {
                // Add activeProfile before the last closing brace
                updated = raw.replace(/}(\s*)$/, `  "activeProfile": "${selected}"\n}$1`);
            }
            fs.writeFileSync(state.configPath, updated, 'utf-8');

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
                    persistConfig(state.configPath, state.config);
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
                    persistConfig(state.configPath, state.config);
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
                persistConfig(state.configPath, state.config);
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

            persistConfig(state.configPath, state.config);
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
                fs.unlinkSync(state.configPath);
                logInfo(`Removed final repo source ${repoId}; configuration file deleted.`);
                vscode.window.showInformationMessage('MetaFlow: All repository sources removed. Initialize Configuration to start again.');
                await vscode.commands.executeCommand('metaflow.refresh');
                return;
            }

            persistConfig(state.configPath, state.config);
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
