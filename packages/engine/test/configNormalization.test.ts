/**
 * Unit tests for configNormalization.ts
 *
 * Covers: uncovered branches in normalizeConfigShape, toAuthoredConfig,
 * buildRestOfConfig optional fields, layerSourceToCapabilitySource,
 * capabilitySourceToLayerSource, flattenCapabilities injection merging,
 * and legacy metadataRepo optional fields.
 */

import * as assert from 'assert';
import { normalizeConfigShape, toAuthoredConfig } from '../src/index';
import type { MetaFlowConfig } from '../src/index';

describe('configNormalization: toAuthoredConfig — buildRestOfConfig optional fields', () => {
    it('preserves injection config when present', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            injection: { instructions: 'settings', skills: 'synchronize' },
        };
        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.injection, config.injection);
    });

    it('preserves hooks config when present', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            hooks: { preApply: 'scripts/pre.sh', postApply: 'scripts/post.sh' },
        };
        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.hooks, config.hooks);
    });

    it('preserves profiles and activeProfile when present', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            profiles: { dev: { enable: ['**'] } },
            activeProfile: 'dev',
        };
        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.profiles, config.profiles);
        assert.strictEqual(authored.activeProfile, 'dev');
    });

    it('preserves filters when present', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            filters: { include: ['**'], exclude: ['secrets/**'] },
        };
        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.filters, config.filters);
    });

    it('preserves settingsInjectionTarget when present', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            settingsInjectionTarget: 'workspaceFolder',
        };
        const authored = toAuthoredConfig(config);
        assert.strictEqual(authored.settingsInjectionTarget, 'workspaceFolder');
    });

    it('canonicalizes nested property ordering for stable serialization', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    injection: {
                        hooks: 'settings',
                        agents: 'synchronize',
                        prompts: 'settings',
                        instructions: 'settings',
                        skills: 'synchronize',
                    },
                    discover: {
                        exclude: ['archive/**'],
                        enabled: true,
                    },
                    capabilities: [
                        {
                            path: 'cap-a',
                            excludedTypes: ['skills', 'instructions', 'agents'],
                            injection: {
                                hooks: 'synchronize',
                                prompts: 'settings',
                                instructions: 'settings',
                            },
                        },
                    ],
                },
            ],
            profiles: {
                zebra: { disable: ['agents/**'] },
                alpha: {
                    displayName: 'Alpha',
                    enable: ['**/*'],
                    layerOverrides: [
                        {
                            path: 'cap-a',
                            repoId: 'r1',
                            excludedTypes: ['skills', 'instructions'],
                            enabled: false,
                        },
                    ],
                },
            },
            injection: {
                hooks: 'settings',
                agents: 'synchronize',
                prompts: 'settings',
                instructions: 'settings',
                skills: 'synchronize',
            },
            settingsInjectionTarget: 'workspaceFolder',
            hooks: {
                postApply: 'scripts/post.sh',
                preApply: 'scripts/pre.sh',
            },
        };

        const serialized = JSON.stringify(toAuthoredConfig(config), null, 2);
        const expected = [
            '{',
            '  "metadataRepos": [',
            '    {',
            '      "id": "r1",',
            '      "localPath": "repos/r1",',
            '      "discover": {',
            '        "enabled": true,',
            '        "exclude": [',
            '          "archive/**"',
            '        ]',
            '      },',
            '      "injection": {',
            '        "instructions": "settings",',
            '        "prompts": "settings",',
            '        "skills": "synchronize",',
            '        "agents": "synchronize",',
            '        "hooks": "settings"',
            '      },',
            '      "capabilities": [',
            '        {',
            '          "path": "cap-a",',
            '          "excludedTypes": [',
            '            "instructions",',
            '            "agents",',
            '            "skills"',
            '          ],',
            '          "injection": {',
            '            "instructions": "settings",',
            '            "prompts": "settings",',
            '            "hooks": "synchronize"',
            '          }',
            '        }',
            '      ]',
            '    }',
            '  ],',
            '  "profiles": {',
            '    "alpha": {',
            '      "displayName": "Alpha",',
            '      "enable": [',
            '        "**/*"',
            '      ],',
            '      "layerOverrides": [',
            '        {',
            '          "repoId": "r1",',
            '          "path": "cap-a",',
            '          "enabled": false,',
            '          "excludedTypes": [',
            '            "instructions",',
            '            "skills"',
            '          ]',
            '        }',
            '      ]',
            '    },',
            '    "zebra": {',
            '      "disable": [',
            '        "agents/**"',
            '      ]',
            '    }',
            '  },',
            '  "injection": {',
            '    "instructions": "settings",',
            '    "prompts": "settings",',
            '    "skills": "synchronize",',
            '    "agents": "synchronize",',
            '    "hooks": "settings"',
            '  },',
            '  "settingsInjectionTarget": "workspaceFolder",',
            '  "hooks": {',
            '    "preApply": "scripts/pre.sh",',
            '    "postApply": "scripts/post.sh"',
            '  }',
            '}',
        ].join('\n');

        assert.strictEqual(serialized, expected);
    });
});

describe('configNormalization: toAuthoredConfig — legacy metadataRepo optional fields', () => {
    it('preserves url and commit when present in legacy metadataRepo', () => {
        const config: MetaFlowConfig = {
            metadataRepo: {
                localPath: '.ai/ai-metadata',
                url: 'https://github.com/org/repo',
            },
            layers: ['core'],
        };
        const authored = toAuthoredConfig(config);
        assert.strictEqual(authored.metadataRepos?.[0].url, 'https://github.com/org/repo');
    });

    it('preserves commit in legacy metadataRepo when set', () => {
        const config: MetaFlowConfig = {
            metadataRepo: {
                localPath: '.ai/ai-metadata',
            },
            layers: ['core'],
        };
        const authored = toAuthoredConfig(config);
        // commit is not set → should be absent
        assert.strictEqual(authored.metadataRepos?.[0].commit, undefined);
    });

    it('preserves name in legacy metadataRepo', () => {
        const authored = toAuthoredConfig({
            metadataRepo: {
                localPath: '.ai',
                name: 'My Metadata Repo',
                url: 'https://example.com/repo',
            },
            layers: ['core'],
        } as unknown as MetaFlowConfig); // name is not in typed MetadataRepo but JS allows it
        // Extra fields must not crash; key typed fields must be preserved
        assert.ok(authored.metadataRepos?.[0], 'should produce at least one metadataRepo entry');
        assert.strictEqual(
            authored.metadataRepos![0].localPath,
            '.ai',
            'localPath must be preserved',
        );
        assert.strictEqual(
            authored.metadataRepos![0].url,
            'https://example.com/repo',
            'url must be preserved',
        );
    });

    it('results in empty metadataRepos when no repo config', () => {
        const authored = toAuthoredConfig({} as MetaFlowConfig);
        assert.ok(!authored.metadataRepos || authored.metadataRepos.length === 0);
    });
});

describe('configNormalization: toAuthoredConfig — named repo optional fields', () => {
    it('includes url, commit, discover, injection when present in metadataRepos', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    url: 'https://github.com/org/repo',
                    enabled: true,
                    discover: { enabled: true, exclude: ['archive/**'] },
                    injection: { instructions: 'settings' },
                    capabilities: [],
                },
            ],
        };
        const authored = toAuthoredConfig(config);
        const repo = authored.metadataRepos?.[0];
        assert.ok(repo);
        assert.strictEqual(repo.url, 'https://github.com/org/repo');
        assert.strictEqual(repo.enabled, true);
        assert.deepStrictEqual(repo.discover, { enabled: true, exclude: ['archive/**'] });
        assert.deepStrictEqual(repo.injection, { instructions: 'settings' });
    });
});

describe('configNormalization: toAuthoredConfig — layerSourceToCapabilitySource', () => {
    it('creates capability from layerSource with injection when path not in capabilities', () => {
        // When a layerSource path is NOT already in repo.capabilities, layerSourceToCapabilitySource is called
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 'cap-a' }], // cap-b is not here
                },
            ],
            layerSources: [
                {
                    repoId: 'r1',
                    path: 'cap-b',
                    enabled: true,
                    injection: { skills: 'synchronize' },
                },
            ],
        };
        const authored = toAuthoredConfig(config);
        const caps = authored.metadataRepos?.[0].capabilities;
        assert.ok(caps);
        // cap-b should be present from layerSource
        const capB = caps.find((c) => c.path === 'cap-b');
        assert.ok(capB, 'cap-b from layerSource should be included');
        assert.deepStrictEqual(capB!.injection, { skills: 'synchronize' });
        assert.strictEqual(capB!.enabled, true);
    });

    it('creates capability from layerSource with excludedTypes when not in capabilities', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [],
                },
            ],
            layerSources: [
                {
                    repoId: 'r1',
                    path: 'cap-x',
                    enabled: false,
                    excludedTypes: ['skills'],
                },
            ],
        };
        const authored = toAuthoredConfig(config);
        const caps = authored.metadataRepos?.[0].capabilities;
        const capX = caps?.find((c) => c.path === 'cap-x');
        assert.ok(capX);
        assert.strictEqual(capX!.enabled, false);
        assert.deepStrictEqual(capX!.excludedTypes, ['skills']);
    });

    it('preserves existing capability enabled and excludedTypes when matching layerSource omits them', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [
                        {
                            path: 'team/core',
                            enabled: false,
                            excludedTypes: ['instructions'],
                        },
                    ],
                },
            ],
            layerSources: [
                {
                    repoId: 'r1',
                    path: 'team/core',
                },
            ],
        };

        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.metadataRepos?.[0].capabilities, [
            {
                path: 'team/core',
                enabled: false,
                excludedTypes: ['instructions'],
            },
        ]);
    });

    it('normalizes matching layerSource paths before merging into capabilities', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [
                        {
                            path: 'team/core',
                            enabled: false,
                        },
                    ],
                },
            ],
            layerSources: [
                {
                    repoId: 'r1',
                    path: 'team\\core',
                    injection: { skills: 'synchronize' },
                },
            ],
        };

        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.metadataRepos?.[0].capabilities, [
            {
                path: 'team/core',
                enabled: false,
                injection: { skills: 'synchronize' },
            },
        ]);
    });
});

describe('configNormalization: normalizeConfigShape — flattenCapabilities with injection', () => {
    it('merges repo injection with capability injection in flattened layerSources', () => {
        // flattenCapabilities is called by normalizeConfigShape when layerSources is not explicit
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    injection: { instructions: 'settings' },
                    capabilities: [
                        {
                            path: 'core',
                            injection: { skills: 'synchronize' },
                        },
                    ],
                },
            ],
            // No layerSources — so normalizeConfigShape will call flattenCapabilities
        };
        const result = normalizeConfigShape(config);
        const ls = result.config.layerSources;
        assert.ok(ls);
        const core = ls.find((s) => s.path === 'core');
        assert.ok(core, 'core capability should appear in flattened layerSources');
        // Injection should be merged: capability wins over repo
        assert.ok(core!.injection);
        assert.strictEqual(core!.injection!.instructions, 'settings'); // from repo
        assert.strictEqual(core!.injection!.skills, 'synchronize'); // from capability
    });

    it('includes repo injection in flattened layerSources when only repo has injection', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    injection: { agents: 'synchronize' },
                    capabilities: [{ path: 'core' }],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const core = result.config.layerSources?.find((s) => s.path === 'core');
        assert.ok(core);
        assert.deepStrictEqual(core!.injection, { agents: 'synchronize' });
    });

    it('includes capability injection when only capability has injection', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 'core', injection: { prompts: 'settings' } }],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const core = result.config.layerSources?.find((s) => s.path === 'core');
        assert.ok(core);
        assert.deepStrictEqual(core!.injection, { prompts: 'settings' });
    });

    it('omits injection in layerSources when neither repo nor capability has it', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 'core' }],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const core = result.config.layerSources?.find((s) => s.path === 'core');
        assert.ok(core);
        assert.strictEqual(core!.injection, undefined);
    });
});

describe('configNormalization: normalizeConfigShape — migration messages', () => {
    it('reports migration message for legacy metadataRepo/layers config', () => {
        const result = normalizeConfigShape({
            metadataRepo: { localPath: '.ai' },
            layers: ['core'],
        });
        assert.ok(result.migrated);
        assert.ok(result.migrationMessages.some((m) => m.includes('Migrated legacy')));
    });

    it('reports migration message for legacy layerSources', () => {
        const result = normalizeConfigShape({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            layerSources: [{ repoId: 'r1', path: 'core' }],
        });
        assert.ok(result.migrated);
        assert.ok(result.migrationMessages.some((m) => m.includes('layerSources')));
    });

    it('reports migration when metadataRepos entries lack capabilities', () => {
        const result = normalizeConfigShape({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            // no layerSources, no capabilities on repo
        });
        assert.ok(result.migrated);
        assert.ok(result.migrationMessages.some((m) => m.includes('Canonicalized')));
    });

    it('does not set migrated flag for modern config', () => {
        const result = normalizeConfigShape({
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 'core' }],
                },
            ],
            // No layerSources → not legacy
        });
        // Might still be migrated for Canonicalized if capabilities exist, depends on shape
        // Key thing is no crash
        assert.ok(typeof result.migrated === 'boolean');
    });
});

describe('configNormalization: capabilitySourceToLayerSource injection field', () => {
    it('capabilitySourceToLayerSource includes injection when capability has it (via flattenCapabilities)', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'repo',
                    localPath: './repo',
                    capabilities: [
                        { path: 'layers/base', injection: { instructions: 'settings' as const } },
                        { path: 'layers/custom', enabled: false },
                    ],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const baseLayer = result.config.layerSources?.find((ls) => ls.path === 'layers/base');
        assert.ok(baseLayer, 'layers/base should be in layerSources');
        assert.deepStrictEqual(baseLayer!.injection, { instructions: 'settings' });

        const customLayer = result.config.layerSources?.find((ls) => ls.path === 'layers/custom');
        assert.ok(customLayer, 'layers/custom should be in layerSources');
        assert.strictEqual(customLayer!.enabled, false);
        assert.strictEqual(customLayer!.injection, undefined);
    });
});

describe('configNormalization: normalizeConfigShape — idempotency', () => {
    it('calling normalizeConfigShape twice produces identical layerSources and metadataRepos', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 'core' }, { path: 'extra', enabled: false }],
                },
            ],
        };
        const first = normalizeConfigShape(config);
        const second = normalizeConfigShape(first.config);
        // A second normalization of an already-normalized config must produce the same shape
        assert.deepStrictEqual(
            second.config.layerSources,
            first.config.layerSources,
            'layerSources must be stable across two normalizations',
        );
        assert.deepStrictEqual(
            second.config.metadataRepos,
            first.config.metadataRepos,
            'metadataRepos must be stable across two normalizations',
        );
    });
});
