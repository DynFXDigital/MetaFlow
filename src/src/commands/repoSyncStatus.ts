import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
export const GIT_COMMAND_TIMEOUT_MS = 20000;
export const GIT_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;

export type RepoSyncState = 'upToDate' | 'behind' | 'ahead' | 'diverged' | 'unknown';

export interface RepoSyncStatus {
    state: RepoSyncState;
    aheadCount?: number;
    behindCount?: number;
    trackingRef?: string;
    lastCheckedAt: string;
    error?: string;
}

export interface GitCommandResult {
    stdout: string;
    stderr: string;
}

export type GitCommandRunner = (repoRoot: string, args: string[]) => Promise<GitCommandResult>;

export interface CheckRepoSyncResult {
    kind: 'status' | 'nonGit';
    status?: RepoSyncStatus;
    reason?: string;
}

export interface PullRepoResult {
    ok: boolean;
    message: string;
}

function trimOutput(value: string): string {
    return value.trim();
}

function normalizeGitError(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
        const message = (err as { message?: unknown }).message;
        const stderr = (err as { stderr?: unknown }).stderr;
        const code = (err as { code?: unknown }).code;

        if (code === 'ENOENT') {
            return 'Git CLI is not available in PATH.';
        }

        if (typeof stderr === 'string' && trimOutput(stderr).length > 0) {
            return trimOutput(stderr);
        }

        if (typeof message === 'string' && trimOutput(message).length > 0) {
            return trimOutput(message);
        }
    }

    return String(err);
}

export async function runGitCommand(repoRoot: string, args: string[]): Promise<GitCommandResult> {
    const result = await execFileAsync('git', args, {
        cwd: repoRoot,
        windowsHide: true,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        maxBuffer: GIT_COMMAND_MAX_BUFFER_BYTES,
    });
    return {
        stdout: result.stdout,
        stderr: result.stderr,
    };
}

export function classifyAheadBehind(aheadCount: number, behindCount: number): RepoSyncState {
    if (aheadCount > 0 && behindCount > 0) {
        return 'diverged';
    }
    if (behindCount > 0) {
        return 'behind';
    }
    if (aheadCount > 0) {
        return 'ahead';
    }
    return 'upToDate';
}

export function parseAheadBehindCounts(rawValue: string): {
    behindCount: number;
    aheadCount: number;
} {
    const trimmed = trimOutput(rawValue);
    const match = trimmed.match(/^(\d+)\s+(\d+)$/);
    if (!match) {
        throw new Error(`Unexpected git rev-list output: ${trimmed || '(empty)'}`);
    }

    return {
        behindCount: Number.parseInt(match[1], 10),
        aheadCount: Number.parseInt(match[2], 10),
    };
}

export async function checkRepoSyncStatus(
    repoRoot: string,
    runner: GitCommandRunner = runGitCommand,
    options?: { fetch?: boolean },
): Promise<CheckRepoSyncResult> {
    const lastCheckedAt = new Date().toISOString();

    try {
        const insideWorkTree = trimOutput(
            (await runner(repoRoot, ['rev-parse', '--is-inside-work-tree'])).stdout,
        );
        if (insideWorkTree !== 'true') {
            return { kind: 'nonGit', reason: 'Path is not a git working tree.' };
        }
    } catch (err: unknown) {
        const normalized = normalizeGitError(err);
        if (normalized.toLowerCase().includes('not a git repository')) {
            return { kind: 'nonGit', reason: 'Path is not a git repository.' };
        }

        return {
            kind: 'status',
            status: {
                state: 'unknown',
                lastCheckedAt,
                error: normalized,
            },
        };
    }

    let trackingRef: string | undefined;
    try {
        trackingRef = trimOutput(
            (
                await runner(repoRoot, [
                    'rev-parse',
                    '--abbrev-ref',
                    '--symbolic-full-name',
                    '@{upstream}',
                ])
            ).stdout,
        );
        if (!trackingRef) {
            throw new Error('No upstream tracking branch is configured for this repository.');
        }
    } catch (err: unknown) {
        return {
            kind: 'status',
            status: {
                state: 'unknown',
                lastCheckedAt,
                error: normalizeGitError(err),
            },
        };
    }

    try {
        if (options?.fetch !== false) {
            await runner(repoRoot, ['fetch', '--prune']);
        }

        const revList = await runner(repoRoot, [
            'rev-list',
            '--left-right',
            '--count',
            '@{upstream}...HEAD',
        ]);
        const counts = parseAheadBehindCounts(revList.stdout);
        return {
            kind: 'status',
            status: {
                state: classifyAheadBehind(counts.aheadCount, counts.behindCount),
                aheadCount: counts.aheadCount,
                behindCount: counts.behindCount,
                trackingRef,
                lastCheckedAt,
            },
        };
    } catch (err: unknown) {
        return {
            kind: 'status',
            status: {
                state: 'unknown',
                trackingRef,
                lastCheckedAt,
                error: normalizeGitError(err),
            },
        };
    }
}

export function mapPullFailureMessage(rawError: string): string {
    const lowered = rawError.toLowerCase();
    if (
        lowered.includes('not possible to fast-forward') ||
        lowered.includes('divergent branches')
    ) {
        return 'Pull requires manual reconciliation because local and upstream history diverged.';
    }
    if (lowered.includes('no tracking information')) {
        return 'No upstream tracking branch is configured. Set upstream first, then retry pull.';
    }
    if (lowered.includes('not a git repository')) {
        return 'Repository path is not a git repository.';
    }
    if (
        lowered.includes('could not read from remote repository') ||
        lowered.includes('authentication failed')
    ) {
        return 'Unable to access remote repository. Verify network and authentication, then retry.';
    }
    return rawError;
}

export async function pullRepositoryFastForward(
    repoRoot: string,
    runner: GitCommandRunner = runGitCommand,
): Promise<PullRepoResult> {
    try {
        const result = await runner(repoRoot, ['pull', '--ff-only']);
        const output = trimOutput(`${result.stdout}\n${result.stderr}`);
        const message = output.length > 0 ? output : 'Fast-forward pull completed.';
        return {
            ok: true,
            message,
        };
    } catch (err: unknown) {
        const normalized = normalizeGitError(err);
        return {
            ok: false,
            message: mapPullFailureMessage(normalized),
        };
    }
}
