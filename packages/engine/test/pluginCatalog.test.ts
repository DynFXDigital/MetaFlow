import * as assert from 'assert';
import {
    buildAgentPluginCatalog,
    buildCapabilityPluginMarketplaceManifest,
    loadCapabilityDescriptorForLayer,
    LayerContent,
} from '../src/index';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeLayer(
    layerId: string,
    repoId: string,
    pluginName: string,
    warnings: Array<{
        code: string;
        message: string;
        severity?: 'error' | 'warning' | 'info';
    }> = [],
    options: {
        descriptorKind?: 'readme' | 'capability';
        descriptorId?: string;
        descriptorName?: string;
        descriptorDescription?: string;
        pluginDescription?: string;
        agentPlugin?: boolean;
    } = {},
): LayerContent {
    const pluginDescription = options.pluginDescription ?? `Description for ${layerId}`;
    const descriptorFileName = options.descriptorKind === 'readme' ? 'README.md' : 'CAPABILITY.md';
    return {
        layerId,
        repoId,
        files: [],
        capability: {
            id: layerId.split('/').slice(-1)[0],
            uid:
                options.descriptorId ??
                (options.descriptorKind === 'readme'
                    ? '123e4567-e89b-42d3-a456-426614174000'
                    : undefined),
            manifestPath: `/workspace/${layerId}/${descriptorFileName}`,
            descriptorKind: options.descriptorKind,
            name: options.descriptorName ?? pluginName,
            description: options.descriptorDescription ?? pluginDescription,
            agentPlugin: options.agentPlugin ?? true,
            agentPluginManifest: {
                pluginJsonPath: `/workspace/${layerId}/plugin.json`,
                name: pluginName,
                version: '1.0.0',
                description: pluginDescription,
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

    it('supports README-only documentation with plugin.json metadata', () => {
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-readme-plugin-'));
        try {
            fs.writeFileSync(
                path.join(repoRoot, 'README.md'),
                [
                    '---',
                    'name: readme-plugin',
                    'description: Documented by the package README.',
                    'id: 123e4567-e89b-12d3-a456-426614174000',
                    '---',
                    '',
                    '# README Plugin',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(repoRoot, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'readme-plugin',
                        version: '1.2.3',
                        description: 'Documented by the package README.',
                        author: { name: 'Example Org', email: 'plugins@example.test' },
                        license: 'MIT',
                        keywords: ['example', 'readme'],
                        agents: '.github/agents',
                        skills: ['.github/skills', '.github/skills-extra'],
                        homepage: 'https://example.test/readme-plugin',
                        repository: 'https://github.com/example/readme-plugin',
                        documentation: 'https://docs.example.test/readme-plugin',
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.4.0',
                        },
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            const capability = loadCapabilityDescriptorForLayer(repoRoot, 'readme-plugin');
            assert.ok(capability);
            const catalog = buildAgentPluginCatalog([
                { layerId: 'repo', repoId: 'repo', files: [], capability },
            ]);

            assert.deepStrictEqual(catalog.warnings, []);
            assert.deepStrictEqual(catalog.entries[0], {
                pluginName: 'readme-plugin',
                version: '1.2.3',
                displayName: 'readme-plugin',
                descriptorId: '123e4567-e89b-12d3-a456-426614174000',
                description: 'Documented by the package README.',
                capabilityId: 'readme-plugin',
                layerId: 'repo',
                repoId: 'repo',
                manifestPath: path.join(repoRoot, 'README.md'),
                pluginJsonPath: path.join(repoRoot, 'plugin.json'),
                pluginHosts: ['github-copilot'],
                minimumMetaflowVersion: '^0.4.0',
                license: 'MIT',
                author: { name: 'Example Org', email: 'plugins@example.test' },
                keywords: ['example', 'readme'],
                components: {
                    agents: '.github/agents',
                    skills: ['.github/skills', '.github/skills-extra'],
                },
                homepage: 'https://example.test/readme-plugin',
                repository: 'https://github.com/example/readme-plugin',
                documentation: 'https://docs.example.test/readme-plugin',
                experimental: undefined,
            });

            const marketplace = buildCapabilityPluginMarketplaceManifest(catalog.entries, {
                repoRoot,
                marketplaceName: 'Example Plugins',
            });
            assert.deepStrictEqual(marketplace.warnings, []);
            assert.deepStrictEqual(marketplace.manifest.plugins, [
                {
                    name: 'readme-plugin',
                    source: './',
                    description: 'Documented by the package README.',
                    version: '1.2.3',
                    author: { name: 'Example Org', email: 'plugins@example.test' },
                    license: 'MIT',
                    keywords: ['example', 'readme'],
                    homepage: 'https://example.test/readme-plugin',
                    repository: 'https://github.com/example/readme-plugin',
                    documentation: 'https://docs.example.test/readme-plugin',
                },
            ]);
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    it('keeps CAPABILITY-only legacy plugin packages in the catalog', () => {
        const result = buildAgentPluginCatalog([
            makeLayer('repo/legacy/plugin', 'repo', 'legacy-plugin', [], {
                descriptorKind: 'capability',
                descriptorId: '123e4567-e89b-12d3-a456-426614174000',
            }),
        ]);

        assert.strictEqual(result.entries.length, 1);
        assert.strictEqual(result.entries[0]?.descriptorId, undefined);
        assert.deepStrictEqual(result.warnings, []);
    });

    it('omits README plugin packages without a valid descriptor id', () => {
        const layer = makeLayer('repo/readme/missing-id', 'repo', 'missing-id', [], {
            descriptorKind: 'readme',
        });
        layer.capability!.uid = undefined;

        const result = buildAgentPluginCatalog([layer]);

        assert.deepStrictEqual(result.entries, []);
        assert.deepStrictEqual(result.warnings, []);
    });

    it('emits stable actionable diagnostics for README/plugin identity mismatches', () => {
        const nameMismatch = buildAgentPluginCatalog([
            makeLayer('repo/readme/name-mismatch', 'repo', 'name-mismatch', [], {
                descriptorKind: 'readme',
                descriptorName: 'README Name',
            }),
        ]);
        assert.strictEqual(nameMismatch.entries.length, 1);
        assert.strictEqual(
            nameMismatch.warnings[0]?.code,
            'CAPABILITY_AGENT_PLUGIN_README_NAME_MISMATCH',
        );
        assert.ok(nameMismatch.warnings[0]?.message.includes('README Name'));
        assert.ok(nameMismatch.warnings[0]?.message.includes('name-mismatch'));

        const descriptionMismatch = buildAgentPluginCatalog([
            makeLayer('repo/readme/description-mismatch', 'repo', 'description-mismatch', [], {
                descriptorKind: 'readme',
                descriptorDescription: 'README description',
                pluginDescription: 'Plugin description',
            }),
        ]);
        assert.strictEqual(descriptionMismatch.entries.length, 1);
        assert.strictEqual(
            descriptionMismatch.warnings[0]?.code,
            'CAPABILITY_AGENT_PLUGIN_README_DESCRIPTION_MISMATCH',
        );
        assert.ok(descriptionMismatch.warnings[0]?.message.includes('README description'));
        assert.ok(descriptionMismatch.warnings[0]?.message.includes('Plugin description'));
        assert.ok(
            descriptionMismatch.warnings[0]?.message.includes(
                'Align the shared description values',
            ),
        );
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
                keywords: ['metaflow'],
            },
            {
                name: 'example-second',
                source: './review/second',
                description: 'Description for repo/review/second',
                version: '1.0.0',
                keywords: ['metaflow'],
            },
        ]);
        assert.strictEqual(
            result.manifest.metadata?.description,
            'Generated from capability plugin metadata.',
        );
    });

    it('keeps marketplace JSON deterministic regardless of layer input order', () => {
        const firstLayer = makeLayer('repo/review/first', 'repo', 'example-first');
        const secondLayer = makeLayer('repo/review/second', 'repo', 'example-second');
        const forwardCatalog = buildAgentPluginCatalog([firstLayer, secondLayer]);
        const reverseCatalog = buildAgentPluginCatalog([secondLayer, firstLayer]);

        const forwardMarketplace = buildCapabilityPluginMarketplaceManifest(
            forwardCatalog.entries,
            { repoRoot: '/workspace/repo', marketplaceName: 'Example Repo' },
        );
        const reverseMarketplace = buildCapabilityPluginMarketplaceManifest(
            reverseCatalog.entries,
            { repoRoot: '/workspace/repo', marketplaceName: 'Example Repo' },
        );

        assert.strictEqual(
            JSON.stringify(forwardMarketplace.manifest),
            JSON.stringify(reverseMarketplace.manifest),
        );
        assert.deepStrictEqual(forwardMarketplace.warnings, reverseMarketplace.warnings);
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
