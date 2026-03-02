import * as assert from 'assert';
import {
    toPosixPath,
    layerSort,
    sanitizeRepoName,
    toConfigLocalPath,
    buildConfig,
    shouldEnableBundledMetadataOnFirstInit,
} from '../../commands/initConfigHelpers';

suite('Init Config Helpers', () => {
    test('toPosixPath normalizes backslashes', () => {
        assert.strictEqual(toPosixPath('a\\b\\c'), 'a/b/c');
    });

    test('layerSort orders by depth then lexical value', () => {
        const values = ['team/default', '.', 'company', 'team/default/sub'];
        const sorted = [...values].sort(layerSort);

        assert.deepStrictEqual(sorted, ['.', 'company', 'team/default', 'team/default/sub']);
        assert.ok(layerSort('.', 'company') < 0);
        assert.ok(layerSort('alpha', 'beta') < 0);
    });

    test('sanitizeRepoName strips .git and normalizes symbols', () => {
        assert.strictEqual(
            sanitizeRepoName('https://github.com/org/My Repo.git'),
            'my-repo'
        );
        assert.strictEqual(sanitizeRepoName('  https://x/y/z/  '), 'z');
        assert.strictEqual(sanitizeRepoName('https://x/y/###/'), 'metadata');
        assert.strictEqual(sanitizeRepoName(''), 'metadata');
    });

    test('toConfigLocalPath returns relative path when inside workspace', () => {
        const value = toConfigLocalPath('C:/workspace/project', 'C:/workspace/project/.ai/metadata');
        assert.strictEqual(value, '.ai/metadata');
    });

    test('toConfigLocalPath returns absolute path when outside workspace', () => {
        const outside = toConfigLocalPath('C:/workspace/project', 'D:/other/location');
        assert.strictEqual(outside, 'D:/other/location');
    });

    test('buildConfig includes required defaults and optional URL', () => {
        const withUrl = buildConfig('.ai/metadata', ['company'], 'https://github.com/org/meta.git') as {
            metadataRepo: { localPath: string; url?: string };
            activeProfile: string;
            profiles: Record<string, unknown>;
            injection: Record<string, string>;
        };

        assert.strictEqual(withUrl.metadataRepo.localPath, '.ai/metadata');
        assert.strictEqual(withUrl.metadataRepo.url, 'https://github.com/org/meta.git');
        assert.strictEqual(withUrl.activeProfile, 'default');
        assert.ok(withUrl.profiles.default);
        assert.strictEqual(withUrl.injection.instructions, 'settings');

        const withoutUrl = buildConfig('.ai/metadata', ['company']) as { metadataRepo: { url?: string } };
        assert.strictEqual(withoutUrl.metadataRepo.url, undefined);
    });

    test('shouldEnableBundledMetadataOnFirstInit only enables for first init with unset setting', () => {
        assert.strictEqual(shouldEnableBundledMetadataOnFirstInit(false, undefined), true);
        assert.strictEqual(shouldEnableBundledMetadataOnFirstInit(false, true), false);
        assert.strictEqual(shouldEnableBundledMetadataOnFirstInit(false, false), false);
        assert.strictEqual(shouldEnableBundledMetadataOnFirstInit(true, undefined), false);
    });
});
