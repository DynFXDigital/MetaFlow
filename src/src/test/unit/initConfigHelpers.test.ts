import * as assert from 'assert';
import {
    toPosixPath,
    layerSort,
    sanitizeRepoName,
    toConfigLocalPath,
    buildConfig,
    detectMetaflowGitIgnoreMode,
    ensureMetaflowGitIgnoreEntry,
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
        assert.strictEqual(sanitizeRepoName('https://github.com/org/My Repo.git'), 'my-repo');
        assert.strictEqual(sanitizeRepoName('  https://x/y/z/  '), 'z');
        assert.strictEqual(sanitizeRepoName('https://x/y/###/'), 'metadata');
        assert.strictEqual(sanitizeRepoName(''), 'metadata');
    });

    test('toConfigLocalPath returns relative path when inside workspace', () => {
        const value = toConfigLocalPath(
            'C:/workspace/project',
            'C:/workspace/project/.ai/metadata',
        );
        assert.strictEqual(value, '.ai/metadata');
    });

    test('toConfigLocalPath returns absolute path when outside workspace', () => {
        const outside = toConfigLocalPath('C:/workspace/project', 'D:/other/location');
        assert.strictEqual(outside, 'D:/other/location');
    });

    test('buildConfig includes required defaults and optional URL', () => {
        const withUrl = buildConfig(
            '.ai/metadata',
            ['company'],
            'https://github.com/org/meta.git',
        ) as {
            metadataRepos: Array<{
                id: string;
                name: string;
                localPath: string;
                url?: string;
                enabled?: boolean;
                capabilities?: Array<{ path: string; enabled?: boolean }>;
            }>;
            activeProfile: string;
            profiles: Record<string, unknown>;
            injection: Record<string, string>;
        };

        assert.strictEqual(withUrl.metadataRepos.length, 1);
        assert.strictEqual(withUrl.metadataRepos[0].id, 'primary');
        assert.strictEqual(withUrl.metadataRepos[0].localPath, '.ai/metadata');
        assert.strictEqual(withUrl.metadataRepos[0].url, 'https://github.com/org/meta.git');
        assert.strictEqual(withUrl.metadataRepos[0].enabled, true);
        assert.strictEqual(withUrl.metadataRepos[0].capabilities?.length, 1);
        assert.strictEqual(withUrl.metadataRepos[0].capabilities?.[0].path, 'company');
        assert.strictEqual(withUrl.metadataRepos[0].capabilities?.[0].enabled, false);
        assert.strictEqual(withUrl.activeProfile, 'default');
        assert.ok(withUrl.profiles.default);
        assert.deepStrictEqual(withUrl.profiles.default, {
            displayName: 'Default',
            enable: ['**/*'],
            disable: [],
        });
        assert.strictEqual(withUrl.injection.instructions, 'settings');

        const withoutUrl = buildConfig('.ai/metadata', ['company']) as {
            metadataRepos: Array<{ url?: string; capabilities?: Array<{ enabled?: boolean }> }>;
        };
        assert.strictEqual(withoutUrl.metadataRepos[0].url, undefined);
        assert.strictEqual(withoutUrl.metadataRepos[0].capabilities?.[0].enabled, false);
    });

    test('detectMetaflowGitIgnoreMode identifies supported ignore flavors', () => {
        assert.strictEqual(detectMetaflowGitIgnoreMode(''), 'none');
        assert.strictEqual(detectMetaflowGitIgnoreMode('.metaflow/\n'), 'directory');
        assert.strictEqual(detectMetaflowGitIgnoreMode('/.metaflow/state.json\n'), 'stateFile');
        assert.strictEqual(
            detectMetaflowGitIgnoreMode('.metaflow/\n.metaflow/state.json\n'),
            'both',
        );
        assert.strictEqual(detectMetaflowGitIgnoreMode('# .metaflow/\n'), 'none');
    });

    test('ensureMetaflowGitIgnoreEntry appends only when missing', () => {
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry('', 'directory'),
            '# MetaFlow managed state (choose one rule):\n' +
                '# Track .metaflow/config.jsonc; ignore .metaflow/state.json, or ignore .metaflow/ for local-only setup.\n' +
                '.metaflow/\n',
        );
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry('node_modules/\n', 'stateFile'),
            'node_modules/\n' +
                '# MetaFlow managed state (choose one rule):\n' +
                '# Track .metaflow/config.jsonc; ignore .metaflow/state.json, or ignore .metaflow/ for local-only setup.\n' +
                '.metaflow/state.json\n',
        );
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry('.metaflow/state.json\n', 'stateFile'),
            '.metaflow/state.json\n',
        );

        const withComment =
            '# MetaFlow managed state (choose one rule):\n' +
            '# Track .metaflow/config.jsonc; ignore .metaflow/state.json, or ignore .metaflow/ for local-only setup.\n' +
            'node_modules/\n';
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry(withComment, 'directory'),
            `${withComment}.metaflow/\n`,
        );
    });

    test('ensureMetaflowGitIgnoreEntry returns unchanged when directory mode already covered', () => {
        // directory entry already present
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry('.metaflow/\n', 'directory'),
            '.metaflow/\n',
        );
        // both entries present — directory request is a no-op
        assert.strictEqual(
            ensureMetaflowGitIgnoreEntry('.metaflow/\n.metaflow/state.json\n', 'directory'),
            '.metaflow/\n.metaflow/state.json\n',
        );
    });

    test('ensureMetaflowGitIgnoreEntry inserts trailing newline before appending when content lacks one', () => {
        const result = ensureMetaflowGitIgnoreEntry('node_modules', 'stateFile');
        assert.ok(
            result.startsWith('node_modules\n'),
            'should add newline after content without trailing newline',
        );
        assert.ok(result.endsWith('.metaflow/state.json\n'), 'should append state-file entry');
    });
});
