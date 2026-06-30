import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function loadCommandHandlers(
    vscodeOverride?: unknown,
): typeof import('../../commands/commandHandlers') {
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
            return (
                vscodeOverride ?? {
                    window: {
                        showWarningMessage: async () => undefined,
                        showInformationMessage: async () => undefined,
                        createOutputChannel: () => ({
                            appendLine: () => {},
                            show: () => {},
                            dispose: () => {},
                        }),
                    },
                    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
                    workspace: {
                        workspaceFolders: undefined,
                        getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
                    },
                    TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
                    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
                    EventEmitter: class {
                        event(listener: unknown): { dispose: () => void } {
                            void listener;
                            return { dispose: () => {} };
                        }
                        fire(value: unknown): void {
                            void value;
                        }
                    },
                    Uri: { file: (fsPath: string) => ({ fsPath }) },
                }
            );
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../commands/commandHandlers');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as typeof import('../../commands/commandHandlers');
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('Command handler capability plugin maintenance helpers', () => {
    test('mergeCapabilityWarningMessages appends only unique non-empty warnings', () => {
        const { mergeCapabilityWarningMessages } = loadCommandHandlers();
        const warnings = ['Existing warning'];

        const changed = mergeCapabilityWarningMessages(warnings, [
            'Existing warning',
            '  ',
            'New warning',
            'New warning',
            '  Trimmed warning  ',
        ]);

        assert.strictEqual(changed, true);
        assert.deepStrictEqual(warnings, ['Existing warning', 'New warning', 'Trimmed warning']);

        const unchanged = mergeCapabilityWarningMessages(warnings, [
            'Existing warning',
            'New warning',
            'Trimmed warning',
            '',
        ]);

        assert.strictEqual(unchanged, false);
        assert.deepStrictEqual(warnings, ['Existing warning', 'New warning', 'Trimmed warning']);
    });

    test('collectCapabilityPluginMaintenanceWarningMessages formats failures and catalog warnings', () => {
        const { collectCapabilityPluginMaintenanceWarningMessages } = loadCommandHandlers();
        const repoRoot = path.join(os.tmpdir(), 'metaflow-maintenance-warning-root');
        const expectedLocation = path
            .join(repoRoot, 'capabilities/demo/.agents')
            .replace(/\\/g, '/');

        const messages = collectCapabilityPluginMaintenanceWarningMessages({
            repoRoot,
            failures: [
                {
                    layerPath: 'capabilities/demo/.agents',
                    message: 'CAPABILITY.md was not found.',
                },
            ],
            warnings: [
                {
                    code: 'CAPABILITY_AGENT_PLUGIN_MANIFEST_DUPLICATE',
                    message: 'Duplicate agent-plugin plugin name "demo".',
                    filePath: 'C:/repo/capabilities/demo/plugin.json',
                    severity: 'error',
                },
            ],
        });

        assert.deepStrictEqual(messages, [
            `MetaFlow: Failed to maintain plugin metadata for capabilities/demo/.agents. CAPABILITY.md was not found. [${expectedLocation}]`,
            '[CAPABILITY_AGENT_PLUGIN_MANIFEST_DUPLICATE] Duplicate agent-plugin plugin name "demo". [C:/repo/capabilities/demo/plugin.json]',
        ]);
    });

    test('ensureCapabilityManifestAgentPluginEnabled adds agentPlugin to existing frontmatter', () => {
        const { ensureCapabilityManifestAgentPluginEnabled } = loadCommandHandlers();
        const source = [
            '---',
            'name: Demo Capability',
            'description: Demo description',
            '---',
            '',
            '# Capability: Demo Capability',
        ].join('\n');

        const updated = ensureCapabilityManifestAgentPluginEnabled(source);

        assert.strictEqual(updated.changed, true);
        assert.ok(updated.content.includes('agentPlugin: true'));
    });

    test('ensureCapabilityManifestAgentPluginEnabled normalizes false to true without replacing body', () => {
        const { ensureCapabilityManifestAgentPluginEnabled } = loadCommandHandlers();
        const source = [
            '---',
            'name: Demo Capability',
            'agentPlugin: false',
            '---',
            '',
            '## Mission',
        ].join('\n');

        const updated = ensureCapabilityManifestAgentPluginEnabled(source);

        assert.strictEqual(updated.changed, true);
        assert.ok(updated.content.includes('agentPlugin: true'));
        assert.ok(updated.content.includes('## Mission'));
    });

    test('resolveSettingsEntryTarget forces chat.pluginLocations into user scope', () => {
        const { resolveSettingsEntryTarget } = loadCommandHandlers();

        const result = resolveSettingsEntryTarget('chat.pluginLocations', {
            requested: 'workspace',
            effective: 'workspace',
            configurationTarget: 2,
        });

        assert.deepStrictEqual(result, {
            requested: 'user',
            effective: 'user',
            configurationTarget: 1,
        });
    });

    test('resolveSettingsEntryTarget leaves non-plugin settings on the configured target', () => {
        const { resolveSettingsEntryTarget } = loadCommandHandlers();

        const result = resolveSettingsEntryTarget('chat.instructionsFilesLocations', {
            requested: 'workspaceFolder',
            effective: 'workspaceFolder',
            configurationTarget: 3,
        });

        assert.deepStrictEqual(result, {
            requested: 'workspaceFolder',
            effective: 'workspaceFolder',
            configurationTarget: 3,
        });
    });

    test('formatManagedSettingsStateSummary reports deduplicated keys across scopes', () => {
        const { formatManagedSettingsStateSummary } = loadCommandHandlers();

        const summary = formatManagedSettingsStateSummary({
            workspaceState: {
                get: () => ({
                    effectiveTarget: 'workspace',
                    managedEntries: {
                        workspace: {
                            'chat.instructionsFilesLocations': { a: true },
                        },
                        user: {
                            'chat.pluginLocations': { b: true },
                            'chat.instructionsFilesLocations': { c: true },
                        },
                    },
                }),
            },
        } as unknown as Parameters<typeof formatManagedSettingsStateSummary>[0]);

        assert.deepStrictEqual(summary, {
            target: 'workspace',
            keys: 'chat.instructionsFilesLocations, chat.pluginLocations',
        });
    });

    test('formatManagedSettingsStateSummary reports none when no managed keys exist', () => {
        const { formatManagedSettingsStateSummary } = loadCommandHandlers();

        const summary = formatManagedSettingsStateSummary({
            workspaceState: {
                get: () => ({}),
            },
        } as unknown as Parameters<typeof formatManagedSettingsStateSummary>[0]);

        assert.deepStrictEqual(summary, {
            target: 'none',
            keys: 'none',
        });
    });

    test('clearManagedWorkspaceSettings removes managed entries from workspace and user scopes', async () => {
        const workspaceValues = new Map<string, unknown>([
            [
                'chat.instructionsFilesLocations',
                { '.ai/ai-metadata/standards/sdlc/instructions': true },
            ],
        ]);
        const globalValues = new Map<string, unknown>([
            ['chat.pluginLocations', { '../repo/capabilities/plugin-smoke': true }],
        ]);
        const workspaceStateStore = new Map<string, unknown>([
            [
                'metaflow.settingsInjection.v1',
                {
                    effectiveTarget: 'workspace',
                    managedEntries: {
                        workspace: {
                            'chat.instructionsFilesLocations': {
                                '.ai/ai-metadata/standards/sdlc/instructions': true,
                            },
                        },
                        user: {
                            'chat.pluginLocations': {
                                '../repo/capabilities/plugin-smoke': true,
                            },
                        },
                    },
                },
            ],
        ]);

        const makeConfig = () => ({
            get: (_key: string, defaultValue: unknown) => defaultValue,
            inspect: (key: string) => ({
                globalValue: globalValues.get(key),
                workspaceValue: workspaceValues.get(key),
                workspaceFolderValue: undefined,
            }),
            update: async (key: string, value: unknown, target: number) => {
                if (target === 1) {
                    if (value === undefined) {
                        globalValues.delete(key);
                    } else {
                        globalValues.set(key, value);
                    }
                    return;
                }

                if (target === 2) {
                    if (value === undefined) {
                        workspaceValues.delete(key);
                    } else {
                        workspaceValues.set(key, value);
                    }
                    return;
                }

                throw new Error(`Unexpected target ${target}`);
            },
        });

        const mockVscode = {
            window: {
                showWarningMessage: async () => undefined,
                showInformationMessage: async () => undefined,
                createOutputChannel: () => ({
                    appendLine: () => {},
                    show: () => {},
                    dispose: () => {},
                }),
            },
            ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
            workspace: {
                workspaceFolders: undefined,
                getConfiguration: (_section?: string, resource?: { fsPath?: string }) => {
                    void resource;
                    return makeConfig();
                },
            },
            TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            EventEmitter: class {
                event(listener: unknown): { dispose: () => void } {
                    void listener;
                    return { dispose: () => {} };
                }
                fire(value: unknown): void {
                    void value;
                }
            },
            Uri: { file: (fsPath: string) => ({ fsPath }) },
        };

        const { clearManagedWorkspaceSettings } = loadCommandHandlers(mockVscode);

        await clearManagedWorkspaceSettings(
            {
                uri: { fsPath: 'C:/workspace/project' },
                name: 'project',
                index: 0,
            } as unknown as Parameters<typeof clearManagedWorkspaceSettings>[0],
            {
                workspaceState: {
                    get: (key: string) => workspaceStateStore.get(key),
                    update: async (key: string, value: unknown) => {
                        workspaceStateStore.set(key, value);
                    },
                },
            } as unknown as Parameters<typeof clearManagedWorkspaceSettings>[1],
        );

        assert.strictEqual(workspaceValues.get('chat.instructionsFilesLocations'), undefined);
        assert.strictEqual(globalValues.get('chat.pluginLocations'), undefined);
        assert.deepStrictEqual(workspaceStateStore.get('metaflow.settingsInjection.v1'), {});
    });

    test('injectWorkspaceSettings removes stale plugin roots from user scope when no plugin entries remain', async () => {
        const globalValues = new Map<string, unknown>([
            [
                'chat.pluginLocations',
                { '../repo/capabilities/plugin-smoke': true, '../user/other-plugin': true },
            ],
        ]);
        const workspaceStateStore = new Map<string, unknown>([
            [
                'metaflow.settingsInjection.v1',
                {
                    effectiveTarget: 'workspace',
                    managedEntries: {
                        user: {
                            'chat.pluginLocations': {
                                '../repo/capabilities/plugin-smoke': true,
                            },
                        },
                    },
                },
            ],
        ]);

        const makeConfig = () => ({
            get: (_key: string, defaultValue: unknown) => defaultValue,
            inspect: (key: string) => ({
                globalValue: globalValues.get(key),
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
            }),
            update: async (key: string, value: unknown, target: number) => {
                if (target !== 1) {
                    throw new Error(`Unexpected target ${target}`);
                }

                if (value === undefined) {
                    globalValues.delete(key);
                } else {
                    globalValues.set(key, value);
                }
            },
        });

        const mockVscode = {
            window: {
                showWarningMessage: async () => undefined,
                showInformationMessage: async () => undefined,
                createOutputChannel: () => ({
                    appendLine: () => {},
                    show: () => {},
                    dispose: () => {},
                }),
            },
            ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
            workspace: {
                workspaceFolders: undefined,
                getConfiguration: (_section?: string, resource?: { fsPath?: string }) => {
                    void resource;
                    return makeConfig();
                },
            },
            TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            EventEmitter: class {
                event(listener: unknown): { dispose: () => void } {
                    void listener;
                    return { dispose: () => {} };
                }
                fire(value: unknown): void {
                    void value;
                }
            },
            Uri: { file: (fsPath: string) => ({ fsPath }) },
        };

        const { injectWorkspaceSettings } = loadCommandHandlers(mockVscode);

        await injectWorkspaceSettings(
            {
                uri: { fsPath: 'C:/workspace/project' },
                name: 'project',
                index: 0,
            } as Parameters<typeof injectWorkspaceSettings>[0],
            {} as Parameters<typeof injectWorkspaceSettings>[1],
            [],
            {
                workspaceState: {
                    get: (key: string) => workspaceStateStore.get(key),
                    update: async (key: string, value: unknown) => {
                        workspaceStateStore.set(key, value);
                    },
                },
            } as unknown as Parameters<typeof injectWorkspaceSettings>[3],
            {
                enabled: false,
                layerEnabled: false,
                disabledByUser: true,
                synchronizedFiles: [],
                layerStates: {},
                sourceRoot: 'C:/extension/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            } as Parameters<typeof injectWorkspaceSettings>[4],
        );

        assert.deepStrictEqual(globalValues.get('chat.pluginLocations'), {
            '../user/other-plugin': true,
        });
        assert.deepStrictEqual(workspaceStateStore.get('metaflow.settingsInjection.v1'), {
            requestedTarget: 'workspace',
            effectiveTarget: 'workspace',
            managedEntries: {},
        });
    });

    test('injectWorkspaceSettings prunes stale local plugin enablement when policy returns to settings', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-policy-settings-'));
        const metadataRoot = path.join(workspaceRoot, '..', 'metadata');
        const stalePluginRoot = path.join(metadataRoot, 'capabilities', 'plugin-smoke');
        const agentPath = path.join(stalePluginRoot, '.github', 'agents', 'reviewer.agent.md');
        const otherPluginRoot = path.join(workspaceRoot, '..', 'other-plugin');
        const copilotSettingsPath = path.join(
            workspaceRoot,
            '.github',
            'copilot',
            'settings.local.json',
        );
        const stalePluginUri = `file:///${stalePluginRoot.replace(/\\/g, '/')}`;
        const otherPluginUri = `file:///${otherPluginRoot.replace(/\\/g, '/')}`;
        const workspaceValues = new Map<string, unknown>();
        const globalValues = new Map<string, unknown>();
        const workspaceStateStore = new Map<string, unknown>([
            [
                'metaflow.settingsInjection.v1',
                {
                    effectiveTarget: 'workspace',
                    managedEntries: {},
                },
            ],
        ]);

        try {
            fs.mkdirSync(path.dirname(agentPath), { recursive: true });
            fs.writeFileSync(agentPath, '# Reviewer\n', 'utf-8');
            fs.mkdirSync(path.dirname(copilotSettingsPath), { recursive: true });
            fs.writeFileSync(
                copilotSettingsPath,
                JSON.stringify(
                    {
                        enabledPlugins: {
                            [stalePluginUri]: true,
                            [otherPluginUri]: true,
                        },
                    },
                    null,
                    2,
                ) + '\n',
                'utf-8',
            );

            const makeConfig = () => ({
                get: (_key: string, defaultValue: unknown) => defaultValue,
                inspect: (key: string) => ({
                    globalValue: globalValues.get(key),
                    workspaceValue: workspaceValues.get(key),
                    workspaceFolderValue: undefined,
                }),
                update: async (key: string, value: unknown, target: number) => {
                    const targetMap = target === 1 ? globalValues : workspaceValues;
                    if (value === undefined) {
                        targetMap.delete(key);
                    } else {
                        targetMap.set(key, value);
                    }
                },
            });

            const mockVscode = {
                window: {
                    showWarningMessage: async () => undefined,
                    showInformationMessage: async () => undefined,
                    createOutputChannel: () => ({
                        appendLine: () => {},
                        show: () => {},
                        dispose: () => {},
                    }),
                },
                ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
                workspace: {
                    workspaceFolders: undefined,
                    getConfiguration: (_section?: string, resource?: { fsPath?: string }) => {
                        void resource;
                        return makeConfig();
                    },
                },
                TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
                TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
                EventEmitter: class {
                    event(listener: unknown): { dispose: () => void } {
                        void listener;
                        return { dispose: () => {} };
                    }
                    fire(value: unknown): void {
                        void value;
                    }
                },
                Uri: {
                    file: (fsPath: string) => ({
                        fsPath,
                        toString: () => `file:///${fsPath.replace(/\\/g, '/')}`,
                    }),
                },
            };

            const { injectWorkspaceSettings } = loadCommandHandlers(mockVscode);

            await injectWorkspaceSettings(
                {
                    uri: { fsPath: workspaceRoot },
                    name: 'project',
                    index: 0,
                } as Parameters<typeof injectWorkspaceSettings>[0],
                {
                    metadataRepos: [
                        {
                            id: 'primary',
                            localPath: metadataRoot,
                            enabled: true,
                        },
                    ],
                } as Parameters<typeof injectWorkspaceSettings>[1],
                [
                    {
                        relativePath: '.github/agents/reviewer.agent.md',
                        sourcePath: agentPath,
                        sourceLayer: 'primary/capabilities/plugin-smoke',
                        classification: 'settings',
                    },
                ] as Parameters<typeof injectWorkspaceSettings>[2],
                {
                    workspaceState: {
                        get: (key: string) => workspaceStateStore.get(key),
                        update: async (key: string, value: unknown) => {
                            workspaceStateStore.set(key, value);
                        },
                    },
                } as unknown as Parameters<typeof injectWorkspaceSettings>[3],
                {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    synchronizedFiles: [],
                    layerStates: {},
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                } as Parameters<typeof injectWorkspaceSettings>[4],
            );

            assert.deepStrictEqual(workspaceValues.get('chat.agentFilesLocations'), {
                '../metadata/capabilities/plugin-smoke/.github/agents': true,
            });

            const updatedSettings = JSON.parse(
                fs.readFileSync(copilotSettingsPath, 'utf-8'),
            ) as {
                enabledPlugins?: Record<string, boolean>;
            };
            assert.deepStrictEqual(updatedSettings.enabledPlugins, {
                [otherPluginUri]: true,
            });
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
            fs.rmSync(metadataRoot, { recursive: true, force: true });
            fs.rmSync(otherPluginRoot, { recursive: true, force: true });
        }
    });

    test('injectWorkspaceSettings deletes empty local plugin settings after stale cleanup', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-policy-empty-'));
        const metadataRoot = path.join(workspaceRoot, '..', 'metadata-empty');
        const stalePluginRoot = path.join(metadataRoot, 'capabilities', 'plugin-smoke');
        const agentPath = path.join(stalePluginRoot, '.github', 'agents', 'reviewer.agent.md');
        const copilotSettingsPath = path.join(
            workspaceRoot,
            '.github',
            'copilot',
            'settings.local.json',
        );
        const stalePluginUri = `file:///${stalePluginRoot.replace(/\\/g, '/')}`;
        const workspaceValues = new Map<string, unknown>();
        const workspaceStateStore = new Map<string, unknown>([
            [
                'metaflow.settingsInjection.v1',
                {
                    effectiveTarget: 'workspace',
                    managedEntries: {},
                },
            ],
        ]);

        try {
            fs.mkdirSync(path.dirname(agentPath), { recursive: true });
            fs.writeFileSync(agentPath, '# Reviewer\n', 'utf-8');
            fs.mkdirSync(path.dirname(copilotSettingsPath), { recursive: true });
            fs.writeFileSync(
                copilotSettingsPath,
                JSON.stringify({ enabledPlugins: { [stalePluginUri]: true } }, null, 2) + '\n',
                'utf-8',
            );

            const makeConfig = () => ({
                get: (_key: string, defaultValue: unknown) => defaultValue,
                inspect: (key: string) => ({
                    globalValue: undefined,
                    workspaceValue: workspaceValues.get(key),
                    workspaceFolderValue: undefined,
                }),
                update: async (key: string, value: unknown, target: number) => {
                    if (target !== 2) {
                        return;
                    }
                    if (value === undefined) {
                        workspaceValues.delete(key);
                    } else {
                        workspaceValues.set(key, value);
                    }
                },
            });

            const mockVscode = {
                window: {
                    showWarningMessage: async () => undefined,
                    showInformationMessage: async () => undefined,
                    createOutputChannel: () => ({
                        appendLine: () => {},
                        show: () => {},
                        dispose: () => {},
                    }),
                },
                ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
                workspace: {
                    workspaceFolders: undefined,
                    getConfiguration: (_section?: string, resource?: { fsPath?: string }) => {
                        void resource;
                        return makeConfig();
                    },
                },
                TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
                TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
                EventEmitter: class {
                    event(listener: unknown): { dispose: () => void } {
                        void listener;
                        return { dispose: () => {} };
                    }
                    fire(value: unknown): void {
                        void value;
                    }
                },
                Uri: {
                    file: (fsPath: string) => ({
                        fsPath,
                        toString: () => `file:///${fsPath.replace(/\\/g, '/')}`,
                    }),
                },
            };

            const { injectWorkspaceSettings } = loadCommandHandlers(mockVscode);

            await injectWorkspaceSettings(
                {
                    uri: { fsPath: workspaceRoot },
                    name: 'project',
                    index: 0,
                } as Parameters<typeof injectWorkspaceSettings>[0],
                {
                    metadataRepos: [
                        {
                            id: 'primary',
                            localPath: metadataRoot,
                            enabled: true,
                        },
                    ],
                } as Parameters<typeof injectWorkspaceSettings>[1],
                [
                    {
                        relativePath: '.github/agents/reviewer.agent.md',
                        sourcePath: agentPath,
                        sourceLayer: 'primary/capabilities/plugin-smoke',
                        classification: 'settings',
                    },
                ] as Parameters<typeof injectWorkspaceSettings>[2],
                {
                    workspaceState: {
                        get: (key: string) => workspaceStateStore.get(key),
                        update: async (key: string, value: unknown) => {
                            workspaceStateStore.set(key, value);
                        },
                    },
                } as unknown as Parameters<typeof injectWorkspaceSettings>[3],
                {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    synchronizedFiles: [],
                    layerStates: {},
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                } as Parameters<typeof injectWorkspaceSettings>[4],
            );

            assert.deepStrictEqual(workspaceValues.get('chat.agentFilesLocations'), {
                '../metadata-empty/capabilities/plugin-smoke/.github/agents': true,
            });
            assert.strictEqual(fs.existsSync(copilotSettingsPath), false);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
            fs.rmSync(metadataRoot, { recursive: true, force: true });
        }
    });

    test('ensureLocalGitExcludeEntry records machine-local Copilot plugin settings in git info exclude', async () => {
        const { ensureLocalGitExcludeEntry } = loadCommandHandlers();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-local-exclude-'));
        try {
            fs.mkdirSync(path.join(repoRoot, '.git', 'info'), { recursive: true });

            await ensureLocalGitExcludeEntry(repoRoot, '.github/copilot/settings.local.json');
            await ensureLocalGitExcludeEntry(repoRoot, '.github/copilot/settings.local.json');

            const entries = fs
                .readFileSync(path.join(repoRoot, '.git', 'info', 'exclude'), 'utf-8')
                .split(/\r?\n/)
                .filter(Boolean);
            assert.deepStrictEqual(entries, ['.github/copilot/settings.local.json']);
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    test('buildMaintainedCapabilityPluginManifestJson creates a valid plugin scaffold when absent', () => {
        const { buildMaintainedCapabilityPluginManifestJson } = loadCommandHandlers();
        const result = buildMaintainedCapabilityPluginManifestJson({
            capabilityName: 'Demo Capability',
            capabilityDescription: 'Demo package description.',
            capabilityDirectoryName: 'demo-capability',
        });

        const parsed = JSON.parse(result.content) as {
            name?: string;
            version?: string;
            keywords?: string[];
            agents?: string;
            skills?: string;
            rules?: string;
            metaflow?: { pluginHosts?: string[]; minimumMetaflowVersion?: string };
        };

        assert.strictEqual(parsed.name, 'demo-capability');
        assert.strictEqual(parsed.version, '0.1.0');
        assert.deepStrictEqual(parsed.keywords, ['metaflow', 'agent-plugin', 'capability']);
        assert.strictEqual(parsed.agents, '.github/agents');
        assert.strictEqual(parsed.skills, '.github/skills');
        assert.deepStrictEqual(parsed.metaflow?.pluginHosts, ['github-copilot']);
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0');
        assert.strictEqual(result.changed, true);
    });

    test('buildMaintainedCapabilityPluginManifestJson preserves unrelated fields while repairing managed metadata', () => {
        const { buildMaintainedCapabilityPluginManifestJson } = loadCommandHandlers();
        const result = buildMaintainedCapabilityPluginManifestJson({
            capabilityName: 'Demo Capability',
            capabilityDescription: 'Demo package description.',
            capabilityDirectoryName: 'demo-capability',
            existingRawText: JSON.stringify(
                {
                    name: 'custom-demo-capability',
                    version: '2.3.4',
                    keywords: ['existing'],
                    agents: 'agents',
                    metaflow: { pluginHosts: ['github-copilot', 'claude-code'] },
                },
                null,
                2,
            ),
        });

        const parsed = JSON.parse(result.content) as {
            name?: string;
            version?: string;
            keywords?: string[];
            agents?: string;
            skills?: string;
            rules?: string;
            metaflow?: { pluginHosts?: string[]; minimumMetaflowVersion?: string };
        };

        assert.strictEqual(parsed.name, 'custom-demo-capability');
        assert.strictEqual(parsed.version, '2.3.4');
        assert.deepStrictEqual(parsed.keywords, [
            'existing',
            'metaflow',
            'agent-plugin',
            'capability',
        ]);
        assert.strictEqual(parsed.agents, 'agents');
        assert.strictEqual(parsed.skills, '.github/skills');
        assert.strictEqual(parsed.rules, '.github/instructions');
        assert.deepStrictEqual(parsed.metaflow?.pluginHosts, ['github-copilot', 'claude-code']);
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0');
    });

    test('maintainCapabilityPluginMetadataInDirectory creates missing plugin data for one capability directory', async () => {
        const { maintainCapabilityPluginMetadataInDirectory } = loadCommandHandlers();
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-maintain-'));
        try {
            fs.writeFileSync(
                path.join(tempRoot, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Demo Capability',
                    'description: Demo description',
                    '---',
                    '',
                    '# Capability: Demo Capability',
                ].join('\n'),
                'utf-8',
            );

            const result = await maintainCapabilityPluginMetadataInDirectory(tempRoot);
            assert.strictEqual(result.manifestChanged, true);
            assert.strictEqual(result.pluginJsonChanged, true);

            const manifestText = fs.readFileSync(path.join(tempRoot, 'CAPABILITY.md'), 'utf-8');
            assert.ok(manifestText.includes('agentPlugin: true'));

            const pluginJson = JSON.parse(
                fs.readFileSync(path.join(tempRoot, 'plugin.json'), 'utf-8'),
            ) as {
                name?: string;
                agents?: string;
                rules?: string;
                metaflow?: { pluginHosts?: string[] };
            };
            assert.ok(pluginJson.name?.startsWith('metaflow-plugin-maintain-'));
            assert.strictEqual(pluginJson.agents, '.github/agents');
            assert.strictEqual(pluginJson.rules, '.github/instructions');
            assert.deepStrictEqual(pluginJson.metaflow?.pluginHosts, ['github-copilot']);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('maintainCapabilityPluginMetadataInDirectory is idempotent when managed fields already exist', async () => {
        const { maintainCapabilityPluginMetadataInDirectory } = loadCommandHandlers();
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-maintain-'));
        try {
            fs.writeFileSync(
                path.join(tempRoot, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Demo Capability',
                    'description: Demo description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tempRoot, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'custom-demo-capability',
                        version: '1.2.3',
                        description: 'Demo capability plugin',
                        keywords: ['metaflow', 'agent-plugin', 'capability'],
                        agents: '.github/agents',
                        skills: '.github/skills',
                        rules: '.github/instructions',
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.1.0',
                        },
                    },
                    null,
                    2,
                ) + '\n',
                'utf-8',
            );

            const result = await maintainCapabilityPluginMetadataInDirectory(tempRoot);
            assert.strictEqual(result.manifestChanged, false);
            assert.strictEqual(result.pluginJsonChanged, false);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('maintainCapabilityPluginMarketplaceInRepo writes .github/plugin/marketplace.json from capability manifests', async () => {
        const { maintainCapabilityPluginMarketplaceInRepo } = loadCommandHandlers();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-marketplace-'));
        try {
            const firstCapability = path.join(repoRoot, 'capabilities', 'first');
            const secondCapability = path.join(repoRoot, 'capabilities', 'second');
            fs.mkdirSync(firstCapability, { recursive: true });
            fs.mkdirSync(secondCapability, { recursive: true });

            fs.writeFileSync(
                path.join(firstCapability, 'CAPABILITY.md'),
                [
                    '---',
                    'name: First Capability',
                    'description: First description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(secondCapability, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Second Capability',
                    'description: Second description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(firstCapability, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'example-first',
                        version: '1.2.3',
                        description: 'First plugin description',
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.1.0',
                        },
                    },
                    null,
                    2,
                ) + '\n',
                'utf-8',
            );
            fs.writeFileSync(
                path.join(secondCapability, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'example-second',
                        version: '2.3.4',
                        description: 'Second plugin description',
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.1.0',
                        },
                    },
                    null,
                    2,
                ) + '\n',
                'utf-8',
            );

            const firstRun = await maintainCapabilityPluginMarketplaceInRepo(repoRoot, {
                repoId: 'example-repo',
            });

            assert.strictEqual(firstRun.changed, true);
            assert.strictEqual(firstRun.pluginCount, 2);
            assert.deepStrictEqual(firstRun.warnings, []);

            const marketplace = JSON.parse(fs.readFileSync(firstRun.marketplacePath, 'utf-8')) as {
                name?: string;
                owner?: { name?: string };
                plugins?: Array<{ name?: string; source?: string; version?: string }>;
            };

            assert.strictEqual(marketplace.name, 'example-repo');
            assert.strictEqual(marketplace.owner?.name, path.basename(repoRoot));
            assert.deepStrictEqual(marketplace.plugins, [
                {
                    name: 'example-first',
                    source: './capabilities/first',
                    description: 'First description',
                    version: '1.2.3',
                },
                {
                    name: 'example-second',
                    source: './capabilities/second',
                    description: 'Second description',
                    version: '2.3.4',
                },
            ]);

            const secondRun = await maintainCapabilityPluginMarketplaceInRepo(repoRoot, {
                repoId: 'example-repo',
            });
            assert.strictEqual(secondRun.changed, false);
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    test('maintainAllCapabilityPluginMetadataInRepo updates dirty capabilities and marketplace together', async () => {
        const { maintainAllCapabilityPluginMetadataInRepo } = loadCommandHandlers();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-maintain-all-'));
        try {
            const firstCapability = path.join(repoRoot, 'capabilities', 'first');
            const secondCapability = path.join(repoRoot, 'capabilities', 'second');
            fs.mkdirSync(firstCapability, { recursive: true });
            fs.mkdirSync(secondCapability, { recursive: true });

            fs.writeFileSync(
                path.join(firstCapability, 'CAPABILITY.md'),
                ['---', 'name: First Capability', 'description: First description', '---'].join(
                    '\n',
                ),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(secondCapability, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Second Capability',
                    'description: Second description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(secondCapability, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'second-capability',
                        version: '1.0.0',
                        description: 'Second plugin description',
                        metaflow: { pluginHosts: ['github-copilot'] },
                    },
                    null,
                    2,
                ) + '\n',
                'utf-8',
            );

            const result = await maintainAllCapabilityPluginMetadataInRepo(repoRoot, {
                repoId: 'example-repo',
                capabilityDirectoryPaths: [firstCapability],
            });

            assert.strictEqual(result.scannedCount, 1);
            assert.strictEqual(result.changedCount, 1);
            assert.strictEqual(result.unchangedCount, 0);
            assert.strictEqual(result.failureCount, 0);
            assert.strictEqual(result.marketplaceChanged, true);
            assert.strictEqual(result.marketplacePluginCount, 2);
            assert.ok(
                fs
                    .readFileSync(path.join(firstCapability, 'CAPABILITY.md'), 'utf-8')
                    .includes('agentPlugin: true'),
            );
            assert.ok(fs.existsSync(path.join(firstCapability, 'plugin.json')));

            const marketplace = JSON.parse(fs.readFileSync(result.marketplacePath, 'utf-8')) as {
                plugins?: Array<{ name?: string }>;
            };
            assert.deepStrictEqual(
                marketplace.plugins?.map((plugin) => plugin.name),
                ['first', 'second-capability'],
            );
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    test('maintainAllCapabilityPluginMetadataInRepo excludes marketplace plugins from excluded paths', async () => {
        const { maintainAllCapabilityPluginMetadataInRepo } = loadCommandHandlers();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-excludes-'));
        try {
            const publicCapability = path.join(repoRoot, 'capabilities', 'public');
            const privateCapability = path.join(repoRoot, 'capabilities', 'private');
            fs.mkdirSync(publicCapability, { recursive: true });
            fs.mkdirSync(privateCapability, { recursive: true });

            for (const [capabilityRoot, name] of [
                [publicCapability, 'Public Capability'],
                [privateCapability, 'Private Capability'],
            ] as const) {
                fs.writeFileSync(
                    path.join(capabilityRoot, 'CAPABILITY.md'),
                    [
                        '---',
                        `name: ${name}`,
                        'description: Test capability',
                        'agentPlugin: true',
                        '---',
                    ].join('\n'),
                    'utf-8',
                );
                fs.writeFileSync(
                    path.join(capabilityRoot, 'plugin.json'),
                    JSON.stringify(
                        {
                            name: name.toLowerCase().replace(/\s+/g, '-'),
                            version: '1.0.0',
                            description: 'Test plugin',
                            metaflow: { pluginHosts: ['github-copilot'] },
                        },
                        null,
                        2,
                    ) + '\n',
                    'utf-8',
                );
            }

            const result = await maintainAllCapabilityPluginMetadataInRepo(repoRoot, {
                repoId: 'example-repo',
                excludePatterns: ['capabilities/private'],
            });

            assert.strictEqual(result.marketplacePluginCount, 1);
            const marketplace = JSON.parse(fs.readFileSync(result.marketplacePath, 'utf-8')) as {
                plugins?: Array<{ name?: string }>;
            };
            assert.deepStrictEqual(
                marketplace.plugins?.map((plugin) => plugin.name),
                ['public-capability'],
            );
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    test('maintainAllCapabilityPluginMetadataInRepo ignores grouping folders and repo-root metadata without CAPABILITY.md', async () => {
        const { maintainAllCapabilityPluginMetadataInRepo } = loadCommandHandlers();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-grouping-'));
        try {
            fs.mkdirSync(path.join(repoRoot, '.github', 'instructions'), { recursive: true });
            fs.writeFileSync(
                path.join(repoRoot, '.github', 'instructions', 'root.instructions.md'),
                'root instructions\n',
                'utf-8',
            );

            const groupingDir = path.join(repoRoot, 'capabilities', 'group');
            const firstCapability = path.join(groupingDir, 'first');
            const secondCapability = path.join(groupingDir, 'second');
            fs.mkdirSync(firstCapability, { recursive: true });
            fs.mkdirSync(secondCapability, { recursive: true });

            for (const [capabilityRoot, name] of [
                [firstCapability, 'First Capability'],
                [secondCapability, 'Second Capability'],
            ] as const) {
                fs.writeFileSync(
                    path.join(capabilityRoot, 'CAPABILITY.md'),
                    [
                        '---',
                        `name: ${name}`,
                        'description: Test capability',
                        'agentPlugin: true',
                        '---',
                    ].join('\n'),
                    'utf-8',
                );
            }

            const result = await maintainAllCapabilityPluginMetadataInRepo(repoRoot, {
                repoId: 'example-repo',
            });

            assert.strictEqual(result.scannedCount, 2);
            assert.strictEqual(result.failureCount, 0);
            assert.deepStrictEqual(result.changedCapabilities, [
                'capabilities/group/first',
                'capabilities/group/second',
            ]);

            const marketplace = JSON.parse(fs.readFileSync(result.marketplacePath, 'utf-8')) as {
                plugins?: Array<{ source?: string }>;
            };
            assert.deepStrictEqual(
                marketplace.plugins?.map((plugin) => plugin.source),
                ['./capabilities/group/first', './capabilities/group/second'],
            );
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });
});
