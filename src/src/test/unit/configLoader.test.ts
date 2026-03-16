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
                assert.ok(Array.isArray(result.config.metadataRepos?.[0].capabilities));
                assert.ok((result.config.metadataRepos?.[0].capabilities?.length ?? 0) > 0);
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
        test('loads valid canonical config', () => {
            const result = loadConfigFromPath(
                path.join(FIXTURES_ROOT, '.metaflow', 'config.jsonc'),
            );
            assert.strictEqual(result.ok, true);
            if (result.ok) {
                assert.ok(Array.isArray(result.config.metadataRepos?.[0].capabilities));
                assert.ok((result.config.metadataRepos?.[0].capabilities?.length ?? 0) > 0);
                assert.ok(Array.isArray(result.config.layerSources));
                assert.ok((result.config.layerSources?.length ?? 0) > 0);
                assert.ok(typeof result.config.metadataRepos?.[0].localPath === 'string');
                assert.ok((result.config.metadataRepos?.[0].localPath.length ?? 0) > 0);
                assert.strictEqual(result.migrated, undefined);
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

        test('single-repo without layers produces error', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('layers')));
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

        test('layerSources with invalid repoId produces error', () => {
            const config: MetaFlowConfig = {
                metadataRepos: [{ id: 'primary', localPath: 'a' }],
                layerSources: [{ repoId: 'missing', path: 'layer' }],
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('"missing"')));
        });

        test('activeProfile referencing non-existent profile produces error', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: '.ai/metadata' },
                layers: ['company/core'],
                profiles: { baseline: {} },
                activeProfile: 'unknown',
            };
            const errors = validateConfig(config);
            assert.ok(errors.some((e) => e.message.includes('"unknown"')));
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
