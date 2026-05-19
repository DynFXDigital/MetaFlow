import * as assert from 'assert';

const EXTENSION_VERSION = 'test-version-1';

type RegisteredCommand = (...args: unknown[]) => Promise<unknown> | unknown;

type ExecuteRecord = {
    command: string;
    args: unknown[];
    inProgress: boolean;
};

class MockEventEmitter {
    public event = (): { dispose: () => void } => ({
        dispose: () => {},
    });

    public fire(): void {}

    public dispose(): void {}
}

function createCommandHandlersHarness(initResult: boolean) {
    const registeredCommands = new Map<string, RegisteredCommand>();
    const executedCommands: ExecuteRecord[] = [];
    const progressTitles: string[] = [];
    const informationMessages: string[] = [];
    let progressDepth = 0;
    const informationMessageResponses: unknown[] = [];
    const workspaceStateStore = new Map<string, unknown>();

    const workspaceFolder = {
        uri: {
            fsPath: 'C:/workspace/project',
            scheme: 'file',
        },
        name: 'project',
        index: 0,
    };

    const watcher = {
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
    };

    const mockVscode = {
        ProgressLocation: { Notification: 15 },
        ConfigurationTarget: {
            Global: 1,
            Workspace: 2,
            WorkspaceFolder: 3,
        },
        TreeItemCheckboxState: {
            Checked: 1,
            Unchecked: 0,
        },
        EventEmitter: MockEventEmitter,
        window: {
            activeTextEditor: undefined,
            showWarningMessage: async () => undefined,
            showWorkspaceFolderPick: async () => workspaceFolder,
            showErrorMessage: () => undefined,
            showInformationMessage: async (message: string) => {
                informationMessages.push(message);
                return informationMessageResponses.shift();
            },
            withProgress: async (options: { title?: string }, task: () => Promise<unknown>) => {
                progressTitles.push(options.title ?? '');
                progressDepth += 1;
                try {
                    return await task();
                } finally {
                    progressDepth -= 1;
                }
            },
        },
        commands: {
            registerCommand: (command: string, callback: RegisteredCommand) => {
                registeredCommands.set(command, callback);
                return { dispose: () => {} };
            },
            executeCommand: async (command: string, ...args: unknown[]) => {
                executedCommands.push({ command, args, inProgress: progressDepth > 0 });
                return undefined;
            },
        },
        workspace: {
            workspaceFolders: [workspaceFolder],
            getConfiguration: () => ({
                get: (_key: string, defaultValue: unknown) => defaultValue,
                update: async () => {},
                inspect: () => ({ workspaceFolderValue: undefined }),
            }),
            createFileSystemWatcher: () => watcher,
        },
        Uri: {
            file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
        },
    };

    const mockEngine = {
        loadConfig: () => ({ ok: false, errors: [], configPath: undefined }),
        resolveLayers: () => [],
        detectSurfacedFileConflicts: () => [],
        formatSurfacedFileConflictMessage: () => '',
        loadCapabilityManifestForLayer: () => undefined,
        loadRepoManifestForRoot: () => undefined,
        discoverLayersInRepo: () => [],
        buildEffectiveFileMap: () => new Map(),
        resolvePathFromWorkspace: (_root: string, localPath: string) => localPath,
        applyFilters: (files: unknown[]) => files,
        applyExcludedTypeFilters: (files: unknown[]) => files,
        applyProfile: (files: unknown[]) => files,
        classifyFiles: () => [],
        apply: () => ({ written: [], skipped: [], removed: [], warnings: [] }),
        clean: () => ({ written: [], skipped: [], removed: [], warnings: [] }),
        preview: () => [],
        computeSettingsEntries: () => [],
        computeSettingsKeysToRemove: () => [],
        checkAllDrift: () => [],
        loadManagedState: () => ({ files: {}, lastApply: undefined }),
        toAuthoredConfig: (config: unknown) => config,
    };

    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;

    moduleInternals._load = function patchedLoad(
        request: string,
        parent: NodeModule | null,
        isMain: boolean,
    ): unknown {
        if (request === 'vscode') {
            return mockVscode;
        }
        if (request === '@metaflow/engine') {
            return mockEngine;
        }
        if (
            request === '../diagnostics/configDiagnostics' ||
            request.endsWith('/diagnostics/configDiagnostics')
        ) {
            return {
                publishConfigDiagnostics: () => {},
                clearDiagnostics: () => {},
            };
        }
        if (request === '../views/outputChannel' || request.endsWith('/views/outputChannel')) {
            return {
                logInfo: () => {},
                logWarn: () => {},
                logError: () => {},
                showOutputChannel: () => {},
            };
        }
        if (request === '../views/statusBar' || request.endsWith('/views/statusBar')) {
            return { updateStatusBar: () => {} };
        }
        if (request === './initConfig' || request.endsWith('/commands/initConfig')) {
            return {
                initConfig: async () => initResult,
                resolveSourceSelection: async () => undefined,
                InitSourceMode: {},
            };
        }
        if (
            request === './workspaceSelection' ||
            request.endsWith('/commands/workspaceSelection')
        ) {
            return {
                pickWorkspaceFolder: (folders: (typeof workspaceFolder)[]) => folders[0],
            };
        }
        if (
            request === './capabilityWarnings' ||
            request.endsWith('/commands/capabilityWarnings')
        ) {
            return { formatCapabilityWarningMessage: () => '' };
        }
        if (request === './commandHelpers' || request.endsWith('/commands/commandHelpers')) {
            return {
                isInjectionMode: () => true,
                deriveRepoId: () => 'primary',
                ensureMultiRepoConfig: (config: unknown) => config,
                extractLayerIndex: () => undefined,
                extractLayerPath: (arg: unknown) =>
                    typeof (arg as { layerPath?: unknown } | undefined)?.layerPath === 'string'
                        ? ((arg as { layerPath: string }).layerPath as string)
                        : undefined,
                extractLayerCheckedState: (arg: unknown) =>
                    typeof (arg as { checked?: unknown } | undefined)?.checked === 'boolean'
                        ? ((arg as { checked: boolean }).checked as boolean)
                        : undefined,
                extractRepoId: (arg: unknown) =>
                    typeof (arg as { repoId?: unknown } | undefined)?.repoId === 'string'
                        ? ((arg as { repoId: string }).repoId as string)
                        : undefined,
                extractRepoScopeOptions: () => ({}),
                extractRefreshCommandOptions: (arg: unknown) => arg ?? {},
                extractApplyCommandOptions: (arg: unknown) => arg ?? {},
                readManagedViewsState: () => ({
                    filesViewMode: 'unified',
                    layersViewMode: 'tree',
                }),
                writeManagedViewsState: () => ({
                    filesViewMode: 'unified',
                    layersViewMode: 'tree',
                }),
                normalizeFilesViewMode: () => 'unified',
                normalizeLayersViewMode: () => 'flat',
                normalizeAiMetadataAutoApplyMode: () => 'off',
                normalizeAndDeduplicateLayerPaths: () => false,
                pruneStaleLayerSources: () => [],
            };
        }
        if (request === './starterMetadata' || request.endsWith('/commands/starterMetadata')) {
            return {
                ensureMetaFlowAiMetadataCache: async () => undefined,
                scaffoldMetaFlowAiMetadata: async () => [],
            };
        }
        if (request === './repoSyncStatus' || request.endsWith('/commands/repoSyncStatus')) {
            return {
                checkRepoSyncStatus: async () => ({ kind: 'nonGit', reason: 'not a git repo' }),
                pullRepositoryFastForward: async () => ({ ok: true, message: 'ok' }),
                runGitCommand: async () => ({ stdout: '', stderr: '' }),
                RepoSyncStatus: {},
            };
        }
        if (request === './capabilityDetails' || request.endsWith('/commands/capabilityDetails')) {
            return {
                loadCapabilityDetailModel: () => undefined,
                resolveCapabilityDetailTarget: () => undefined,
            };
        }
        if (request === '../builtInCapability' || request.endsWith('/builtInCapability')) {
            return {
                BUILT_IN_CAPABILITY_LAYER_PATH: '.',
                BUILT_IN_CAPABILITY_REPO_ID: 'metaflow.builtin',
                BUILT_IN_CAPABILITY_STATE_KEY: 'metaflow.builtin.state',
                isBuiltInCapabilityActive: (state: {
                    enabled: boolean;
                    synchronizedFiles: string[];
                }) => state.enabled || state.synchronizedFiles.length > 0,
                readBuiltInCapabilityRuntimeState: () => {
                    const payload = workspaceStateStore.get('metaflow.builtin.state') as
                        | {
                              enabled?: boolean;
                              layerEnabled?: boolean;
                              layerStates?: Record<string, boolean>;
                              synchronizedFiles?: string[];
                          }
                        | undefined;

                    return {
                        enabled: payload?.enabled ?? false,
                        layerEnabled: payload?.layerEnabled ?? true,
                        layerStates: payload?.layerStates ?? {},
                        synchronizedFiles: payload?.synchronizedFiles ?? [],
                        sourceRoot: 'C:/extension/assets/metaflow-ai-metadata',
                        sourceId: 'dynfxdigital.metaflow-ai',
                        sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                    };
                },
                normalizeBuiltInLayerPath: (layerPath: string) => layerPath || '.',
                resolveBuiltInCapabilityDisplayName: () => 'MetaFlow: AI Metadata Overlay',
                resolveBuiltInLayerEnabled: (
                    state: {
                        layerEnabled: boolean;
                        layerStates?: Record<string, boolean>;
                    },
                    layerPath: string,
                ) => state.layerStates?.[layerPath] ?? state.layerEnabled,
                sanitizeBuiltInLayerStates: (value: Record<string, boolean> | undefined) =>
                    value ?? {},
                sanitizeSynchronizedFiles: (files: string[]) => files,
            };
        }
        if (
            request === '../views/capabilityDetailsPanel' ||
            request.endsWith('/views/capabilityDetailsPanel')
        ) {
            return { CapabilityDetailsPanelManager: class {} };
        }
        if (
            request === './settingsTargetHelpers' ||
            request.endsWith('/commands/settingsTargetHelpers')
        ) {
            return {
                mergeSettingsValue: (_existing: unknown, nextValue: unknown) => nextValue,
                removeSettingsEntries: async () => {},
                resolveTarget: () => ({ requested: 'workspace', effective: 'workspace' }),
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../commands/commandHandlers');
    delete require.cache[targetPath];

    try {
        const module = require(targetPath) as {
            createState: () => {
                onDidChange: MockEventEmitter;
                isLoading: boolean;
                isApplying: boolean;
                suppressConfigWatcherUntil: number;
                effectiveFiles: unknown[];
                capabilityByLayer: Record<string, unknown>;
                repoMetadataById: Record<string, unknown>;
                capabilityWarnings: string[];
                repoSyncByRepoId: Record<string, unknown>;
                builtInCapability: {
                    enabled: boolean;
                    layerEnabled: boolean;
                    synchronizedFiles: string[];
                    sourceRoot?: string;
                    sourceId: string;
                    sourceDisplayName: string;
                };
            };
            registerCommands: (
                context: { subscriptions: Array<{ dispose: () => void }> } & Record<
                    string,
                    unknown
                >,
                state: ReturnType<typeof module.createState>,
                diagnosticCollection: unknown,
                capabilityDetailsPanel: unknown,
            ) => void;
        };

        const state = module.createState();
        const context = {
            subscriptions: [] as Array<{ dispose: () => void }>,
            workspaceState: {
                get: (key: string) => workspaceStateStore.get(key),
                update: async (key: string, value: unknown) => {
                    workspaceStateStore.set(key, value);
                },
            },
            globalStorageUri: {
                fsPath: 'C:/global-storage',
                scheme: 'file',
            },
            extensionPath: 'C:/extension',
            extension: {
                id: 'dynfxdigital.metaflow-ai',
                packageJSON: {
                    displayName: 'MetaFlow: AI Metadata Overlay',
                    version: EXTENSION_VERSION,
                },
            },
        };

        module.registerCommands(
            context,
            state,
            { clear: () => {}, delete: () => {}, set: () => {}, dispose: () => {} },
            {
                getCurrentRequest: () => undefined,
                getSnapshot: () => undefined,
                updateEnabledState: () => undefined,
                update: () => {},
                show: () => undefined,
            },
        );

        return {
            registeredCommands,
            executedCommands,
            progressTitles,
            informationMessages,
            informationMessageResponses,
            workspaceStateStore,
            state,
            dispose: () => {
                moduleInternals._load = originalLoad;
                delete require.cache[targetPath];
            },
        };
    } catch (error) {
        moduleInternals._load = originalLoad;
        delete require.cache[targetPath];
        throw error;
    }
}

suite('Command Handlers initConfig command', () => {
    test('refreshes, auto-enables built-in plugin-first defaults, and runs promotion after initialization succeeds', async () => {
        const harness = createCommandHandlersHarness(true);

        try {
            const callback = harness.registeredCommands.get('metaflow.initConfig');
            assert.ok(callback, 'metaflow.initConfig command should be registered');

            await callback!();

            assert.deepStrictEqual(harness.progressTitles, [
                'MetaFlow: Initializing configuration…',
            ]);
            assert.deepStrictEqual(
                harness.executedCommands.map((entry) => ({
                    command: entry.command,
                    args: entry.args,
                    inProgress: entry.inProgress,
                })),
                [
                    {
                        command: 'metaflow.refresh',
                        args: [{ skipRepoSync: true }],
                        inProgress: true,
                    },
                    {
                        command: 'metaflow.offerGitRemotePromotion',
                        args: [],
                        inProgress: false,
                    },
                    {
                        command: 'metaflow.offerGitIgnoreStateConfiguration',
                        args: [],
                        inProgress: false,
                    },
                ],
            );
            assert.deepStrictEqual(harness.informationMessages, [
                'MetaFlow: Built-in MetaFlow capability enabled automatically (plugin-first defaults).',
            ]);
            assert.deepStrictEqual(harness.workspaceStateStore.get('metaflow.builtin.state'), {
                enabled: true,
                layerEnabled: true,
                disabledByUser: false,
                synchronizedFiles: [],
                layerStates: {},
            });
        } finally {
            harness.dispose();
        }
    });

    test('continues initialization without re-enabling built-in capability when it is already active', async () => {
        const harness = createCommandHandlersHarness(true);

        try {
            const callback = harness.registeredCommands.get('metaflow.initConfig');
            assert.ok(callback, 'metaflow.initConfig command should be registered');
            harness.workspaceStateStore.set('metaflow.builtin.state', {
                enabled: true,
                layerEnabled: true,
                disabledByUser: false,
                synchronizedFiles: [],
                layerStates: {},
            });

            await callback!();

            assert.deepStrictEqual(harness.progressTitles, [
                'MetaFlow: Initializing configuration…',
            ]);
            assert.deepStrictEqual(
                harness.executedCommands.map((entry) => ({
                    command: entry.command,
                    args: entry.args,
                    inProgress: entry.inProgress,
                })),
                [
                    {
                        command: 'metaflow.refresh',
                        args: [{ skipRepoSync: true }],
                        inProgress: true,
                    },
                    {
                        command: 'metaflow.offerGitRemotePromotion',
                        args: [],
                        inProgress: false,
                    },
                    {
                        command: 'metaflow.offerGitIgnoreStateConfiguration',
                        args: [],
                        inProgress: false,
                    },
                ],
            );
            assert.deepStrictEqual(harness.informationMessages, []);
        } finally {
            harness.dispose();
        }
    });

    test('does not refresh when initialization is canceled', async () => {
        const harness = createCommandHandlersHarness(false);

        try {
            const callback = harness.registeredCommands.get('metaflow.initConfig');
            assert.ok(callback, 'metaflow.initConfig command should be registered');

            await callback!();

            assert.deepStrictEqual(harness.progressTitles, []);
            assert.deepStrictEqual(harness.executedCommands, []);
        } finally {
            harness.dispose();
        }
    });

    test('toggleRepoSource toggles the built-in MetaFlow repo through workspace state and refreshes', async () => {
        const harness = createCommandHandlersHarness(true);

        try {
            const callback = harness.registeredCommands.get('metaflow.toggleRepoSource');
            assert.ok(callback, 'metaflow.toggleRepoSource command should be registered');

            harness.state.builtInCapability = {
                enabled: true,
                layerEnabled: true,
                layerStates: {
                    'capabilities/metadata-authoring/github-copilot-metadata-authoring': false,
                },
                synchronizedFiles: [],
                sourceRoot: 'C:/extension/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            } as typeof harness.state.builtInCapability & {
                layerStates: Record<string, boolean>;
            };

            await callback!({ repoId: 'metaflow.builtin', checked: false });

            assert.deepStrictEqual(
                harness.workspaceStateStore.get('metaflow.builtin.state'),
                {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    layerStates: {},
                    synchronizedFiles: [],
                },
                'built-in repo toggle should persist repo-level disabled state, mark the repo as user-disabled, and clear per-layer overrides',
            );
            assert.deepStrictEqual(
                harness.executedCommands.map((entry) => ({
                    command: entry.command,
                    args: entry.args,
                })),
                [
                    {
                        command: 'metaflow.refresh',
                        args: [{ skipRepoSync: true }],
                    },
                ],
            );
        } finally {
            harness.dispose();
        }
    });

    test('toggleLayer disables the built-in root capability through workspace state and refreshes', async () => {
        const harness = createCommandHandlersHarness(true);

        try {
            const callback = harness.registeredCommands.get('metaflow.toggleLayer');
            assert.ok(callback, 'metaflow.toggleLayer command should be registered');

            harness.state.builtInCapability = {
                enabled: true,
                layerEnabled: true,
                layerStates: {
                    'capabilities/metadata-authoring/github-copilot-metadata-authoring': false,
                },
                synchronizedFiles: [],
                sourceRoot: 'C:/extension/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            } as typeof harness.state.builtInCapability & {
                layerStates: Record<string, boolean>;
            };

            await callback!({
                repoId: 'metaflow.builtin',
                layerPath: '.',
                checked: false,
            });

            assert.deepStrictEqual(
                harness.workspaceStateStore.get('metaflow.builtin.state'),
                {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    layerStates: {},
                    synchronizedFiles: [],
                },
                'built-in root layer toggle should disable the built-in source and clear nested overrides',
            );
            assert.deepStrictEqual(
                harness.executedCommands.map((entry) => ({
                    command: entry.command,
                    args: entry.args,
                })),
                [
                    {
                        command: 'metaflow.refresh',
                        args: [{ skipRepoSync: true, preferStateConfig: true }],
                    },
                ],
            );
        } finally {
            harness.dispose();
        }
    });

    test('toggleLayer disables the built-in source when the event omits the root layer path', async () => {
        const harness = createCommandHandlersHarness(true);

        try {
            const callback = harness.registeredCommands.get('metaflow.toggleLayer');
            assert.ok(callback, 'metaflow.toggleLayer command should be registered');

            harness.state.builtInCapability = {
                enabled: true,
                layerEnabled: true,
                layerStates: {
                    'capabilities/metadata-authoring/github-copilot-metadata-authoring': false,
                },
                synchronizedFiles: [],
                sourceRoot: 'C:/extension/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            } as typeof harness.state.builtInCapability & {
                layerStates: Record<string, boolean>;
            };

            await callback!({
                repoId: 'metaflow.builtin',
                checked: false,
            });

            assert.deepStrictEqual(
                harness.workspaceStateStore.get('metaflow.builtin.state'),
                {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    layerStates: {},
                    synchronizedFiles: [],
                },
                'built-in fallback toggle should still disable the built-in source when layerPath is omitted',
            );
        } finally {
            harness.dispose();
        }
    });
});
