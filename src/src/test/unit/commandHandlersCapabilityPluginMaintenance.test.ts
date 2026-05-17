import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function loadCommandHandlers(): typeof import('../../commands/commandHandlers') {
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
            return {
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
            };
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
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0-preview.0');
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
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0-preview.0');
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
                            minimumMetaflowVersion: '^0.1.0-preview.0',
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
                            minimumMetaflowVersion: '^0.1.0-preview.0',
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
                            minimumMetaflowVersion: '^0.1.0-preview.0',
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
});
