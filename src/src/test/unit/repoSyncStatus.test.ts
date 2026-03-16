import * as assert from 'assert';
import {
    classifyAheadBehind,
    parseAheadBehindCounts,
    checkRepoSyncStatus,
    GIT_COMMAND_MAX_BUFFER_BYTES,
    GIT_COMMAND_TIMEOUT_MS,
    mapPullFailureMessage,
    pullRepositoryFastForward,
    GitCommandResult,
} from '../../commands/repoSyncStatus';

type Step = {
    match: string;
    result?: GitCommandResult;
    error?: unknown;
};

function createRunner(steps: Step[]) {
    let index = 0;
    return async (_repoRoot: string, args: string[]): Promise<GitCommandResult> => {
        if (index >= steps.length) {
            throw new Error(`Unexpected git args: ${args.join(' ')}`);
        }

        const step = steps[index++];
        const rendered = args.join(' ');
        assert.ok(
            rendered.includes(step.match),
            `Expected git args to include "${step.match}", got "${rendered}"`,
        );

        if (step.error) {
            throw step.error;
        }

        return step.result ?? { stdout: '', stderr: '' };
    };
}

suite('repoSyncStatus helpers', () => {
    test('exports explicit git execution limits', () => {
        assert.strictEqual(GIT_COMMAND_TIMEOUT_MS, 20000);
        assert.strictEqual(GIT_COMMAND_MAX_BUFFER_BYTES, 1024 * 1024);
    });

    test('classifyAheadBehind maps counts to state', () => {
        assert.strictEqual(classifyAheadBehind(0, 0), 'upToDate');
        assert.strictEqual(classifyAheadBehind(0, 2), 'behind');
        assert.strictEqual(classifyAheadBehind(3, 0), 'ahead');
        assert.strictEqual(classifyAheadBehind(1, 1), 'diverged');
    });

    test('parseAheadBehindCounts parses rev-list output', () => {
        assert.deepStrictEqual(parseAheadBehindCounts('4 2'), { behindCount: 4, aheadCount: 2 });
        assert.throws(() => parseAheadBehindCounts('invalid'), /Unexpected git rev-list output/);
    });

    test('checkRepoSyncStatus returns nonGit when path is not a repository', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    error: {
                        stderr: 'fatal: not a git repository (or any of the parent directories): .git',
                    },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'nonGit');
        assert.ok(result.reason?.includes('not a git repository'));
    });

    test('checkRepoSyncStatus returns unknown when upstream is missing', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    result: { stdout: 'true\n', stderr: '' },
                },
                {
                    match: 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
                    error: { stderr: 'fatal: no upstream configured for branch main' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.ok(result.status?.error?.includes('no upstream'));
    });

    test('checkRepoSyncStatus returns behind state and counts', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    result: { stdout: 'true\n', stderr: '' },
                },
                {
                    match: 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
                    result: { stdout: 'origin/main\n', stderr: '' },
                },
                {
                    match: 'fetch --prune',
                    result: { stdout: '', stderr: '' },
                },
                {
                    match: 'rev-list --left-right --count @{upstream}...HEAD',
                    result: { stdout: '3 0\n', stderr: '' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'behind');
        assert.strictEqual(result.status?.behindCount, 3);
        assert.strictEqual(result.status?.aheadCount, 0);
        assert.strictEqual(result.status?.trackingRef, 'origin/main');
    });

    test('mapPullFailureMessage maps common git pull errors', () => {
        assert.ok(
            mapPullFailureMessage('fatal: Not possible to fast-forward, aborting.').includes(
                'manual reconciliation',
            ),
        );
        assert.ok(
            mapPullFailureMessage(
                'There is no tracking information for the current branch.',
            ).includes('No upstream tracking branch'),
        );
        assert.ok(
            mapPullFailureMessage(
                'fatal: Authentication failed for https://example.com/repo',
            ).includes('Unable to access remote repository'),
        );
    });

    test('mapPullFailureMessage covers remaining error patterns and fallback', () => {
        // divergent branches (alternate phrase for the same fast-forward check)
        assert.ok(
            mapPullFailureMessage('hint: divergent branches abort').includes(
                'manual reconciliation',
            ),
        );
        // not a git repository
        assert.ok(
            mapPullFailureMessage('fatal: not a git repository (or any parent)').includes(
                'Repository path is not a git repository',
            ),
        );
        // could not read from remote repository (without authentication wording)
        assert.ok(
            mapPullFailureMessage('error: could not read from remote repository').includes(
                'Unable to access remote repository',
            ),
        );
        // unrecognized error falls back to the raw message
        const raw = 'some unfamiliar git error xyz';
        assert.strictEqual(mapPullFailureMessage(raw), raw);
    });

    test('checkRepoSyncStatus returns unknown when fetch or rev-list throws', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    result: { stdout: 'true\n', stderr: '' },
                },
                {
                    match: 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
                    result: { stdout: 'origin/main\n', stderr: '' },
                },
                {
                    match: 'fetch --prune',
                    error: { stderr: 'fatal: repository unreachable' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.ok(result.status?.error?.includes('repository unreachable'));
    });

    test('checkRepoSyncStatus returns nonGit when working-tree check returns false', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    result: { stdout: 'false\n', stderr: '' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'nonGit');
        assert.ok(result.reason?.includes('git working tree'));
    });

    test('checkRepoSyncStatus returns unknown when insideWorkTree throws a non-repository error', async () => {
        // Error with code=ENOENT covers the ENOENT branch in normalizeGitError
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    error: { code: 'ENOENT', message: 'git executable not found' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.ok(result.status?.error?.includes('Git CLI is not available'));
    });

    test('checkRepoSyncStatus normalizes error using message when stderr is absent', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    error: { message: 'unexpected failure' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.ok(result.status?.error?.includes('unexpected failure'));
    });

    test('checkRepoSyncStatus returns unknown when upstream ref stdout is empty', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    result: { stdout: 'true\n', stderr: '' },
                },
                {
                    match: 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
                    result: { stdout: '\n', stderr: '' },
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.ok(result.status?.error?.includes('No upstream'));
    });

    test('checkRepoSyncStatus normalizes string error via String() fallback', async () => {
        const result = await checkRepoSyncStatus(
            'C:/repo',
            createRunner([
                {
                    match: 'rev-parse --is-inside-work-tree',
                    // Non-object error exercises the `return String(err)` fallback in normalizeGitError
                    error: 'fatal string error',
                },
            ]),
        );

        assert.strictEqual(result.kind, 'status');
        assert.strictEqual(result.status?.state, 'unknown');
        assert.strictEqual(result.status?.error, 'fatal string error');
    });

    test('pullRepositoryFastForward returns ok=true on successful pull output', async () => {
        const result = await pullRepositoryFastForward(
            'C:/repo',
            createRunner([
                {
                    match: 'pull --ff-only',
                    result: { stdout: 'Already up to date.\n', stderr: '' },
                },
            ]),
        );

        assert.strictEqual(result.ok, true);
        assert.ok(result.message.includes('Already up to date'));
    });

    test('pullRepositoryFastForward maps failures to actionable messages', async () => {
        const result = await pullRepositoryFastForward(
            'C:/repo',
            createRunner([
                {
                    match: 'pull --ff-only',
                    error: { stderr: 'fatal: Not possible to fast-forward, aborting.' },
                },
            ]),
        );

        assert.strictEqual(result.ok, false);
        assert.ok(result.message.includes('manual reconciliation'));
    });
});
