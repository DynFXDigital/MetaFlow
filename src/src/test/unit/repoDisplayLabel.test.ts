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

    test('uses configured name when it matches the repo id', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel(
                'repo-id',
                '  repo-id  ',
                '/workspace/repo-id',
                'Manifest Repo',
            ),
            'repo-id',
        );
    });

    test('prefers the stable repo id over the local path basename', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel('repo-id', undefined, '/workspace/repo-name///', '   '),
            'repo-id',
        );
    });

    test('falls back to the local path basename only when no repo id is available', () => {
        assert.strictEqual(
            resolveRepoDisplayLabel('', undefined, '/workspace/repo-name///', undefined),
            'repo-name',
        );
        assert.strictEqual(resolveRepoDisplayLabel('', undefined, '////', '   '), '');
    });
});
