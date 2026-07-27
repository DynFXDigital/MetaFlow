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
import {
    setLogLevel,
    logInfo,
    logWarn,
    disposeOutputChannel,
    LogLevel,
} from './views/outputChannel';
import { createStatusBar, disposeStatusBar } from './views/statusBar';
import { disposeDiagnostics } from './diagnostics/configDiagnostics';
import { createState, registerCommands } from './commands/commandHandlers';
import { ConfigTreeViewProvider } from './views/configTreeView';
import { ProfilesTreeViewProvider } from './views/profilesTreeView';
import { LayersTreeViewProvider } from './views/layersTreeView';
import { FilesTreeViewProvider } from './views/filesTreeView';
import { StagedTreeExpandController } from './views/stagedTreeExpand';
import {
    loadCapabilityDetailModel,
    resolveCapabilityDetailTarget,
} from './commands/capabilityDetails';
import { isBuiltInCapabilityActive } from './builtInCapability';
import {
    extractLayerPath,
    extractRepoId,
    readManagedViewsState,
    writeManagedViewsState,
} from './commands/commandHelpers';
import { CapabilityDetailsPanelManager } from './views/capabilityDetailsPanel';
import { createRepoUpdateScheduler } from './repoUpdateScheduler';
import { createRepoUpdateSchedulerLifecycleController } from './extensionSchedulerLifecycle';
import { createCapabilityPluginMetadataScheduler } from './capabilityPluginMetadataScheduler';
import { registerDiagnosticsTool } from './agentTools/diagnosticsTool';
import { buildDiagnosticsSnapshot } from './diagnostics/diagnosticsSnapshot';
import { createLayerTreeCheckboxQueue } from './layerTreeCheckboxQueue';
import { createLayerTreeCheckboxIdleRefreshScheduler } from './layerTreeCheckboxIdleRefresh';

type FilesViewMode = 'unified' | 'repoTree';
type LayersViewMode = 'flat' | 'tree';

type SearchPreparedTreeProvider<T extends vscode.TreeItem> = {
    getChildren(element?: T): T[];
};

function getContextValue(item: vscode.TreeItem): string {
    return typeof item.contextValue === 'string' ? item.contextValue : '';
}

function isArtifactTypeNode(item: vscode.TreeItem): boolean {
    const contextValue = getContextValue(item);
    return contextValue === 'artifactTypeFolder' || contextValue.startsWith('layerArtifactType:');
}

function isConcreteCapabilityNode(item: vscode.TreeItem): boolean {
    return getContextValue(item) === 'layer';
}

function isCapabilitySearchBoundary(
    item: vscode.TreeItem,
    children: readonly vscode.TreeItem[],
): boolean {
    const contextValue = getContextValue(item);
    return (
        contextValue === 'layer' ||
        contextValue === 'effectiveCapabilityFolder' ||
        children.some((child) => isArtifactTypeNode(child))
    );
}

function workspaceHasMetaFlowConfig(): boolean {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.some((folder) =>
        fs.existsSync(path.join(folder.uri.fsPath, '.metaflow', 'config.jsonc')),
    );
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

function hasGitBackedRepo(config: ReturnType<typeof createState>['config']): boolean {
    if (!config) {
        return false;
    }

    if (config.metadataRepos) {
        return config.metadataRepos.some((repo) => isGitRemoteUrl(repo.url));
    }

    return isGitRemoteUrl(config.metadataRepo?.url);
}

function hasInstalledMetaFlowCapability(state: ReturnType<typeof createState>): boolean {
    return isBuiltInCapabilityActive(state.builtInCapability);
}

function hasLoadedConfig(state: ReturnType<typeof createState>): boolean {
    return !!state.config;
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
    element?: T,
): Promise<void> {
    for (const child of provider.getChildren(element)) {
        if (child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
            await treeView.reveal(child, { expand: 1, select: false, focus: false });
            await revealAll(treeView, provider, child);
        }
    }
}

async function revealSearchBranches<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: SearchPreparedTreeProvider<T>,
    element?: T,
): Promise<void> {
    for (const child of provider.getChildren(element)) {
        if (child.collapsibleState === vscode.TreeItemCollapsibleState.None) {
            continue;
        }

        if (isConcreteCapabilityNode(child)) {
            continue;
        }

        await treeView.reveal(child, { expand: 1, select: false, focus: false });

        const children = provider.getChildren(child);
        if (!isCapabilitySearchBoundary(child, children)) {
            await revealSearchBranches(treeView, provider, child);
        }
    }
}

async function revealBranch<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: { getChildren(e?: T): T[] },
    element: T,
): Promise<void> {
    await treeView.reveal(element, { expand: 1, select: false, focus: false });
    await revealAll(treeView, provider, element);
}

async function collapseBranch<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    element: T,
): Promise<void> {
    // list.collapse operates on the focused tree item; select/focus the branch root first.
    await treeView.reveal(element, { expand: false, select: true, focus: true });
    await vscode.commands.executeCommand('list.collapse');
}

async function prepareTreeViewFilter<T extends vscode.TreeItem>(
    viewId: string,
    treeView: vscode.TreeView<T>,
    provider: SearchPreparedTreeProvider<T>,
): Promise<void> {
    try {
        await vscode.commands.executeCommand(`workbench.actions.treeView.${viewId}.collapseAll`);
    } catch {
        // Some VS Code hosts may not expose generated collapse-all commands.
    }
    await revealSearchBranches(treeView, provider);
}

async function openTreeViewFilter<T extends vscode.TreeItem>(
    viewId: string,
    treeView: vscode.TreeView<T>,
    provider: SearchPreparedTreeProvider<T>,
): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.metaflow-container');

    try {
        await vscode.commands.executeCommand(`${viewId}.focus`);
    } catch {
        // Fall back to the current sidebar focus when the generated focus command is unavailable.
    }

    await prepareTreeViewFilter(viewId, treeView, provider).catch((error: unknown) => {
        logWarn(`MetaFlow: Tree search preload failed: ${String(error)}`);
    });
    await vscode.commands.executeCommand('list.find');
}

function waitForTreeViewRefresh(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 150));
}

async function focusFirstTreeItem<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: SearchPreparedTreeProvider<T>,
): Promise<void> {
    const firstItem = provider.getChildren()[0];
    if (!firstItem) {
        return;
    }

    await treeView.reveal(firstItem, { focus: true, select: false, expand: false });
}

let layersNativeFilterPreviousMode: LayersViewMode | undefined;

async function restoreLayersViewModeAfterFilter(
    provider: LayersTreeViewProvider,
): Promise<void> {
    const previousMode = layersNativeFilterPreviousMode;
    layersNativeFilterPreviousMode = undefined;

    if (!previousMode) {
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return;
    }

    const currentMode = readManagedViewsState(workspaceRoot).layersViewMode;
    if (currentMode === previousMode) {
        return;
    }

    writeManagedViewsState(workspaceRoot, { layersViewMode: previousMode });
    await vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', previousMode);
    provider.refresh();
}

async function openLayersTreeFilter<T extends vscode.TreeItem>(
    treeView: vscode.TreeView<T>,
    provider: LayersTreeViewProvider & SearchPreparedTreeProvider<T>,
): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const currentMode = readManagedViewsState(workspaceRoot).layersViewMode;
        layersNativeFilterPreviousMode ??= currentMode;
        if (currentMode !== 'flat') {
            writeManagedViewsState(workspaceRoot, { layersViewMode: 'flat' });
            await vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', 'flat');
            provider.refresh();
        }
    }

    await vscode.commands.executeCommand('workbench.view.extension.metaflow-container');

    try {
        await vscode.commands.executeCommand('metaflow-layers.focus');
    } catch {
        // Fall back to the current sidebar focus when the generated focus command is unavailable.
    }

    await waitForTreeViewRefresh();

    try {
        await vscode.commands.executeCommand('workbench.actions.treeView.metaflow-layers.collapseAll');
    } catch {
        // Some VS Code hosts may not expose generated collapse-all commands.
    }

    await waitForTreeViewRefresh();
    await focusFirstTreeItem(treeView, provider).catch((error: unknown) => {
        logWarn(`MetaFlow: Tree search focus failed: ${String(error)}`);
    });
    await waitForTreeViewRefresh();
    await vscode.commands.executeCommand('list.focusFirst');
    await waitForTreeViewRefresh();

    await vscode.commands.executeCommand('setContext', 'metaflow.layersNativeFilterActive', true);
    try {
        await vscode.commands.executeCommand('list.find');
    } catch (error: unknown) {
        await restoreLayersViewModeAfterFilter(provider);
        await vscode.commands.executeCommand(
            'setContext',
            'metaflow.layersNativeFilterActive',
            false,
        );
        throw error;
    }
}

async function clearLayersTreeFilter(provider: LayersTreeViewProvider): Promise<void> {
    try {
        await vscode.commands.executeCommand('list.closeFind');
    } catch {
        // Some hosts may not have a focused list find widget when clearing from the title action.
    }

    try {
        await restoreLayersViewModeAfterFilter(provider);
    } finally {
        await vscode.commands.executeCommand(
            'setContext',
            'metaflow.layersNativeFilterActive',
            false,
        );
    }

    try {
        await vscode.commands.executeCommand('metaflow-layers.focus');
    } catch {
        // Fall back to the current sidebar focus when the generated focus command is unavailable.
    }
}

// ── Activation ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    logInfo('MetaFlow extension activating...');
    void vscode.commands.executeCommand('setContext', 'metaflow.layersNativeFilterActive', false);

    // Read log level from settings
    const logLevel = vscode.workspace
        .getConfiguration('metaflow')
        .get<LogLevel>('logLevel', 'info');
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

    const capabilityDetailsPanel = new CapabilityDetailsPanelManager();
    context.subscriptions.push(capabilityDetailsPanel);

    // Register commands (wires engine + synchronization pipeline)
    registerCommands(context, state, diagnosticCollection, capabilityDetailsPanel);

    let scheduledRefreshHandle: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = (): void => {
        if (scheduledRefreshHandle !== undefined) {
            clearTimeout(scheduledRefreshHandle);
        }
        scheduledRefreshHandle = setTimeout(() => {
            scheduledRefreshHandle = undefined;
            void vscode.commands.executeCommand('metaflow.refresh');
        }, 200);
    };
    context.subscriptions.push({
        dispose: () => {
            if (scheduledRefreshHandle !== undefined) {
                clearTimeout(scheduledRefreshHandle);
                scheduledRefreshHandle = undefined;
            }
        },
    });

    registerDiagnosticsTool(
        context,
        () => buildDiagnosticsSnapshot(state, diagnosticCollection),
        async () => {
            if (
                state.capabilityPluginMetadataDirtyVersion ===
                state.capabilityPluginMetadataSettledVersion
            ) {
                return;
            }

            await vscode.commands.executeCommand('metaflow.refresh', {
                skipAutoApply: true,
                skipRepoSync: true,
                skipSettingsInjection: true,
                preferStateConfig: true,
            });
        },
    );

    // Register TreeView providers
    const configTreeViewProvider = new ConfigTreeViewProvider(state, diagnosticCollection);
    const profilesTreeViewProvider = new ProfilesTreeViewProvider(state);
    const layersTreeViewProvider = new LayersTreeViewProvider(state);
    const filesTreeViewProvider = new FilesTreeViewProvider(state);

    let lastFilesViewMode: FilesViewMode | undefined;
    let lastLayersViewMode: LayersViewMode | undefined;
    const syncManagedViewModeContext = (): void => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const managedViews = readManagedViewsState(workspaceRoot);
        const filesMode = managedViews.filesViewMode;
        const layersMode = managedViews.layersViewMode;
        if (filesMode === lastFilesViewMode && layersMode === lastLayersViewMode) {
            return;
        }
        lastFilesViewMode = filesMode;
        lastLayersViewMode = layersMode;
        vscode.commands.executeCommand('setContext', 'metaflow.filesViewMode', filesMode);
        vscode.commands.executeCommand('setContext', 'metaflow.layersViewMode', layersMode);
        filesTreeViewProvider.refresh();
        layersTreeViewProvider.refresh();
    };

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'metaflow.refreshManagedViewModeContext',
            syncManagedViewModeContext,
        ),
    );

    syncManagedViewModeContext();
    vscode.commands.executeCommand('setContext', 'metaflow.hasGitBackedRepo', false);
    vscode.commands.executeCommand(
        'setContext',
        'metaflow.capabilityInstalled',
        hasInstalledMetaFlowCapability(state),
    );
    vscode.commands.executeCommand('setContext', 'metaflow.loading', state.isLoading);
    vscode.commands.executeCommand('setContext', 'metaflow.hasConfig', hasLoadedConfig(state));

    const configTreeView = vscode.window.createTreeView('metaflow-config', {
        treeDataProvider: configTreeViewProvider,
        manageCheckboxStateManually: true,
    });

    const layersTreeView = vscode.window.createTreeView('metaflow-layers', {
        treeDataProvider: layersTreeViewProvider,
        manageCheckboxStateManually: true,
    });

    const filesTreeView = vscode.window.createTreeView('metaflow-files', {
        treeDataProvider: filesTreeViewProvider,
    });

    const layersExpandController = new StagedTreeExpandController(
        layersTreeView,
        layersTreeViewProvider,
    );
    const filesExpandController = new StagedTreeExpandController(
        filesTreeView,
        filesTreeViewProvider,
    );

    let syncCapabilityPluginMetadataScheduler = (): void => {};

    context.subscriptions.push(
        configTreeView,
        vscode.window.registerTreeDataProvider('metaflow-profiles', profilesTreeViewProvider),
        layersTreeView,
        filesTreeView,
        layersExpandController,
        filesExpandController,
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('metaflow.collapseAllLayers', async () => {
            layersExpandController.reset();
            await vscode.commands.executeCommand(
                'workbench.actions.treeView.metaflow-layers.collapseAll',
            );
        }),
        vscode.commands.registerCommand('metaflow.expandAllLayers', async () => {
            if (layersTreeViewProvider.getExpandAllStrategy() === 'staged') {
                await layersExpandController.expandAll();
                return;
            }
            await revealAll(layersTreeView, layersTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.collapseAllFiles', async () => {
            filesExpandController.reset();
            await vscode.commands.executeCommand(
                'workbench.actions.treeView.metaflow-files.collapseAll',
            );
        }),
        vscode.commands.registerCommand('metaflow.expandAllFiles', async () => {
            if (filesTreeViewProvider.getExpandAllStrategy() === 'staged') {
                await filesExpandController.expandAll();
                return;
            }
            await revealAll(filesTreeView, filesTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.openLayersFilter', async () => {
            await openLayersTreeFilter(layersTreeView, layersTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.clearLayersFilter', async () => {
            await clearLayersTreeFilter(layersTreeViewProvider);
        }),
        vscode.commands.registerCommand('metaflow.openFilesFilter', async () => {
            await openTreeViewFilter('metaflow-files', filesTreeView, filesTreeViewProvider);
        }),
        vscode.commands.registerCommand(
            'metaflow.expandLayersBranch',
            async (item?: vscode.TreeItem) => {
                if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                    return;
                }
                await revealBranch(layersTreeView, layersTreeViewProvider, item);
            },
        ),
        vscode.commands.registerCommand(
            'metaflow.collapseLayersBranch',
            async (item?: vscode.TreeItem) => {
                if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                    return;
                }
                await collapseBranch(layersTreeView, item);
            },
        ),
        vscode.commands.registerCommand(
            'metaflow.expandFilesBranch',
            async (item?: vscode.TreeItem) => {
                if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                    return;
                }
                await revealBranch(filesTreeView, filesTreeViewProvider, item);
            },
        ),
        vscode.commands.registerCommand(
            'metaflow.collapseFilesBranch',
            async (item?: vscode.TreeItem) => {
                if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                    return;
                }
                await collapseBranch(filesTreeView, item);
            },
        ),
    );

    const syncCapabilityDetailsPanel = (): void => {
        if (state.isLoading || !state.config) {
            return;
        }

        const request = capabilityDetailsPanel.getCurrentRequest();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!request || !workspaceFolder) {
            return;
        }

        const target = resolveCapabilityDetailTarget(
            state.config,
            workspaceFolder.uri.fsPath,
            state.builtInCapability,
            request,
        );

        if (!target) {
            return;
        }

        void loadCapabilityDetailModel(target, state.treeSummaryCache, {
            governanceContract: state.governanceContract,
            governanceContractErrors: state.governanceContractErrors,
            governanceCompliance: state.governanceCompliance,
        })
            .then((model) => {
                capabilityDetailsPanel.update(model);
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(`Capability details refresh skipped: ${message}`);
            });
    };

    const layerTreeCheckboxIdleRefresh = createLayerTreeCheckboxIdleRefreshScheduler({
        executeRefresh: (options) => vscode.commands.executeCommand('metaflow.refresh', options),
        fireStateChanged: () => {
            state.onDidChange.fire();
        },
        onRefreshError: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logWarn(`Layer tree checkbox idle refresh failed: ${message}`);
        },
    });
    context.subscriptions.push(layerTreeCheckboxIdleRefresh);

    const layerTreeCheckboxQueue = createLayerTreeCheckboxQueue({
        // Checkbox clicks must stay independent from full overlay/count refreshes.
        // Toggle commands already update and persist selection state; the expensive
        // refresh that regenerates derived settings/counts runs only after clicks
        // go idle so it does not compete with TreeView checkbox event delivery.
        settle: async () => {
            layerTreeCheckboxIdleRefresh.schedule();
        },
        clearPendingStates: (clearThroughSequence) => {
            layersTreeViewProvider.clearPendingCapabilityCheckboxStates(clearThroughSequence);
        },
        onSettleError: (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logWarn(`Layer tree checkbox settlement failed: ${message}`);
        },
    });

    context.subscriptions.push(
        state.onDidChange.event(() => {
            vscode.commands.executeCommand(
                'setContext',
                'metaflow.hasGitBackedRepo',
                hasGitBackedRepo(state.config),
            );
            vscode.commands.executeCommand(
                'setContext',
                'metaflow.capabilityInstalled',
                hasInstalledMetaFlowCapability(state),
            );
            vscode.commands.executeCommand('setContext', 'metaflow.loading', state.isLoading);
            vscode.commands.executeCommand(
                'setContext',
                'metaflow.hasConfig',
                hasLoadedConfig(state),
            );

            syncCapabilityPluginMetadataScheduler();
            syncCapabilityDetailsPanel();
        }),
        configTreeView.onDidChangeCheckboxState(async (e) => {
            for (const [item, checkboxState] of e.items) {
                const repoId = (item as { repoId?: unknown }).repoId;
                const contextValue = (item as { contextValue?: unknown }).contextValue;
                if (
                    (checkboxState === vscode.TreeItemCheckboxState.Checked ||
                        checkboxState === vscode.TreeItemCheckboxState.Unchecked) &&
                    typeof repoId === 'string' &&
                    (contextValue === 'configRepoSourceRescannable' ||
                        contextValue === 'configRepoSourceLocalGit' ||
                        contextValue === 'configRepoSourceBuiltin' ||
                        contextValue === 'configRepoSourceGit' ||
                        contextValue === 'configRepoSourceGitBehind' ||
                        contextValue === 'configRepoSourceGitAhead')
                ) {
                    await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                        repoId,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                    });
                }
            }
        }),
    );

    context.subscriptions.push(
        layersTreeView.onDidChangeCheckboxState((e) => {
            let queuedMutation = false;
            for (const [item, checkboxState] of e.items) {
                if (
                    checkboxState !== vscode.TreeItemCheckboxState.Checked &&
                    checkboxState !== vscode.TreeItemCheckboxState.Unchecked
                ) {
                    continue;
                }
                const contextValue = (item as { contextValue?: unknown }).contextValue;
                const layerIndex = (item as { layerIndex?: unknown }).layerIndex;
                const repoId = extractRepoId(item);
                const layerPath = extractLayerPath(item);

                if (contextValue === 'layerRepo' && typeof repoId === 'string') {
                    queuedMutation = true;
                    layersTreeViewProvider.setPendingCapabilityCheckboxState({
                        kind: 'repo',
                        repoId,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                    });
                    void layerTreeCheckboxQueue.enqueueMutation(async () => {
                        await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                            repoId,
                            checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                            deferRefresh: true,
                        });
                    });
                    continue;
                }

                if (contextValue === 'layerFolder' && typeof layerPath === 'string') {
                    queuedMutation = true;
                    layersTreeViewProvider.setPendingCapabilityCheckboxState({
                        kind: 'branch',
                        repoId,
                        layerPath,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                    });
                    void layerTreeCheckboxQueue.enqueueMutation(async () => {
                        await vscode.commands.executeCommand('metaflow.toggleLayerBranch', {
                            repoId,
                            layerPath,
                            checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                            deferRefresh: true,
                        });
                    });
                    continue;
                }

                if (
                    contextValue !== 'layer' ||
                    (typeof layerIndex !== 'number' && typeof layerPath !== 'string')
                ) {
                    continue;
                }

                queuedMutation = true;
                if (typeof layerPath === 'string') {
                    layersTreeViewProvider.setPendingCapabilityCheckboxState({
                        kind: 'layer',
                        repoId,
                        layerPath,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                    });
                }
                void layerTreeCheckboxQueue.enqueueMutation(async () => {
                    await vscode.commands.executeCommand('metaflow.toggleLayer', {
                        layerIndex: typeof layerIndex === 'number' ? layerIndex : undefined,
                        repoId,
                        layerPath,
                        checked: checkboxState === vscode.TreeItemCheckboxState.Checked,
                        deferRefresh: true,
                    });
                });
            }

            if (queuedMutation) {
                const pendingCheckboxSequence =
                    layersTreeViewProvider.getPendingCapabilityCheckboxSequence();
                layerTreeCheckboxQueue.scheduleSettlement(pendingCheckboxSequence);
            }
        }),
    );

    // Listen for settings changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('metaflow.logLevel')) {
                const newLevel = vscode.workspace
                    .getConfiguration('metaflow')
                    .get<LogLevel>('logLevel', 'info');
                setLogLevel(newLevel);
                logInfo(`Log level changed to: ${newLevel}`);
            }
            if (e.affectsConfiguration('metaflow.enabled')) {
                const enabled = vscode.workspace
                    .getConfiguration('metaflow')
                    .get<boolean>('enabled', true);
                vscode.commands.executeCommand('setContext', 'metaflow.active', enabled);
            }
            if (e.affectsConfiguration('metaflow.injection')) {
                scheduleRefresh();
            }
            if (e.affectsConfiguration('metaflow.aiMetadataAutoApplyMode')) {
                scheduleRefresh();
            }
        }),
    );

    const isTestMode =
        context.extensionMode === vscode.ExtensionMode.Test ||
        vscode.workspace.getConfiguration('metaflow').get<boolean>('guiTestMode', false);
    let syncRepoUpdateSchedulerLifecycle = (): void => {};

    // Watch config file create/change/delete and auto-refresh state/UI.
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of workspaceFolders) {
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, '.metaflow/config.jsonc'),
        );
        const stateWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, '.metaflow/state.json'),
        );

        const registerWatcher = (watcher: vscode.FileSystemWatcher, label: string) => {
            context.subscriptions.push(
                watcher,
                watcher.onDidCreate(() => {
                    if (
                        state.isLoading ||
                        state.isApplying ||
                        Date.now() < state.suppressConfigWatcherUntil
                    ) {
                        logInfo(
                            `Config create ignored (${label}); change originated during internal MetaFlow activity.`,
                        );
                        return;
                    }
                    logInfo(`Config created (${label}); refreshing MetaFlow.`);
                    syncRepoUpdateSchedulerLifecycle();
                    scheduleRefresh();
                }),
                watcher.onDidChange(() => {
                    if (
                        state.isLoading ||
                        state.isApplying ||
                        Date.now() < state.suppressConfigWatcherUntil
                    ) {
                        logInfo(
                            `Config change ignored (${label}); change originated during internal MetaFlow activity.`,
                        );
                        return;
                    }
                    logInfo(`Config changed (${label}); refreshing MetaFlow.`);
                    syncRepoUpdateSchedulerLifecycle();
                    scheduleRefresh();
                }),
                watcher.onDidDelete(() => {
                    logInfo(`Config deleted (${label}); refreshing MetaFlow.`);
                    syncRepoUpdateSchedulerLifecycle();
                    scheduleRefresh();
                }),
            );
        };

        registerWatcher(configWatcher, '.metaflow/config.jsonc');
        context.subscriptions.push(
            stateWatcher,
            stateWatcher.onDidCreate(() => {
                logInfo(
                    'Managed state created (.metaflow/state.json); refreshing view mode contexts.',
                );
                syncManagedViewModeContext();
            }),
            stateWatcher.onDidChange(() => {
                logInfo(
                    'Managed state changed (.metaflow/state.json); refreshing view mode contexts.',
                );
                syncManagedViewModeContext();
            }),
            stateWatcher.onDidDelete(() => {
                logInfo(
                    'Managed state deleted (.metaflow/state.json); restoring default view modes.',
                );
                syncManagedViewModeContext();
            }),
        );
    }

    // Set context for keybindings/menus
    vscode.commands.executeCommand('setContext', 'metaflow.active', true);

    if (!isTestMode) {
        // Auto-refresh on activation, then offer promotion for local git repos missing remote URLs.
        void (async () => {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');
            await vscode.commands.executeCommand('metaflow.offerGitIgnoreStateConfiguration');
        })();

        const schedulerLifecycle = createRepoUpdateSchedulerLifecycleController({
            workspaceHasConfig: workspaceHasMetaFlowConfig,
            createScheduler: () => {
                const scheduler = createRepoUpdateScheduler();
                context.subscriptions.push(scheduler);
                return scheduler;
            },
            onStarted: () => {
                logInfo('Repository update scheduler started.');
            },
            onStopped: () => {
                logInfo('Repository update scheduler stopped: no .metaflow/config.jsonc found.');
            },
        });

        syncRepoUpdateSchedulerLifecycle = (): void => {
            schedulerLifecycle.sync();
        };

        context.subscriptions.push({
            dispose: () => {
                schedulerLifecycle.dispose();
            },
        });

        // Start/stop automatic background checks for upstream repo updates.
        syncRepoUpdateSchedulerLifecycle();

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            const capabilityPluginMetadataScheduler = createCapabilityPluginMetadataScheduler(
                state,
                workspaceRoot,
            );
            syncCapabilityPluginMetadataScheduler = (): void => {
                capabilityPluginMetadataScheduler.sync();
            };
            syncCapabilityPluginMetadataScheduler();
            context.subscriptions.push(capabilityPluginMetadataScheduler);
        }
    }

    logInfo('MetaFlow extension activated.');
}

export function deactivate(): void {
    disposeStatusBar();
    disposeDiagnostics();
    disposeOutputChannel();
}
