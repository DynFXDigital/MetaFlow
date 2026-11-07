import * as assert from 'assert';
import * as path from 'path';
import {
    buildEffectiveFileMap,
    discoverLayersInRepo,
    inspectAgentPluginPackage,
    normalizeConfigShape,
    resolveLayers,
    toAuthoredConfig,
} from '@metaflow/engine';
import { buildTreeSummaryCache, summarizeLayerContents } from '../../treeSummary';
import {
    projectConfigForProfile,
    repairAgentPluginExtensionLayers,
    restoreCapabilityCatalog,
} from '../../commands/commandHelpers';

class MockTreeItem {
    contextValue?: string;
    checkboxState?: number;

    constructor(
        public label: unknown,
        public collapsibleState: number,
    ) {}
}

class MockEventEmitter {
    event(): { dispose: () => void } {
        return { dispose: () => {} };
    }

    fire(): void {}
}

class MockThemeIcon {
    constructor(public id: string) {}
}

class MockMarkdownString {
    constructor(public value: string) {}
}

interface TreeItem extends MockTreeItem {
    layerPath?: string;
    artifactType?: string;
}

function loadProvider(): new (
    state: unknown,
    modeResolver: () => string,
) => { getChildren(element?: TreeItem): TreeItem[] } {
    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;
    moduleInternals._load = function (request, parent, isMain): unknown {
        if (request === 'vscode') {
            return {
                TreeItem: MockTreeItem,
                TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
                TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
                EventEmitter: MockEventEmitter,
                ThemeIcon: MockThemeIcon,
                MarkdownString: MockMarkdownString,
                Uri: { file: (filePath: string) => ({ fsPath: filePath }) },
                workspace: {
                    getConfiguration: () => ({ get: (_key: string, value: unknown) => value }),
                },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require('../../views/layersTreeView').LayersTreeViewProvider;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('Agent Plugins v1 Copilot full fixture', () => {
    const repoRoot = path.resolve(__dirname, '../../../src/test/fixtures/agent-plugins-v1');
    const layerPath = 'capabilities/full-copilot';
    const pluginRoot = path.join(repoRoot, ...layerPath.split('/'));
    const builtIn = {
        enabled: false,
        layerEnabled: true,
        synchronizedFiles: [] as string[],
        sourceId: 'fixture',
        sourceDisplayName: 'Fixture',
    };

    test('validates the portable package and discovers a single layer', () => {
        const inspection = inspectAgentPluginPackage(pluginRoot);
        assert.strictEqual(inspection.profile, 'agent-plugins-v1');
        assert.strictEqual(inspection.validManifest, true);
        assert.deepStrictEqual(inspection.diagnostics, []);
        assert.deepStrictEqual(
            inspection.skills.map((skill) => skill.name),
            ['fixture-skill'],
        );
        assert.deepStrictEqual(
            inspection.mcpServers.map((server) => server.name),
            ['fixture'],
        );
        assert.deepStrictEqual(discoverLayersInRepo(repoRoot), [layerPath]);
    });

    test('shows available v1 client-extension artifacts while the package is disabled', async () => {
        const config = {
            metadataRepos: [{ id: 'fixture', localPath: repoRoot }],
            layerSources: [{ repoId: 'fixture', path: layerPath, enabled: false }],
        };
        const cache = await buildTreeSummaryCache(config, repoRoot, [], [], builtIn);
        const Provider = loadProvider();
        const provider = new Provider(
            {
                config,
                effectiveFiles: [],
                treeSummaryCache: cache,
                builtInCapability: builtIn,
                onDidChange: { event: () => ({ dispose: () => {} }) },
            },
            () => 'tree',
        );
        const repo = provider.getChildren()[0];
        const folder = provider.getChildren(repo)[0];
        const layer = provider.getChildren(folder)[0];
        assert.deepStrictEqual(
            provider.getChildren(layer).map((item) => item.artifactType),
            ['instructions', 'prompts', 'commands', 'agents', 'skills', 'hooks'],
        );
        const summary = summarizeLayerContents(cache, 'fixture', layerPath);
        assert.strictEqual(summary.byType.instructions.available, 2);
        assert.strictEqual(summary.byType.prompts.available, 1);
        assert.strictEqual(summary.byType.commands.available, 1);
        assert.strictEqual(summary.byType.agents.available, 1);
        assert.strictEqual(summary.byType.skills.available, 1);
        assert.strictEqual(summary.byType.hooks.available, 2);
    });

    test('does not render a previously persisted extension layer as a subtree', async () => {
        const config = normalizeConfigShape({
            metadataRepos: [{ id: 'fixture', localPath: repoRoot }],
            profiles: {
                default: {
                    enabledCapabilities: [`fixture:${layerPath}`],
                },
            },
            activeProfile: 'default',
        }).config;
        restoreCapabilityCatalog(config, repoRoot, [
            { repoId: 'fixture', path: layerPath },
            { repoId: 'fixture', path: `${layerPath}/com.github.copilot` },
        ]);
        const projectedConfig = projectConfigForProfile(config);
        assert.strictEqual(
            projectedConfig.layerSources?.find((source) =>
                source.path.endsWith('/com.github.copilot'),
            )?.enabled,
            false,
        );
        const repair = repairAgentPluginExtensionLayers(config, repoRoot);
        assert.deepStrictEqual(repair.repaired, [`fixture:${layerPath}/com.github.copilot`]);
        assert.strictEqual(repair.configChanged, false);
        const repairedConfig = projectConfigForProfile(config);
        const files = Array.from(
            buildEffectiveFileMap(resolveLayers(repairedConfig, repoRoot)).values(),
        );
        const cache = await buildTreeSummaryCache(config, repoRoot, files, files, builtIn);
        const Provider = loadProvider();
        const provider = new Provider(
            {
                config,
                effectiveFiles: files,
                treeSummaryCache: cache,
                builtInCapability: builtIn,
                onDidChange: { event: () => ({ dispose: () => {} }) },
            },
            () => 'tree',
        );
        const repo = provider.getChildren()[0];
        const folder = provider.getChildren(repo)[0];
        const layer = provider.getChildren(folder)[0];
        const children = provider.getChildren(layer);
        assert.strictEqual(layer.checkboxState, 1, 'parent capability is enabled');
        const extensionLayer = children.find((item) => String(item.label) === 'com.github.copilot');
        assert.ok(
            !extensionLayer,
            'previously discovered extension directory must not remain a separate capability',
        );
    });

    test('moves selected extension references to the owning package in every profile', () => {
        const extension = `fixture:${layerPath}/com.github.copilot`;
        const owner = `fixture:${layerPath}`;
        const config = normalizeConfigShape({
            metadataRepos: [{ id: 'fixture', localPath: repoRoot }],
            profiles: {
                default: { enabledCapabilities: [extension] },
                both: { enabledCapabilities: [owner, extension, `${extension}/nested`] },
                disabled: { enabledCapabilities: [] },
            },
            activeProfile: 'default',
        }).config;
        const result = repairAgentPluginExtensionLayers(config, repoRoot);
        assert.strictEqual(result.configChanged, true);
        assert.deepStrictEqual(config.profiles?.default.enabledCapabilities, [owner]);
        assert.deepStrictEqual(config.profiles?.both.enabledCapabilities, [owner]);
        assert.deepStrictEqual(config.profiles?.disabled.enabledCapabilities, []);
        assert.strictEqual(projectConfigForProfile(config).layerSources?.[0].enabled, true);
        const reloaded = normalizeConfigShape(toAuthoredConfig(config)).config;
        assert.deepStrictEqual(reloaded.profiles?.default.enabledCapabilities, [owner]);
        assert.strictEqual(projectConfigForProfile(reloaded).layerSources?.[0].enabled, true);
        assert.deepStrictEqual(repairAgentPluginExtensionLayers(config, repoRoot).repaired, []);
    });

    test('retains extension layers with capability-specific overrides for manual review', () => {
        const extension = `fixture:${layerPath}/com.github.copilot`;
        const config = normalizeConfigShape({
            metadataRepos: [{ id: 'fixture', localPath: repoRoot }],
            profiles: { default: { enabledCapabilities: [extension] } },
            activeProfile: 'default',
            capabilityOverrides: { [extension]: { injection: { agents: 'settings' } } },
        }).config;
        const result = repairAgentPluginExtensionLayers(config, repoRoot);
        assert.deepStrictEqual(result.blocked, [extension]);
        assert.deepStrictEqual(config.profiles?.default.enabledCapabilities, [extension]);
    });
});
