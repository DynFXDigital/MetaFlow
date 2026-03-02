import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    BUNDLED_REPO_ID,
    materializeBundledMetadata,
    mergeConfigWithBundledMetadata,
    normalizeBundledMetadataMode,
    normalizeBundledMetadataUpdatePolicy,
    readBundledMetadataSettings,
} from '../../commands/bundledMetadata';

suite('bundledMetadata', () => {
    test('normalizes settings values safely', () => {
        assert.strictEqual(normalizeBundledMetadataMode('baseline-plus-local'), 'baseline-plus-local');
        assert.strictEqual(normalizeBundledMetadataMode('baseline-only'), 'baseline-only');
        assert.strictEqual(normalizeBundledMetadataMode('off'), 'off');
        assert.strictEqual(normalizeBundledMetadataMode('other'), 'baseline-plus-local');

        assert.strictEqual(normalizeBundledMetadataUpdatePolicy('pinned-to-extension'), 'pinned-to-extension');
        assert.strictEqual(normalizeBundledMetadataUpdatePolicy('manual-refresh'), 'manual-refresh');
        assert.strictEqual(normalizeBundledMetadataUpdatePolicy('other'), 'pinned-to-extension');
    });

    test('reads bundled metadata settings with defaults', () => {
        const source = new Map<string, unknown>([
            ['bundledMetadata.enabled', true],
            ['bundledMetadata.mode', 'baseline-only'],
            ['bundledMetadata.updatePolicy', 'manual-refresh'],
        ]);

        const settings = readBundledMetadataSettings((key, defaultValue) => {
            return (source.has(key) ? source.get(key) : defaultValue) as typeof defaultValue;
        });

        assert.deepStrictEqual(settings, {
            enabled: true,
            mode: 'baseline-only',
            updatePolicy: 'manual-refresh',
        });
    });

    test('merges bundled layer as lowest precedence in baseline-plus-local mode', () => {
        const merged = mergeConfigWithBundledMetadata(
            {
                metadataRepo: { localPath: '.ai/meta' },
                layers: ['team/default'],
            },
            '.metaflow/system/bundled/v1',
            ['baseline'],
            'baseline-plus-local'
        );

        assert.strictEqual(merged.metadataRepos?.[0].id, BUNDLED_REPO_ID);
        assert.strictEqual(merged.layerSources?.[0].repoId, BUNDLED_REPO_ID);
        assert.strictEqual(merged.layerSources?.[0].path, 'baseline');
        assert.strictEqual(merged.layerSources?.[1].repoId, 'primary');
        assert.strictEqual(merged.layerSources?.[1].path, 'team/default');
    });

    test('replaces workspace sources in baseline-only mode', () => {
        const merged = mergeConfigWithBundledMetadata(
            {
                metadataRepos: [{ id: 'primary', localPath: '.ai/meta' }],
                layerSources: [{ repoId: 'primary', path: 'team/default' }],
                profiles: { default: {} },
                activeProfile: 'default',
            },
            '.metaflow/system/bundled/v1',
            ['baseline'],
            'baseline-only'
        );

        assert.strictEqual(merged.metadataRepos?.length, 1);
        assert.strictEqual(merged.metadataRepos?.[0].id, BUNDLED_REPO_ID);
        assert.strictEqual(merged.layerSources?.length, 1);
        assert.strictEqual(merged.layerSources?.[0].repoId, BUNDLED_REPO_ID);
        assert.strictEqual(merged.activeProfile, 'default');
    });

    test('materializes bundled metadata assets into workspace managed directory', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-bundled-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const workspaceRoot = path.join(tempRoot, 'workspace');

        fs.mkdirSync(path.join(extensionPath, 'assets', 'bundled-metadata', 'baseline', '.github', 'instructions'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(extensionPath, 'assets', 'bundled-metadata', 'baseline', '.github', 'instructions', 'default.instructions.md'),
            '# baseline\n',
            'utf-8'
        );
        fs.mkdirSync(workspaceRoot, { recursive: true });

        const firstRun = await materializeBundledMetadata({
            workspaceRoot,
            extensionPath,
            extensionVersion: '1.2.3',
            updatePolicy: 'manual-refresh',
        });

        assert.ok(firstRun);
        assert.strictEqual(firstRun?.updated, true);
        assert.ok((firstRun?.layerPaths ?? []).includes('baseline'));

        const targetFile = path.join(
            workspaceRoot,
            '.metaflow',
            'system',
            'bundled',
            '1.2.3',
            'baseline',
            '.github',
            'instructions',
            'default.instructions.md'
        );
        fs.writeFileSync(targetFile, '# local change\n', 'utf-8');

        const secondRun = await materializeBundledMetadata({
            workspaceRoot,
            extensionPath,
            extensionVersion: '1.2.3',
            updatePolicy: 'manual-refresh',
        });

        assert.strictEqual(secondRun?.updated, false);
        assert.strictEqual(fs.readFileSync(targetFile, 'utf-8'), '# local change\n');

        const forcedRun = await materializeBundledMetadata({
            workspaceRoot,
            extensionPath,
            extensionVersion: '1.2.3',
            updatePolicy: 'manual-refresh',
            forceRefresh: true,
        });

        assert.strictEqual(forcedRun?.updated, true);
        assert.strictEqual(fs.readFileSync(targetFile, 'utf-8'), '# baseline\n');

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });
});
