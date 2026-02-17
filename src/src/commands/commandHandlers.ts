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
    resolveLayers,
    buildEffectiveFileMap,
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

const INJECTION_KEYS = ['instructions', 'prompts', 'skills', 'agents', 'hooks'] as const;
type InjectionKey = typeof INJECTION_KEYS[number];

const DEFAULT_INJECTION_MODE: Record<InjectionKey, 'settings' | 'materialize'> = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
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
    workspaceRoot: string
): EffectiveFile[] {
    const layers = resolveLayers(config, workspaceRoot);
    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, config.injection);
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

function toSlug(value: string): string {
    const trimmed = value.trim().replace(/\/$/, '').toLowerCase();
    return trimmed
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'source';
}

function deriveRepoId(
    sourceLocalPath: string,
    sourceUrl: string | undefined,
    existingRepoIds: Set<string>
): string {
    const urlBase = sourceUrl ? sourceUrl.split('/').pop() : undefined;
    const urlSeed = urlBase ? urlBase.replace(/\.git$/i, '') : undefined;
    const pathSeed = path.basename(sourceLocalPath) || 'source';
    const base = toSlug(urlSeed ?? pathSeed);

    let candidate = base;
    let suffix = 2;
    while (existingRepoIds.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function ensureMultiRepoConfig(config: MetaFlowConfig): { metadataRepos: NonNullable<MetaFlowConfig['metadataRepos']>; layerSources: NonNullable<MetaFlowConfig['layerSources']> } {
    if (config.metadataRepos && config.layerSources) {
        return {
            metadataRepos: config.metadataRepos,
            layerSources: config.layerSources,
        };
    }

    if (!config.metadataRepo || !config.layers) {
        throw new Error('Cannot convert config to multi-repo mode: metadataRepo/layers not found.');
    }

    config.metadataRepos = [{
        id: 'primary',
        ...config.metadataRepo,
        enabled: true,
    }];
    config.layerSources = config.layers.map(layerPath => ({
        repoId: 'primary',
        path: layerPath,
        enabled: true,
    }));

    delete config.metadataRepo;
    delete config.layers;

    return {
        metadataRepos: config.metadataRepos,
        layerSources: config.layerSources,
    };
}

function extractLayerIndex(arg: unknown): number | undefined {
    if (typeof arg === 'number') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'layerIndex' in arg) {
        const layerIndex = (arg as { layerIndex?: unknown }).layerIndex;
        return typeof layerIndex === 'number' ? layerIndex : undefined;
    }
    return undefined;
}

function extractRepoId(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'repoId' in arg) {
        const repoId = (arg as { repoId?: unknown }).repoId;
        return typeof repoId === 'string' ? repoId : undefined;
    }
    return undefined;
}

function extractInjectionKey(arg: unknown): InjectionKey | undefined {
    if (typeof arg === 'string' && INJECTION_KEYS.includes(arg as InjectionKey)) {
        return arg as InjectionKey;
    }
    if (typeof arg === 'object' && arg !== null && 'injectionKey' in arg) {
        const injectionKey = (arg as { injectionKey?: unknown }).injectionKey;
        if (typeof injectionKey === 'string' && INJECTION_KEYS.includes(injectionKey as InjectionKey)) {
            return injectionKey as InjectionKey;
        }
    }
    return undefined;
}

function persistConfig(configPath: string, config: MetaFlowConfig): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
            folder => fs.existsSync(path.join(folder.uri.fsPath, '.metaflow.json'))
                || fs.existsSync(path.join(folder.uri.fsPath, '.ai', '.metaflow.json'))
        );
    };

    // ── metaflow.refresh ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.refresh', async () => {
            const ws = getWorkspace();
            if (!ws) { return; }

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
                    const nearMissNames = [
                        '.ai-sync_json',
                        '.ai-sync-json',
                        '.ai.sync.json',
                    ];

                    const nearMiss = nearMissNames.find(name =>
                        fs.existsSync(path.join(ws.uri.fsPath, name))
                    );

                    if (nearMiss) {
                        const message = `MetaFlow: Found "${nearMiss}" in workspace root. Rename it to ".metaflow.json".`;
                        logWarn(message);
                        vscode.window.showWarningMessage(message);
                    }
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
            state.config = result.config;
            state.configPath = result.configPath;
            state.activeProfile = result.config.activeProfile;

            try {
                state.effectiveFiles = resolveOverlay(result.config, ws.uri.fsPath);
                logInfo(`Resolved ${state.effectiveFiles.length} effective files.`);
                updateStatusBar('idle', state.activeProfile, state.effectiveFiles.length);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logError(`Overlay resolution failed: ${msg}`);
                updateStatusBar('error');
            }

            state.onDidChange.fire();
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
        vscode.commands.registerCommand('metaflow.apply', async () => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded. Run Refresh first.');
                return;
            }

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
                    await vscode.commands.executeCommand('metaflow.refresh');
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

                    await vscode.commands.executeCommand('metaflow.refresh');
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
                const { layerSources } = ensureMultiRepoConfig(state.config);
                const layerSource = layerSources[layerIndex];
                if (!layerSource) {
                    logWarn(`Toggle layer failed: layer index ${layerIndex} not found.`);
                    return;
                }

                layerSource.enabled = layerSource.enabled === false ? true : false;

                if (state.configPath) {
                    persistConfig(state.configPath, state.config);
                }

                logInfo(`Toggled layer ${layerSource.repoId}/${layerSource.path}: ${layerSource.enabled ? 'enabled' : 'disabled'}`);
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

            if (!state.config.metadataRepos || typeof repoId !== 'string' || repoId.length === 0) {
                logWarn('Toggle repo source requires a multi-repo config and a valid repo id.');
                return;
            }

            const repo = state.config.metadataRepos.find(r => r.id === repoId);
            if (!repo) {
                logWarn(`Toggle repo source failed: repoId "${repoId}" not found.`);
                return;
            }

            repo.enabled = repo.enabled === false ? true : false;

            if (state.configPath) {
                persistConfig(state.configPath, state.config);
            }

            logInfo(`Toggled repo source ${repoId}: ${repo.enabled ? 'enabled' : 'disabled'}`);
            await vscode.commands.executeCommand('metaflow.refresh');
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

    // ── metaflow.toggleInjectionMode ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.toggleInjectionMode', async (arg?: unknown) => {
            const ws = getWorkspace();
            if (!ws || !state.config || !state.configPath) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            const injectionKey = extractInjectionKey(arg);
            if (!injectionKey) {
                logWarn('Toggle injection mode requires a valid injection key.');
                return;
            }

            const currentMode = state.config.injection?.[injectionKey] ?? DEFAULT_INJECTION_MODE[injectionKey];
            const nextMode = currentMode === 'settings' ? 'materialize' : 'settings';

            if (!state.config.injection) {
                state.config.injection = {};
            }
            state.config.injection[injectionKey] = nextMode;

            persistConfig(state.configPath, state.config);
            logInfo(`Injection mode updated: ${injectionKey} -> ${nextMode}`);
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

            if (!state.config.metadataRepos || !state.config.layerSources) {
                vscode.window.showWarningMessage('MetaFlow: Remove repo source is available in multi-repo mode only.');
                return;
            }

            const repoIdFromArg = extractRepoId(arg);
            const repoIds = state.config.metadataRepos.map(repo => repo.id);
            const repoId = repoIdFromArg ?? await vscode.window.showQuickPick(repoIds, {
                title: 'MetaFlow: Remove Repository Source',
                placeHolder: 'Select repository source to remove',
                ignoreFocusOut: true,
            });

            if (!repoId) {
                return;
            }

            const repo = state.config.metadataRepos.find(candidate => candidate.id === repoId);
            if (!repo) {
                logWarn(`Remove repo source failed: repoId "${repoId}" not found.`);
                return;
            }

            if (state.config.metadataRepos.length <= 1) {
                vscode.window.showWarningMessage('MetaFlow: Cannot remove the last repository source.');
                return;
            }

            const layerCount = state.config.layerSources.filter(layer => layer.repoId === repoId).length;
            const confirmation = await vscode.window.showWarningMessage(
                `Remove source "${repoId}" and ${layerCount} associated layer(s)?`,
                'Remove',
                'Cancel'
            );

            if (confirmation !== 'Remove') {
                return;
            }

            state.config.metadataRepos = state.config.metadataRepos.filter(candidate => candidate.id !== repoId);
            state.config.layerSources = state.config.layerSources.filter(layer => layer.repoId !== repoId);

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
