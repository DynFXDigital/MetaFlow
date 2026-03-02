import * as assert from 'assert';
import * as path from 'path';
import {
    GitCommandResult,
    GitRunner,
    RepoSyncSource,
    collectRepoSyncStatuses,
    probeRepoSyncStatus,
    pullRepoFastForward,
    summarizeRepoSyncStatuses,
} from '../../commands/repoSync';

function createResult(ok: boolean, stdout = '', stderr = '', errorMessage?: string): GitCommandResult {
    return { ok, stdout, stderr, errorMessage };
}

suite('repoSync', () => {
    const workspaceRoot = path.join('C:', 'workspace');
    const source: RepoSyncSource = {
        id: 'primary',
        name: 'primary',
        localPath: '.ai/metadata',
        enabled: true,
        url: 'https://github.com/example/ai-metadata.git',
    };

    test('probeRepoSyncStatus returns non-git status when repository check fails', async () => {
        const runner: GitRunner = async (args: string[]) => {
            assert.deepStrictEqual(args, ['rev-parse', '--is-inside-work-tree']);
            return createResult(false, '', 'fatal: not a git repository', 'not a git repo');
        };

        const status = await probeRepoSyncStatus(workspaceRoot, source, runner);

        assert.strictEqual(status.repoId, 'primary');
        assert.strictEqual(status.isGitRepo, false);
        assert.strictEqual(status.hasLocalChanges, false);
        assert.strictEqual(status.updatesAvailable, false);
    });

    test('probeRepoSyncStatus computes dirty and ahead/behind indicators', async () => {
        const responses = new Map<string, GitCommandResult>([
            ['rev-parse --is-inside-work-tree', createResult(true, 'true\n')],
            ['status --porcelain', createResult(true, ' M README.md\n')],
            ['rev-parse --abbrev-ref --symbolic-full-name @{u}', createResult(true, 'origin/main\n')],
            ['rev-list --left-right --count HEAD...@{u}', createResult(true, '2\t3\n')],
        ]);

        const runner: GitRunner = async (args: string[]) => {
            const key = args.join(' ');
            const result = responses.get(key);
            if (!result) {
                throw new Error(`unexpected git call: ${key}`);
            }
            return result;
        };

        const status = await probeRepoSyncStatus(workspaceRoot, source, runner);

        assert.strictEqual(status.isGitRepo, true);
        assert.strictEqual(status.hasLocalChanges, true);
        assert.strictEqual(status.hasUpstream, true);
        assert.strictEqual(status.ahead, 2);
        assert.strictEqual(status.behind, 3);
        assert.strictEqual(status.updatesAvailable, true);
        assert.strictEqual(status.pushable, true);
    });

    test('collectRepoSyncStatuses aggregates by repo id and summarize counts', async () => {
        const runner: GitRunner = async (args: string[], cwd: string) => {
            if (cwd.endsWith(path.join('.ai', 'metadata-two'))) {
                if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
                    return createResult(true, 'true\n');
                }
                if (args[0] === 'status') {
                    return createResult(true, '');
                }
                if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
                    return createResult(true, 'origin/main\n');
                }
                return createResult(true, '0\t1\n');
            }

            if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
                return createResult(true, 'true\n');
            }
            if (args[0] === 'status') {
                return createResult(true, ' M file\n');
            }
            if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
                return createResult(true, 'origin/main\n');
            }
            return createResult(true, '1\t0\n');
        };

        const statuses = await collectRepoSyncStatuses(workspaceRoot, [
            source,
            {
                id: 'secondary',
                name: 'secondary',
                localPath: '.ai/metadata-two',
                enabled: true,
            },
        ], runner);

        assert.strictEqual(Object.keys(statuses).length, 2);
        const summary = summarizeRepoSyncStatuses(statuses);
        assert.deepStrictEqual(summary, {
            dirtyCount: 1,
            updatesCount: 1,
            pushableCount: 1,
        });
    });

    test('pullRepoFastForward uses ff-only pull', async () => {
        let observedArgs: string[] | undefined;
        let observedCwd: string | undefined;

        const runner: GitRunner = async (args: string[], cwd: string) => {
            observedArgs = args;
            observedCwd = cwd;
            return createResult(true, 'Already up to date.\n');
        };

        const result = await pullRepoFastForward(workspaceRoot, source, runner);

        assert.strictEqual(result.ok, true);
        assert.deepStrictEqual(observedArgs, ['pull', '--ff-only']);
        assert.strictEqual(observedCwd, path.join(workspaceRoot, '.ai', 'metadata'));
    });
});
