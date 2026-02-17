/**
 * MetaFlow VS Code Extension — entry point.
 *
 * Activation:
 * - On workspace containing `.metaflow/config.jsonc`.
 * - On any `metaflow.*` command invocation.
 *
 * Follows the disposable pattern: all subscriptions tracked for cleanup.
 */

import * as vscode from 'vscode';
import { setLogLevel, logInfo, disposeOutputChannel, LogLevel } from './views/outputChannel';
import { createStatusBar, disposeStatusBar } from './views/statusBar';
import { disposeDiagnostics } from './diagnostics/configDiagnostics';
import { createState, registerCommands } from './commands/commandHandlers';
import { ConfigTreeViewProvider } from './views/configTreeView';
import { ProfilesTreeViewProvider } from './views/profilesTreeView';
import { LayersTreeViewProvider } from './views/layersTreeView';
import { FilesTreeViewProvider } from './views/filesTreeView';

// ── Activation ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    logInfo('MetaFlow extension activating...');

    // Read log level from settings
    const logLevel = vscode.workspace.getConfiguration('metaflow').get<LogLevel>('logLevel', 'info');
    setLogLevel(logLevel);

    // Initialize status bar
    const statusBar = createStatusBar();
    context.subscriptions.push(statusBar);

    // Initialize diagnostic collection
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('metaflow');
    context.subscriptions.push(diagnosticCollection);

    // Initialize extension state
    const state = createState();
    context.subscriptions.push(state.onDidChange);

    // Register commands (wires engine + materializer)
    registerCommands(context, state, diagnosticCollection);

    // Register TreeView providers
    const configTreeViewProvider = new ConfigTreeViewProvider(state);
    const profilesTreeViewProvider = new ProfilesTreeViewProvider(state);
    const layersTreeViewProvider = new LayersTreeViewProvider(state);
    const filesTreeViewProvider = new FilesTreeViewProvider(state);

    const configTreeView = vscode.window.createTreeView('metaflow-config', {
        treeDataProvider: configTreeViewProvider,
    });

    const layersTreeView = vscode.window.createTreeView('metaflow-layers', {
        treeDataProvider: layersTreeViewProvider,
    });

    context.subscriptions.push(
        configTreeView,
        vscode.window.registerTreeDataProvider('metaflow-profiles', profilesTreeViewProvider),
        layersTreeView,
        vscode.window.registerTreeDataProvider('metaflow-files', filesTreeViewProvider),
    );

    context.subscriptions.push(
        configTreeView.onDidChangeCheckboxState(async e => {
            for (const [item, checkboxState] of e.items) {
                const repoId = (item as { repoId?: unknown }).repoId;
                if (
                    (checkboxState === vscode.TreeItemCheckboxState.Checked ||
                        checkboxState === vscode.TreeItemCheckboxState.Unchecked) &&
                    typeof repoId === 'string'
                ) {
                    await vscode.commands.executeCommand('metaflow.toggleRepoSource', repoId);
                }
            }
        })
    );

    context.subscriptions.push(
        layersTreeView.onDidChangeCheckboxState(async e => {
            for (const [item, checkboxState] of e.items) {
                if (
                    (checkboxState === vscode.TreeItemCheckboxState.Checked ||
                        checkboxState === vscode.TreeItemCheckboxState.Unchecked) &&
                    typeof item.layerIndex === 'number'
                ) {
                    await vscode.commands.executeCommand('metaflow.toggleLayer', item.layerIndex);
                }
            }
        })
    );

    // Listen for settings changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('metaflow.logLevel')) {
                const newLevel = vscode.workspace.getConfiguration('metaflow').get<LogLevel>('logLevel', 'info');
                setLogLevel(newLevel);
                logInfo(`Log level changed to: ${newLevel}`);
            }
            if (e.affectsConfiguration('metaflow.enabled')) {
                const enabled = vscode.workspace.getConfiguration('metaflow').get<boolean>('enabled', true);
                vscode.commands.executeCommand('setContext', 'metaflow.active', enabled);
            }
            if (e.affectsConfiguration('metaflow.injection')) {
                vscode.commands.executeCommand('metaflow.refresh');
            }
        })
    );

    // Watch config file create/change/delete and auto-refresh state/UI.
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of workspaceFolders) {
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, '.metaflow/config.jsonc')
        );

        const registerWatcher = (watcher: vscode.FileSystemWatcher, label: string) => {
            context.subscriptions.push(
                watcher,
                watcher.onDidCreate(() => {
                    logInfo(`Config created (${label}); refreshing MetaFlow.`);
                    vscode.commands.executeCommand('metaflow.refresh');
                }),
                watcher.onDidChange(() => {
                    logInfo(`Config changed (${label}); refreshing MetaFlow.`);
                    vscode.commands.executeCommand('metaflow.refresh');
                }),
                watcher.onDidDelete(() => {
                    logInfo(`Config deleted (${label}); refreshing MetaFlow.`);
                    vscode.commands.executeCommand('metaflow.refresh');
                })
            );
        };

        registerWatcher(configWatcher, '.metaflow/config.jsonc');
    }

    // Set context for keybindings/menus
    vscode.commands.executeCommand('setContext', 'metaflow.active', true);

    // Auto-refresh on activation
    vscode.commands.executeCommand('metaflow.refresh');

    logInfo('MetaFlow extension activated.');
}

export function deactivate(): void {
    disposeStatusBar();
    disposeDiagnostics();
    disposeOutputChannel();
}
