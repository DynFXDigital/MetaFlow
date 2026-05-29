import * as assert from 'assert';
import {
    buildAgentPluginCatalog,
    buildCapabilityPluginMarketplaceManifest,
    LayerContent,
} from '../src/index';

function makeLayer(
    layerId: string,
    repoId: string,
    pluginName: string,
    warnings: Array<{
        code: string;
        message: string;
        severity?: 'error' | 'warning' | 'info';
    }> = [],
): LayerContent {
    return {
        layerId,
        repoId,
        files: [],
        capability: {
            id: layerId.split('/').slice(-1)[0],
            manifestPath: `/workspace/${layerId}/CAPABILITY.md`,
            name: `Capability ${layerId}`,
            description: `Description for ${layerId}`,
            agentPlugin: true,
            agentPluginManifest: {
                pluginJsonPath: `/workspace/${layerId}/plugin.json`,
                name: pluginName,
                version: '1.0.0',
                description: `Plugin for ${layerId}`,
                keywords: ['metaflow'],
                pluginHosts: ['github-copilot'],
                minimumMetaflowVersion: '^0.1.0',
            },
            warnings,
        },
    };
}

describe('pluginCatalog', () => {
    it('returns normalized entries for unique valid agent-plugin capabilities', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/review/first', 'repo', 'example-first'),
            makeLayer('repo/review/second', 'repo', 'example-second'),
        ]);

        assert.deepStrictEqual(
            result.entries.map((entry) => entry.pluginName),
            ['example-first', 'example-second'],
        );
        assert.deepStrictEqual(result.warnings, []);
    });

    it('omits invalid agent-plugin capabilities that already have error-severity manifest warnings', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/review/invalid', 'repo', 'example-invalid', [
                {
                    code: 'CAPABILITY_AGENT_PLUGIN_MANIFEST_VERSION_INVALID',
                    message: 'Version is invalid.',
                    severity: 'error',
                },
            ]),
        ]);

        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.warnings, []);
    });

    it('emits duplicate package-name warnings and omits conflicting entries from the catalog', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/review/first', 'repo', 'example-shared'),
            makeLayer('repo/review/second', 'repo', 'example-shared'),
        ]);

        assert.deepStrictEqual(result.entries, []);
        assert.strictEqual(result.warnings.length, 2);
        assert.ok(
            result.warnings.every(
                (warning) =>
                    warning.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_DUPLICATE' &&
                    warning.severity === 'error',
            ),
        );
    });

    it('builds a host-compatible marketplace manifest from catalog entries', () => {
        const catalog = buildAgentPluginCatalog([
            makeLayer('repo/review/first', 'repo', 'example-first'),
            makeLayer('repo/review/second', 'repo', 'example-second'),
        ]);

        const result = buildCapabilityPluginMarketplaceManifest(catalog.entries, {
            repoRoot: '/workspace/repo',
            marketplaceName: 'Example Repo',
            ownerName: 'Example Org',
            description: 'Generated from capability plugin metadata.',
        });

        assert.deepStrictEqual(result.warnings, []);
        assert.strictEqual(result.manifest.name, 'example-repo');
        assert.strictEqual(result.manifest.owner.name, 'Example Org');
        assert.deepStrictEqual(result.manifest.plugins, [
            {
                name: 'example-first',
                source: './review/first',
                description: 'Description for repo/review/first',
                version: '1.0.0',
            },
            {
                name: 'example-second',
                source: './review/second',
                description: 'Description for repo/review/second',
                version: '1.0.0',
            },
        ]);
        assert.strictEqual(
            result.manifest.metadata?.description,
            'Generated from capability plugin metadata.',
        );
    });

    it('omits marketplace entries whose generated host plugin names collide', () => {
        const result = buildCapabilityPluginMarketplaceManifest(
            [
                {
                    pluginName: 'example-shared',
                    version: '1.0.0',
                    displayName: 'Shared Example',
                    capabilityId: 'shared-example',
                    layerId: 'repo/shared/example',
                    repoId: 'repo',
                    manifestPath: '/workspace/repo/shared/example/CAPABILITY.md',
                    pluginJsonPath: '/workspace/repo/shared/example/plugin.json',
                    pluginHosts: ['github-copilot'],
                },
                {
                    pluginName: 'example-shared',
                    version: '1.0.0',
                    displayName: 'Shared Example Duplicate',
                    capabilityId: 'shared-example-duplicate',
                    layerId: 'repo/shared/duplicate',
                    repoId: 'repo',
                    manifestPath: '/workspace/repo/shared/duplicate/CAPABILITY.md',
                    pluginJsonPath: '/workspace/repo/shared/duplicate/plugin.json',
                    pluginHosts: ['github-copilot'],
                },
            ],
            {
                repoRoot: '/workspace/repo',
                marketplaceName: 'Example Repo',
            },
        );

        assert.deepStrictEqual(result.manifest.plugins, []);
        assert.strictEqual(result.warnings.length, 2);
        assert.ok(
            result.warnings.every(
                (warning) =>
                    warning.code === 'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_PLUGIN_DUPLICATE' &&
                    warning.severity === 'error',
            ),
        );
    });

    it('skips layers that do not opt in or lack a plugin name/version', () => {
        const noCapability: LayerContent = { layerId: 'a', repoId: 'repo', files: [] };
        const notPlugin = makeLayer('repo/x/notplugin', 'repo', 'np');
        notPlugin.capability!.agentPlugin = false;
        const noManifestName = makeLayer('repo/x/noname', 'repo', '');
        noManifestName.capability!.agentPluginManifest!.name = '';

        const result = buildAgentPluginCatalog([noCapability, notPlugin, noManifestName]);
        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.warnings, []);
    });

    it('warns when a catalog entry lives outside the repository root', () => {
        const result = buildCapabilityPluginMarketplaceManifest(
            [
                {
                    pluginName: 'outside-plugin',
                    version: '1.0.0',
                    displayName: 'Outside Plugin',
                    capabilityId: 'outside',
                    layerId: 'other/outside',
                    repoId: 'other',
                    manifestPath: '/elsewhere/outside/CAPABILITY.md',
                    pluginJsonPath: '/elsewhere/outside/plugin.json',
                    pluginHosts: ['github-copilot'],
                },
            ],
            { repoRoot: '/workspace/repo', marketplaceName: 'Example Repo' },
        );

        assert.deepStrictEqual(result.manifest.plugins, []);
        assert.strictEqual(result.warnings.length, 1);
        assert.strictEqual(
            result.warnings[0].code,
            'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_MANIFEST_OUTSIDE_REPO',
        );
    });

    it('emits "./" source for a plugin manifest at the repository root', () => {
        const result = buildCapabilityPluginMarketplaceManifest(
            [
                {
                    pluginName: 'root-plugin',
                    version: '1.0.0',
                    displayName: 'Root Plugin',
                    capabilityId: 'root',
                    layerId: 'repo/root',
                    repoId: 'repo',
                    manifestPath: '/workspace/repo/CAPABILITY.md',
                    pluginJsonPath: '/workspace/repo/plugin.json',
                    pluginHosts: ['github-copilot'],
                },
            ],
            { repoRoot: '/workspace/repo', marketplaceName: 'Example Repo' },
        );

        assert.deepStrictEqual(result.warnings, []);
        assert.strictEqual(result.manifest.plugins[0]?.source, './');
    });
});
