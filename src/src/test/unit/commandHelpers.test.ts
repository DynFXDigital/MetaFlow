import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    isInjectionMode,
    deriveRepoId,
    ensureMultiRepoConfig,
    extractLayerIndex,
    extractLayerCheckedState,
    extractRepoId,
    extractRefreshCommandOptions,
    extractApplyCommandOptions,
    normalizeFilesViewMode,
    normalizeLayersViewMode,
    normalizeLayerPath,
    normalizeAndDeduplicateLayerPaths,
    pruneStaleLayerSources,
} from '../../commands/commandHelpers';

suite('Command Helpers', () => {
    test('validates injection mode values', () => {
        assert.strictEqual(isInjectionMode('settings'), true);
        assert.strictEqual(isInjectionMode('materialize'), true);
        assert.strictEqual(isInjectionMode('invalid'), false);
    });

    test('derives repo id from URL and deduplicates', () => {
        const repoId = deriveRepoId(
            'C:/tmp/local-folder',
            'https://github.com/org/ai-metadata.git',
            new Set<string>(['ai-metadata', 'ai-metadata-2'])
        );

        assert.strictEqual(repoId, 'ai-metadata-3');
    });

    test('derives repo id from local path when URL missing', () => {
        const repoId = deriveRepoId('C:/tmp/My Metadata Source', undefined, new Set<string>());
        assert.strictEqual(repoId, 'my-metadata-source');
    });

    test('falls back to source when derived slug is empty', () => {
        const fromUrl = deriveRepoId('C:/tmp/local', 'https://example.com/###.git', new Set<string>());
        const fromPath = deriveRepoId('', undefined, new Set<string>());

        assert.strictEqual(fromUrl, 'source');
        assert.strictEqual(fromPath, 'source');
    });

    test('converts legacy single-repo config to multi-repo config', () => {
        const config = {
            metadataRepo: { localPath: '.ai/metadata' },
            layers: ['company', 'team/default'],
        };

        const result = ensureMultiRepoConfig(config as never);

        assert.strictEqual(result.metadataRepos.length, 1);
        assert.strictEqual(result.metadataRepos[0].id, 'primary');
        assert.strictEqual(result.layerSources.length, 2);
        assert.strictEqual(result.layerSources[0].repoId, 'primary');
        assert.strictEqual('metadataRepo' in config, false);
        assert.strictEqual('layers' in config, false);
    });

    test('returns existing multi-repo config without conversion', () => {
        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
            layerSources: [{ repoId: 'primary', path: 'company', enabled: true }],
        };

        const result = ensureMultiRepoConfig(config as never);

        assert.strictEqual(result.metadataRepos, config.metadataRepos);
        assert.strictEqual(result.layerSources, config.layerSources);
    });

    test('throws for invalid legacy config conversion request', () => {
        assert.throws(
            () => ensureMultiRepoConfig({ metadataRepo: { localPath: '.ai/metadata' } } as never),
            /Cannot convert config to multi-repo mode/
        );
    });

    test('extracts layer index from number and object', () => {
        assert.strictEqual(extractLayerIndex(3), 3);
        assert.strictEqual(extractLayerIndex(null), undefined);
        assert.strictEqual(extractLayerIndex({ layerIndex: 5 }), 5);
        assert.strictEqual(extractLayerIndex({ layerIndex: '5' }), undefined);
    });

    test('extracts checked state and repo id from command args', () => {
        assert.strictEqual(extractLayerCheckedState({ checked: true }), true);
        assert.strictEqual(extractLayerCheckedState(null), undefined);
        assert.strictEqual(extractLayerCheckedState({}), undefined);
        assert.strictEqual(extractLayerCheckedState({ checked: 'true' }), undefined);

        assert.strictEqual(extractRepoId('primary'), 'primary');
        assert.strictEqual(extractRepoId(null), undefined);
        assert.strictEqual(extractRepoId({ repoId: 'secondary' }), 'secondary');
        assert.strictEqual(extractRepoId({ repoId: 1 }), undefined);
    });

    test('extracts refresh/apply options and ignores invalid types', () => {
        assert.deepStrictEqual(extractRefreshCommandOptions(undefined), {});
        assert.deepStrictEqual(
            extractRefreshCommandOptions({ skipAutoApply: true, forceDiscovery: false, forceDiscoveryRepoId: 'repo-a' }),
            { skipAutoApply: true, forceDiscovery: false, forceDiscoveryRepoId: 'repo-a' }
        );
        assert.deepStrictEqual(
            extractRefreshCommandOptions({ skipAutoApply: 'x', forceDiscovery: 1, forceDiscoveryRepoId: 7 }),
            { skipAutoApply: undefined, forceDiscovery: undefined, forceDiscoveryRepoId: undefined }
        );

        assert.deepStrictEqual(extractApplyCommandOptions({ skipRefresh: true }), { skipRefresh: true });
        assert.deepStrictEqual(extractApplyCommandOptions(null), {});
        assert.deepStrictEqual(extractApplyCommandOptions({ skipRefresh: 'false' }), { skipRefresh: undefined });
    });

    test('normalizes view mode settings to safe defaults', () => {
        assert.strictEqual(normalizeFilesViewMode('repoTree'), 'repoTree');
        assert.strictEqual(normalizeFilesViewMode('other'), 'unified');

        assert.strictEqual(normalizeLayersViewMode('tree'), 'tree');
        assert.strictEqual(normalizeLayersViewMode('other'), 'flat');
    });

    test('normalizes and deduplicates layer paths', () => {
        const config = {
            layerSources: [
                { repoId: 'primary', path: 'company/.github', enabled: false },
                { repoId: 'primary', path: 'company', enabled: true },
                { repoId: 'secondary', path: '.github', enabled: true },
            ],
            layers: ['team/.github', 'team', '.github'],
        };

        const changed = normalizeAndDeduplicateLayerPaths(config as never);

        assert.strictEqual(changed, true);
        assert.deepStrictEqual(config.layerSources, [
            { repoId: 'primary', path: 'company', enabled: true },
            { repoId: 'secondary', path: '.', enabled: true },
        ]);
        assert.deepStrictEqual(config.layers, ['team', '.']);
        assert.strictEqual(normalizeLayerPath('company/.github'), 'company');
    });

    test('reports unchanged for already normalized config', () => {
        const config = {
            layerSources: [{ repoId: 'primary', path: 'company', enabled: true }],
            layers: ['company', '.'],
        };

        const changed = normalizeAndDeduplicateLayerPaths(config as never);
        assert.strictEqual(changed, false);
    });
});

suite('pruneStaleLayerSources', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-prune-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('removes multi-repo layer sources whose directories do not exist', () => {
        const repoRoot = path.join(tmpDir, 'org');
        fs.mkdirSync(path.join(repoRoot, 'present'), { recursive: true });

        const config = {
            metadataRepos: [{ id: 'org', localPath: repoRoot, enabled: true }],
            layerSources: [
                { repoId: 'org', path: 'present', enabled: true },
                { repoId: 'org', path: 'removed', enabled: true },
            ],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, ['org/removed']);
        assert.strictEqual(config.layerSources.length, 1);
        assert.strictEqual(config.layerSources[0].path, 'present');
    });

    test('removes single-repo layers whose directories do not exist', () => {
        const repoRoot = path.join(tmpDir, 'meta');
        fs.mkdirSync(path.join(repoRoot, 'live'), { recursive: true });

        const config = {
            metadataRepo: { localPath: repoRoot },
            layers: ['live', 'gone'],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, ['gone']);
        assert.deepStrictEqual(config.layers, ['live']);
    });

    test('returns empty array when all layers exist', () => {
        const repoRoot = path.join(tmpDir, 'org');
        fs.mkdirSync(path.join(repoRoot, 'a'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'b'), { recursive: true });

        const config = {
            metadataRepos: [{ id: 'org', localPath: repoRoot, enabled: true }],
            layerSources: [
                { repoId: 'org', path: 'a', enabled: true },
                { repoId: 'org', path: 'b', enabled: true },
            ],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, []);
        assert.strictEqual(config.layerSources.length, 2);
    });

    test('leaves entries with unknown repoId untouched', () => {
        const config = {
            metadataRepos: [{ id: 'known', localPath: tmpDir, enabled: true }],
            layerSources: [
                { repoId: 'unknown', path: 'whatever', enabled: true },
            ],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, []);
        assert.strictEqual(config.layerSources.length, 1);
    });
});
