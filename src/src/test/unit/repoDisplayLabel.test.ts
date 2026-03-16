import * as assert from 'assert';

import { resolveRepoDisplayLabel } from '../../repoDisplayLabel';

suite('repoDisplayLabel', () => {
    test('returns trimmed config name when it differs from the repo id', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel(
                'repo-id',
                '  Friendly Repo  ',
                '/workspace/repo-id',
                'Manifest',
            ),
            'Friendly Repo',
        );
    });

    test('uses trimmed manifest name when config name is blank', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel('repo-id', '   ', '/workspace/repo-id', '  Manifest Repo  '),
            'Manifest Repo',
        );
    });

    test('uses manifest name when trimmed config name matches the repo id', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel(
                'repo-id',
                '  repo-id  ',
                '/workspace/repo-id',
                'Manifest Repo',
            ),
            'Manifest Repo',
        );
    });

    test('falls back to the local path basename after trimming trailing separators', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel('repo-id', undefined, '/workspace/repo-name///', '   '),
            'repo-name',
        );
    });

    test('falls back to repo id when manifest and local path do not produce a label', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel('repo-id', undefined, undefined, undefined),
            'repo-id',
        );
        assert.strictEqual(resolveRepoDisplayLabel('repo-id', undefined, '////', '   '), 'repo-id');
    });
});
