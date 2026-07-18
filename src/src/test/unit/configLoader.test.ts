/**
 * Unit tests for configLoader.
 *
 * Tests: valid parsing, missing fields, JSONC support, empty/null/malformed input.
 */

import * as assert from 'assert';
import * as path from 'path';
import {
    loadConfig,
    loadConfigFromPath,
    parseAndValidate,
    validateConfig,
    MetaFlowConfig,
} from '@metaflow/engine';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-workspace');

suite('Config Loader', () => {
    suite('loadConfig()', () => {
        test('loads valid config from workspace root', () => {
            const result = loadConfig(FIXTURES_ROOT);
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.ok(typeof result.config.metadataRepos?.[0].localPath === 'string');
                assert.ok((result.config.metadataRepos?.[0].localPath.length ?? 0) > 0);
                assert.strictEqual(result.config.metadataRepos?.[0].capabilities, undefined);
                assert.ok((result.config.profiles?.default?.enabledCapabilities?.length ?? 0) > 0);
                assert.ok(Array.isArray(result.config.layerSources));
                assert.ok((result.config.layerSources?.length ?? 0) > 0);
                if (result.config.activeProfile !== undefined) {
                    assert.ok(typeof result.config.activeProfile === 'string');
                    assert.ok(result.config.activeProfile.length > 0);
                }
                assert.ok(result.configPath?.endsWith(path.join('.metaflow', 'config.jsonc')));
            }
        });

        test('returns error when no config found', () => {
            const result = loadConfig(path.join(FIXTURES_ROOT, 'nonexistent'));
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.ok(result.errors[0].message.includes('No .metaflow/config.jsonc'));
            }
        });
    });

    suite('loadConfigFromPath()', () => {
        test('loads a canonical config without migration', () => {
            const result = loadConfigFromPath(
                path.join(FIXTURES_ROOT, '.metaflow', 'config.jsonc'),
            );
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.config.metadataRepos?.[0].capabilities, undefined);
                assert.ok((result.config.profiles?.default?.enabledCapabilities?.length ?? 0) > 0);
                assert.ok(Array.isArray(result.config.layerSources));
                assert.ok((result.config.layerSources?.length ?? 0) > 0);
                assert.ok(typeof result.config.metadataRepos?.[0].localPath === 'string');
                assert.ok((result.config.metadataRepos?.[0].localPath.length ?? 0) > 0);
                assert.notStrictEqual(result.migrated, true);
            }
        });

        test('loads valid multi-repo config', () => {
            const result = loadConfigFromPath(
                path.join(FIXTURES_ROOT, 'multi-repo', '.metaflow', 'config.jsonc'),
            );
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.config.metadataRepos?.length, 2);
                assert.strictEqual(result.config.layerSources?.length, 3);
                assert.strictEqual(result.config.compatibilityVersion, 3);
            }
        });

        test('migrates implicit released compatibility version on modern authored config', () => {
            const result = parseAndValidate(
                JSON.stringify({
                    metadataRepos: [
                        {
                            id: 'r1',
                            localPath: '.ai/metadata',
                            capabilities: [{ path: 'company/core' }],
                        },
                    ],
                }),
                'test.json',
            );
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.strictEqual(result.config.compatibilityVersion, 3);
                assert.strictEqual(result.migrated, true);
                assert.ok(
                    result.migrationMessages?.some((message) =>
                        message.includes('compatibilityVersion'),
                    ),
                );
            }
        });

        test('returns parse errors for invalid JSON', () => {
            const result = loadConfigFromPath(
                path.join(FIXTURES_ROOT, 'invalid-config', '.metaflow', 'config.jsonc'),
            );
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.ok(result.errors.length > 0);
                assert.ok(result.errors[0].message.includes('parse error'));
            }
        });

        test('returns errors for missing metadataRepo', () => {
            const result = loadConfigFromPath(
                path.join(FIXTURES_ROOT, 'missing-repo', '.metaflow', 'config.jsonc'),
            );
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.ok(result.errors.some((e) => e.message.includes('metadataRepo')));
            }
        });

        test('returns error for non-existent file', () => {
            const result = loadConfigFromPath(path.join(FIXTURES_ROOT, 'nope.json'));
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.ok(result.errors[0].message.includes('Failed to read'));
            }
        });
    });

    suite('parseAndValidate()', () => {
        test('handles JSONC comments and trailing commas', () => {
            const jsonc = `{
                // This is a comment
                "metadataRepo": {
                    "localPath": ".ai/ai-metadata",
                },
                "layers": ["company/core"],
            }`;
            const result = parseAndValidate(jsonc, 'test.json');
            assert.strictEqual(result.ok, true);
        });

        test('rejects empty input', () => {
            const result = parseAndValidate('', 'test.json');
            assert.strictEqual(result.ok, false);
        });

        test('rejects array at top level', () => {
            const result = parseAndValidate('[]', 'test.json');
            assert.strictEqual(result.ok, false);
            if (!result.ok) {
                assert.ok(result.errors[0].message.includes('JSON object'));
            }
        });

        test('rejects null at top level', () => {
            const result = parseAndValidate('null', 'test.json');
            assert.strictEqual(result.ok, false);
        });
    });

    suite('validateConfig()', () => {
        test('valid single-repo config returns no errors', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
                layers: ['company/core'],
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('valid multi-repo config returns no errors', () => {
            const config: MetaFlowConfig = {
                compatibilityVersion: 2,
                metadataRepos: [
                    { id: 'primary', localPath: '.ai/metadata' },
                    { id: 'team', localPath: '../team-meta' },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'team', path: 'overlays/team' },
                ],
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('valid multi-repo config allows disabled repos', () => {
            const config: MetaFlowConfig = {
                compatibilityVersion: 2,
                metadataRepos: [
                    { id: 'primary', localPath: '.ai/metadata', enabled: false },
                    { id: 'team', localPath: '../team-meta' },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'team', path: 'overlays/team' },
                ],
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('missing repo or repos produces error', () => {
            const config: MetaFlowConfig = {};
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('metadataRepo')));
        });

        test('future compatibilityVersion produces error', () => {
            const config: MetaFlowConfig = {
                compatibilityVersion: 999,
                metadataRepos: [{ id: 'primary', localPath: 'a' }],
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('supported version')));
        });

        test('single-repo without layers is valid as a zero-layer bootstrap config', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('single-repo without localPath produces error', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '' },
                layers: ['company/core'],
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('localPath')));
        });

        test('multi-repo with duplicate IDs produces error', () => {
            const config: MetaFlowConfig = {
                metadataRepos: [
                    { id: 'dup', localPath: 'a' },
                    { id: 'dup', localPath: 'b' },
                ],
                layerSources: [{ repoId: 'dup', path: 'layer' }],
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('unique')));
        });

        test('multi-repo without layerSources is valid when using authored metadataRepos', () => {
            const config: MetaFlowConfig = {
                metadataRepos: [{ id: 'primary', localPath: 'a' }],
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('layerSources with unresolved repoId produces a warning without blocking load', () => {
            const config: MetaFlowConfig = {
                metadataRepos: [{ id: 'primary', localPath: 'a' }],
                layerSources: [{ repoId: 'missing', path: 'layer' }],
            };
            const diagnostics = validateConfig(config);
            assert.ok(
                diagnostics.some(
                    (diagnostic) =>
                        diagnostic.severity === 'warning' &&
                        diagnostic.code === 'CONFIG_LAYER_SOURCE_REPO_UNRESOLVED' &&
                        diagnostic.message.includes('"missing"'),
                ),
            );
        });

        test('profile capability with unresolved repoId produces a warning without blocking load', () => {
            const result = parseAndValidate(
                JSON.stringify({
                    metadataRepos: [{ id: 'primary', localPath: 'a' }],
                    profiles: {
                        default: {
                            enabledCapabilities: ['missing:capabilities/ghost'],
                        },
                    },
                }),
                'test.json',
            );
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.ok(
                    result.warnings?.some(
                        (warning) =>
                            warning.code === 'CONFIG_PROFILE_CAPABILITY_REPO_UNRESOLVED',
                    ),
                );
            }
        });

        test('activeProfile referencing non-existent profile is non-fatal', () => {
            // A missing activeProfile degrades gracefully: the overlay surfaces all
            // files unfiltered and emits an ACTIVE_PROFILE_NOT_FOUND warning, so a
            // profile typo must not be a fatal config error.
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
                layers: ['company/core'],
                profiles: { baseline: {} },
                activeProfile: 'unknown',
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });

        test('activeProfile matching existing profile is valid', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
                layers: ['company/core'],
                profiles: { baseline: {} },
                activeProfile: 'baseline',
            };
            assert.deepStrictEqual(validateConfig(config), []);
        });
    });
});
