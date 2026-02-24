import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { resolveLayers, buildEffectiveFileMap, MetaFlowConfig } from '@metaflow/engine';

/**
 * Create a temporary layer directory with files.
 *
 * @param tmpDir Parent temp directory.
 * @param layerName Sub-directory name.
 * @param files Array of relative file paths to create (with content).
 * @returns Absolute path to the layer directory.
 */
function createLayer(tmpDir: string, layerName: string, files: string[]): string {
    const layerDir = path.join(tmpDir, layerName);
    for (const file of files) {
        const filePath = path.join(layerDir, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `content of ${layerName}/${file}`);
    }
    return layerDir;
}

suite('overlayEngine', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-overlay-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    suite('resolveLayers — single repo', () => {
        test('normalizes .github-prefixed files to artifact-relative paths', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'company/core', [
                '.github/instructions/test.instructions.md',
            ]);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['company/core'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);
            assert.ok(fileMap.has('instructions/test.instructions.md'));
            assert.ok(!fileMap.has('.github/instructions/test.instructions.md'));
        });

        test('single layer with all files', () => {
            // Create repo with one layer
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'company/core', [
                'instructions/coding.md',
                'prompts/gen.prompt.md',
            ]);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: path.join(repoDir) },
                layers: ['company/core'],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 1);
            assert.strictEqual(layers[0].layerId, 'company/core');
            assert.strictEqual(layers[0].files.length, 2);
        });

        test('multiple layers with no conflicts', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'base', ['instructions/a.md']);
            createLayer(repoDir, 'team', ['prompts/b.md']);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['base', 'team'],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 2);
            assert.strictEqual(layers[0].layerId, 'base');
            assert.strictEqual(layers[1].layerId, 'team');
        });

        test('multiple layers with conflicts — later wins', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'base', ['instructions/coding.md']);
            createLayer(repoDir, 'override', ['instructions/coding.md']);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['base', 'override'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);
            const effective = fileMap.get('instructions/coding.md');
            assert.ok(effective);
            assert.strictEqual(effective!.sourceLayer, 'override');
        });

        test('empty layers array returns empty result', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: tmpDir },
                layers: [],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 0);
        });

        test('layer with nested directory structure', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'deep', [
                'instructions/sub/deep/file.md',
                'instructions/top.md',
            ]);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['deep'],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers[0].files.length, 2);
        });

        test('non-existent layer directory is omitted from results', () => {
            const config: MetaFlowConfig = {
                metadataRepo: { localPath: tmpDir },
                layers: ['does-not-exist'],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 0);
        });
    });

    suite('resolveLayers — multi repo', () => {
        test('multiple repos with layer sources', () => {
            const repo1 = path.join(tmpDir, 'repo1');
            const repo2 = path.join(tmpDir, 'repo2');
            createLayer(repo1, 'core', ['instructions/a.md']);
            createLayer(repo2, 'team', ['prompts/b.md']);

            const config: MetaFlowConfig = {
                metadataRepos: [
                    { id: 'standards', localPath: repo1 },
                    { id: 'team', localPath: repo2 },
                ],
                layerSources: [
                    { repoId: 'standards', path: 'core' },
                    { repoId: 'team', path: 'team' },
                ],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 2);
            assert.strictEqual(layers[0].repoId, 'standards');
            assert.strictEqual(layers[1].repoId, 'team');
        });

        test('disabled layer source is skipped', () => {
            const repo1 = path.join(tmpDir, 'repo1');
            createLayer(repo1, 'core', ['instructions/a.md']);

            const config: MetaFlowConfig = {
                metadataRepos: [
                    { id: 'standards', localPath: repo1 },
                ],
                layerSources: [
                    { repoId: 'standards', path: 'core', enabled: false },
                ],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 0);
        });

        test('invalid repoId is skipped', () => {
            const config: MetaFlowConfig = {
                metadataRepos: [
                    { id: 'valid', localPath: tmpDir },
                ],
                layerSources: [
                    { repoId: 'invalid', path: 'core' },
                ],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 0);
        });

        test('disabled repo source is skipped even when layer source is enabled', () => {
            const repo1 = path.join(tmpDir, 'repo1');
            createLayer(repo1, 'core', ['instructions/a.md']);

            const config: MetaFlowConfig = {
                metadataRepos: [
                    { id: 'standards', localPath: repo1, enabled: false },
                ],
                layerSources: [
                    { repoId: 'standards', path: 'core', enabled: true },
                ],
            };

            const layers = resolveLayers(config, tmpDir);
            assert.strictEqual(layers.length, 0);
        });
    });

    suite('buildEffectiveFileMap', () => {
        test('single layer maps all files', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'base', [
                'instructions/a.md',
                'prompts/b.md',
            ]);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['base'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);
            assert.strictEqual(fileMap.size, 2);
        });

        test('later layer overrides earlier for same path', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'base', ['instructions/a.md']);
            createLayer(repoDir, 'override', ['instructions/a.md']);

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['base', 'override'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);
            assert.strictEqual(fileMap.size, 1);
            assert.strictEqual(fileMap.get('instructions/a.md')!.sourceLayer, 'override');
        });

        test('empty layers produce empty map', () => {
            const fileMap = buildEffectiveFileMap([]);
            assert.strictEqual(fileMap.size, 0);
        });
    });

    suite('no config returns empty', () => {
        test('empty config', () => {
            const layers = resolveLayers({}, tmpDir);
            assert.strictEqual(layers.length, 0);
        });
    });

    // ── TC-0602: Config loader rejects .env paths (REQ-0602) ──

    suite('TC-0602: .env files excluded from overlay', () => {
        test('.env file at layer root is not included in effective files', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'layer1', ['instructions/coding.md']);
            // Place a .env file at the layer root
            fs.writeFileSync(path.join(repoDir, 'layer1', '.env'), 'SECRET=value');
            fs.writeFileSync(path.join(repoDir, 'layer1', '.env.local'), 'LOCAL_SECRET=value');

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['layer1'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);

            // .env files must not appear in the effective file map
            const hasEnv = Array.from(fileMap.keys()).some(k => k.includes('.env'));
            assert.strictEqual(hasEnv, false, '.env files at layer root must be excluded');

            // Legitimate artifact file should still be present
            assert.ok(fileMap.has('instructions/coding.md'));
        });

        test('.env file in non-artifact directory is not included', () => {
            const repoDir = path.join(tmpDir, 'repo');
            createLayer(repoDir, 'layer1', ['instructions/guide.md']);
            // Place .env in a non-artifact subdirectory
            const configDir = path.join(repoDir, 'layer1', 'config');
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(path.join(configDir, '.env'), 'DB_PASSWORD=secret');

            const config: MetaFlowConfig = {
                metadataRepo: { localPath: repoDir },
                layers: ['layer1'],
            };

            const layers = resolveLayers(config, tmpDir);
            const fileMap = buildEffectiveFileMap(layers);

            const hasEnv = Array.from(fileMap.keys()).some(k => k.includes('.env'));
            assert.strictEqual(hasEnv, false, '.env files in non-artifact dirs must be excluded');
        });
    });
});
