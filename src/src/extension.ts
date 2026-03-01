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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setLogLevel, logInfo, disposeOutputChannel, LogLevel } from './views/outputChannel';
import { createStatusBar, disposeStatusBar } from './views/statusBar';
import { disposeDiagnostics } from './diagnostics/configDiagnostics';
import { createState, registerCommands } from './commands/commandHandlers';
import { ConfigTreeViewProvider } from './views/configTreeView';
import { ProfilesTreeViewProvider } from './views/profilesTreeView';
import { LayersTreeViewProvider } from './views/layersTreeView';
import { FilesTreeViewProvider } from './views/filesTreeView';
import { createRepoUpdateScheduler } from './repoUpdateScheduler';

type FilesViewMode = 'unified' | 'repoTree';
type LayersViewMode = 'flat' | 'tree';

function getFilesViewMode(): FilesViewMode {
    return vscode.workspace.getConfiguration('metaflow').get<FilesViewMode>('filesViewMode', 'unified');
}

function getLayersViewMode(): LayersViewMode {
    return vscode.workspace.getConfiguration('metaflow').get<LayersViewMode>('layersViewMode', 'flat');
}

function workspaceHasMetaFlowConfig(): boolean {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.some(folder => fs.existsSync(path.join(folder.uri.fsPath, '.metaflow', 'config.jsonc')));
}

/**
 * Recursively reveals all collapsible nodes in a tree view.
 * Calling reveal() with expand:1 on each node overrides VS Code's cached
 * collapsed state and forces the node to load and show its children.
 * getParent() is populated via WeakMap tracking in getChildren(), giving
 * VS Code the ancestry chain it needs to locate each node.
 */
async function revealAll<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: { getChildren(e?: T): T[] },
    element?: T
): Promise<void> {
    for (const child of provider.getChildren(element)) {
        if (child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
            await treeView.reveal(child, { expand: 1, select: false, focus: false });
            await revealAll(treeView, provider, child);
        }
    }
}

async function revealBranch<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: { getChildren(e?: T): T[] },
    element: T
): Promise<void> {
    await treeView.reveal(element, { expand: 1, select: false, focus: false });
    await revealAll(treeView, provider, element);
}

async function collapseBranch<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    element: T
): Promise<void> {
    // list.collapse operates on the focused tree item; select/focus the branch root first.
    await treeView.reveal(element, { expand: false, select: true, focus: true });
    await vscode.commands.executeCommand('list.collapse');
}

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

    vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', getFilesViewMode());
    vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', getLayersViewMode());

    const configTreeView = vscode.window.createTreeView('metaflow-config', {
        treeDataProvider: configTreeViewProvider,
    });

    const layersTreeView = vscode.window.createTreeView('metaflow-layers', {
        treeDataProvider: layersTreeViewProvider,
        manageCheckboxStateManually: true,
    });

    const filesTreeView = vscode.window.createTreeView('metaflow-files', {
        treeDataProvider: filesTreeViewProvider,
    });

    context.subscriptions.push(
        configTreeView,
        vscode.window.registerTreeDataProvider('metaflow-profiles', profilesTreeViewProvider),
        layersTreeView,
        filesTreeView,
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.collapseAllLayers', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.metaflow-layers.collapseAll');
        }),
        vscode.commands.registerCommand('metaflow.expandAllLayers', async () => {
            await revealAll(layersTreeView, layersTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.collapseAllFiles', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.metaflow-files.collapseAll');
        }),
        vscode.commands.registerCommand('metaflow.expandAllFiles', async () => {
            await revealAll(filesTreeView, filesTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.expandLayersBranch', async (item?: vscode.TreeItem) => {
            if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                return;
            }
            await revealBranch(layersTreeView, layersTreeViewProvider, item);
        }),
        vscode.commands.registerCommand('metaflow.collapseLayersBranch', async (item?: vscode.TreeItem) => {
            if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                return;
            }
            await collapseBranch(layersTreeView, item);
        }),
        vscode.commands.registerCommand('metaflow.expandFilesBranch', async (item?: vscode.TreeItem) => {
            if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                return;
            }
            await revealBranch(filesTreeView, filesTreeViewProvider, item);
        }),
        vscode.commands.registerCommand('metaflow.collapseFilesBranch', async (item?: vscode.TreeItem) => {
            if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                return;
            }
            await collapseBranch(filesTreeView, item);
        }),
    );

    context.subscriptions.push(
        configTreeView.onDidChangeCheckboxState(async e => {
            for (const [item, checkboxState] of e.items) {
                const repoId = (item as { repoId?: unknown }).repoId;
                const contextValue = (item as { contextValue?: unknown }).contextValue;
                if (
                    (checkboxState === vscode.TreeItemCheckboxState.Checked ||
                        checkboxState === vscode.TreeItemCheckboxState.Unchecked) &&
                    typeof repoId === 'string' &&
                    (contextValue === 'configRepoSourceRescannable' ||
                        contextValue === 'configRepoSourceGitRescannable')
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
                    checkboxState !== vscode.TreeItemCheckboxState.Checked &&
                    checkboxState !== vscode.TreeItemCheckboxState.Unchecked
                ) {
                    continue;
                }
                const contextValue = (item as { contextValue?: unknown }).contextValue;
                const layerIndex = (item as { layerIndex?: unknown }).layerIndex;

                if (typeof layerIndex !== 'number') {
                    continue;
                }

                if (contextValue === 'layerArtifactType') {
                    await vscode.commands.executeCommand('metaflow.toggleLayerArtifactType', item, checkboxState);
                } else {
                    await vscode.commands.executeCommand('metaflow.toggleLayer', {
                        layerIndex,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                    });
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
            if (e.affectsConfiguration('metaflow.filesViewMode')) {
                const mode = getFilesViewMode();
                vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', mode);
                filesTreeViewProvider.refresh();
            }
            if (e.affectsConfiguration('metaflow.layersViewMode')) {
                const mode = getLayersViewMode();
                vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', mode);
                layersTreeViewProvider.refresh();
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
                    syncRepoUpdateSchedulerLifecycle();
                    vscode.commands.executeCommand('metaflow.refresh');
                }),
                watcher.onDidChange(() => {
                    logInfo(`Config changed (${label}); refreshing MetaFlow.`);
                    syncRepoUpdateSchedulerLifecycle();
                    vscode.commands.executeCommand('metaflow.refresh');
                }),
                watcher.onDidDelete(() => {
                    logInfo(`Config deleted (${label}); refreshing MetaFlow.`);
                    syncRepoUpdateSchedulerLifecycle();
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

    let repoUpdateSchedulerDisposable: vscode.Disposable | undefined;
    const syncRepoUpdateSchedulerLifecycle = (): void => {
        const hasConfig = workspaceHasMetaFlowConfig();
        if (hasConfig && !repoUpdateSchedulerDisposable) {
            repoUpdateSchedulerDisposable = createRepoUpdateScheduler();
            context.subscriptions.push(repoUpdateSchedulerDisposable);
            logInfo('Repository update scheduler started.');
            return;
        }

        if (!hasConfig && repoUpdateSchedulerDisposable) {
            repoUpdateSchedulerDisposable.dispose();
            repoUpdateSchedulerDisposable = undefined;
            logInfo('Repository update scheduler stopped: no .metaflow/config.jsonc found.');
        }
    };

    // Start/stop automatic background checks for upstream repo updates.
    syncRepoUpdateSchedulerLifecycle();

    logInfo('MetaFlow extension activated.');
}

export function deactivate(): void {
    disposeStatusBar();
    disposeDiagnostics();
    disposeOutputChannel();
}
