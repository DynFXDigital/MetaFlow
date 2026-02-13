/**
 * Command handlers for MetaFlow extension.
 *
 * Wires overlay engine + materializer into VS Code commands.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
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
    checkAllDrift,
    loadManagedState,
} from '@metaflow/engine';
import { publishConfigDiagnostics, clearDiagnostics } from '../diagnostics/configDiagnostics';
import { logInfo, logWarn, logError, showOutputChannel } from '../views/outputChannel';
import { updateStatusBar } from '../views/statusBar';
import { initConfig } from './initConfig';

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

/**
 * Register all MetaFlow command handlers.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    state: ExtensionState,
    diagnosticCollection: vscode.DiagnosticCollection
): void {
    const getWorkspace = () => {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            vscode.window.showErrorMessage('MetaFlow: No workspace folder open.');
            return undefined;
        }
        return ws;
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
                updateStatusBar('error');
                state.config = undefined;
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

                    // Inject settings for live-ref files (may fail if Copilot extension not present)
                    try {
                        const entries = computeSettingsEntries(
                            state.effectiveFiles,
                            ws.uri.fsPath,
                            state.config!
                        );
                        const wsConfig = vscode.workspace.getConfiguration(undefined, ws.uri);
                        for (const entry of entries) {
                            await wsConfig.update(entry.key, entry.value, vscode.ConfigurationTarget.Workspace);
                        }
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logWarn(`Settings injection skipped: ${msg}`);
                    }

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

            const result = clean(ws.uri.fsPath);

            logInfo(`Clean complete: ${result.removed.length} removed, ${result.skipped.length} skipped.`);
            for (const w of result.warnings) {
                logWarn(w);
            }

            vscode.window.showInformationMessage(
                `MetaFlow: Cleaned ${result.removed.length} files.`
            );

            await vscode.commands.executeCommand('metaflow.refresh');
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
        vscode.commands.registerCommand('metaflow.toggleLayer', async (layerIndex?: number) => {
            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage('MetaFlow: No config loaded.');
                return;
            }

            if (state.config.layerSources && typeof layerIndex === 'number') {
                const ls = state.config.layerSources[layerIndex];
                if (ls) {
                    ls.enabled = ls.enabled === false ? true : false;
                    // Write back
                    if (state.configPath) {
                        fs.writeFileSync(
                            state.configPath,
                            JSON.stringify(state.config, null, 2),
                            'utf-8'
                        );
                    }
                    logInfo(`Toggled layer ${ls.repoId}/${ls.path}: ${ls.enabled ? 'enabled' : 'disabled'}`);
                    await vscode.commands.executeCommand('metaflow.refresh');
                }
            } else {
                logWarn('Toggle layer requires a multi-repo config with layerSources.');
            }
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
            const ws = getWorkspace();
            if (!ws) { return; }
            await initConfig(ws);
            await vscode.commands.executeCommand('metaflow.refresh');
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
