import * as assert from 'assert';
import { buildAgentPluginCatalog, LayerContent } from '../src/index';

function makeLayer(
    layerId: string,
    repoId: string,
    packageName: string,
    warnings: Array<{ code: string; message: string; severity?: 'error' | 'warning' | 'info' }> = [],
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
            agentPluginPackage: {
                packageJsonPath: `/workspace/${layerId}/package.json`,
                name: packageName,
                version: '1.0.0',
                description: `Package for ${layerId}`,
                keywords: ['metaflow'],
                pluginHosts: ['github-copilot'],
                minimumMetaflowVersion: '^0.1.0-preview.0',
            },
            warnings,
        },
    };
}

describe('pluginCatalog', () => {
    it('returns normalized entries for unique valid agent-plugin capabilities', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/review/first', 'repo', '@example/first'),
            makeLayer('repo/review/second', 'repo', '@example/second'),
        ]);

        assert.deepStrictEqual(
            result.entries.map((entry) => entry.packageName),
            ['@example/first', '@example/second'],
        );
        assert.deepStrictEqual(result.warnings, []);
    });

    it('omits invalid agent-plugin capabilities that already have error-severity manifest warnings', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/review/invalid', 'repo', '@example/invalid', [
                {
                    code: 'CAPABILITY_AGENT_PLUGIN_PACKAGE_VERSION_INVALID',
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
            makeLayer('repo/review/first', 'repo', '@example/shared'),
            makeLayer('repo/review/second', 'repo', '@example/shared'),
        ]);

        assert.deepStrictEqual(result.entries, []);
        assert.strictEqual(result.warnings.length, 2);
        assert.ok(
            result.warnings.every(
                (warning) =>
                    warning.code === 'CAPABILITY_AGENT_PLUGIN_PACKAGE_DUPLICATE' &&
                    warning.severity === 'error',
            ),
        );
    });
});