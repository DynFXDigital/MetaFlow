import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolvePathFromWorkspace } from '@metaflow/engine';

const execFileAsync = promisify(execFile);

export interface RepoSyncSource {
    id: string;
    name: string;
    localPath: string;
    url?: string;
    enabled: boolean;
}

export interface RepoSyncStatus {
    repoId: string;
    repoName: string;
    localPath: string;
    isGitRepo: boolean;
    hasUpstream: boolean;
    hasLocalChanges: boolean;
    ahead: number;
    behind: number;
    updatesAvailable: boolean;
    pushable: boolean;
    lastError?: string;
}

export interface RepoSyncSummary {
    dirtyCount: number;
    updatesCount: number;
    pushableCount: number;
}

export interface GitCommandResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    errorMessage?: string;
}

export type GitRunner = (args: string[], cwd: string) => Promise<GitCommandResult>;

function toErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
        return String(error);
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
        return message;
    }

    return String(error);
}

export async function runGit(args: string[], cwd: string): Promise<GitCommandResult> {
    try {
        const { stdout, stderr } = await execFileAsync('git', args, {
            cwd,
            windowsHide: true,
            timeout: 20000,
            maxBuffer: 1024 * 1024,
        });

        return {
            ok: true,
            stdout,
            stderr,
        };
    } catch (error: unknown) {
        const failed = error as { stdout?: string; stderr?: string; message?: string };
        return {
            ok: false,
            stdout: typeof failed.stdout === 'string' ? failed.stdout : '',
            stderr: typeof failed.stderr === 'string' ? failed.stderr : '',
            errorMessage: toErrorMessage(error),
        };
    }
}

function createEmptyStatus(source: RepoSyncSource): RepoSyncStatus {
    return {
        repoId: source.id,
        repoName: source.name,
        localPath: source.localPath,
        isGitRepo: false,
        hasUpstream: false,
        hasLocalChanges: false,
        ahead: 0,
        behind: 0,
        updatesAvailable: false,
        pushable: false,
    };
}

function parseAheadBehind(raw: string): { ahead: number; behind: number } {
    const [aheadRaw, behindRaw] = raw.trim().split(/\s+/);
    const ahead = Number.parseInt(aheadRaw ?? '0', 10);
    const behind = Number.parseInt(behindRaw ?? '0', 10);
    return {
        ahead: Number.isFinite(ahead) ? ahead : 0,
        behind: Number.isFinite(behind) ? behind : 0,
    };
}

export async function probeRepoSyncStatus(
    workspaceRoot: string,
    source: RepoSyncSource,
    gitRunner: GitRunner = runGit,
): Promise<RepoSyncStatus> {
    const status = createEmptyStatus(source);
    const repoRoot = resolvePathFromWorkspace(workspaceRoot, source.localPath);

    const isRepoResult = await gitRunner(['rev-parse', '--is-inside-work-tree'], repoRoot);
    if (!isRepoResult.ok || isRepoResult.stdout.trim() !== 'true') {
        status.lastError = isRepoResult.errorMessage;
        return status;
    }

    status.isGitRepo = true;

    const dirtyResult = await gitRunner(['status', '--porcelain'], repoRoot);
    if (!dirtyResult.ok) {
        status.lastError = dirtyResult.errorMessage;
        return status;
    }
    status.hasLocalChanges = dirtyResult.stdout.trim().length > 0;

    const upstreamResult = await gitRunner(
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
        repoRoot,
    );
    if (!upstreamResult.ok) {
        status.lastError = upstreamResult.errorMessage;
        return status;
    }

    status.hasUpstream = true;

    const countsResult = await gitRunner(
        ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
        repoRoot,
    );
    if (!countsResult.ok) {
        status.lastError = countsResult.errorMessage;
        return status;
    }

    const counts = parseAheadBehind(countsResult.stdout);
    status.ahead = counts.ahead;
    status.behind = counts.behind;
    status.updatesAvailable = counts.behind > 0;
    status.pushable = counts.ahead > 0;

    return status;
}

export async function collectRepoSyncStatuses(
    workspaceRoot: string,
    sources: RepoSyncSource[],
    gitRunner: GitRunner = runGit,
): Promise<Record<string, RepoSyncStatus>> {
    const results: Record<string, RepoSyncStatus> = {};
    for (const source of sources) {
        results[source.id] = await probeRepoSyncStatus(workspaceRoot, source, gitRunner);
    }
    return results;
}

export function summarizeRepoSyncStatuses(
    statuses: Record<string, RepoSyncStatus>,
): RepoSyncSummary {
    let dirtyCount = 0;
    let updatesCount = 0;
    let pushableCount = 0;

    for (const status of Object.values(statuses)) {
        if (status.hasLocalChanges) {
            dirtyCount += 1;
        }
        if (status.updatesAvailable) {
            updatesCount += 1;
        }
        if (status.pushable) {
            pushableCount += 1;
        }
    }

    return { dirtyCount, updatesCount, pushableCount };
}

export async function pullRepoFastForward(
    workspaceRoot: string,
    source: RepoSyncSource,
    gitRunner: GitRunner = runGit,
): Promise<GitCommandResult> {
    const repoRoot = resolvePathFromWorkspace(workspaceRoot, source.localPath);
    return gitRunner(['pull', '--ff-only'], repoRoot);
}
