import * as assert from 'assert';

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
                    createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
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

    test('buildMaintainedCapabilityPluginPackageJson creates a valid package scaffold when absent', () => {
        const { buildMaintainedCapabilityPluginPackageJson } = loadCommandHandlers();
        const result = buildMaintainedCapabilityPluginPackageJson({
            capabilityName: 'Demo Capability',
            capabilityDescription: 'Demo package description.',
            capabilityDirectoryName: 'demo-capability',
        });

        const parsed = JSON.parse(result.content) as {
            name?: string;
            version?: string;
            keywords?: string[];
            metaflow?: { pluginHosts?: string[]; minimumMetaflowVersion?: string };
        };

        assert.strictEqual(parsed.name, '@metaflow-capability/demo-capability');
        assert.strictEqual(parsed.version, '0.1.0');
        assert.deepStrictEqual(parsed.keywords, ['metaflow', 'agent-plugin', 'capability']);
        assert.deepStrictEqual(parsed.metaflow?.pluginHosts, ['github-copilot']);
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0-preview.0');
        assert.strictEqual(result.changed, true);
    });

    test('buildMaintainedCapabilityPluginPackageJson preserves unrelated fields while repairing managed metadata', () => {
        const { buildMaintainedCapabilityPluginPackageJson } = loadCommandHandlers();
        const result = buildMaintainedCapabilityPluginPackageJson({
            capabilityName: 'Demo Capability',
            capabilityDescription: 'Demo package description.',
            capabilityDirectoryName: 'demo-capability',
            existingRawText: JSON.stringify(
                {
                    name: '@custom/demo-capability',
                    version: '2.3.4',
                    scripts: { test: 'npm test' },
                    keywords: ['existing'],
                    metaflow: { pluginHosts: ['github-copilot', 'claude-code'] },
                },
                null,
                2,
            ),
        });

        const parsed = JSON.parse(result.content) as {
            name?: string;
            version?: string;
            scripts?: { test?: string };
            keywords?: string[];
            metaflow?: { pluginHosts?: string[]; minimumMetaflowVersion?: string };
        };

        assert.strictEqual(parsed.name, '@custom/demo-capability');
        assert.strictEqual(parsed.version, '2.3.4');
        assert.strictEqual(parsed.scripts?.test, 'npm test');
        assert.deepStrictEqual(parsed.keywords, ['existing', 'metaflow', 'agent-plugin', 'capability']);
        assert.deepStrictEqual(parsed.metaflow?.pluginHosts, ['github-copilot', 'claude-code']);
        assert.strictEqual(parsed.metaflow?.minimumMetaflowVersion, '^0.1.0-preview.0');
    });
});