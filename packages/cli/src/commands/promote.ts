import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Command } from 'commander';
import {
    checkAllDrift,
    loadManagedState,
    loadConfig,
    normalizeInputPath,
    stripProvenanceHeader,
} from '@metaflow/engine';
import { getWorkspaceRoot } from './common';

// ── Auto-promotion helpers ─────────────────────────────────────────

function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
}

function isGitRepo(dir: string): boolean {
    try {
        git(dir, ['rev-parse', '--is-inside-work-tree']);
        return true;
    } catch {
        return false;
    }
}

function isSafeRelativePath(relativePath: string): boolean {
    const normalized = normalizeInputPath(relativePath);
    if (!normalized || normalized === '.' || path.posix.isAbsolute(normalized)) {
        return false;
    }

    return !normalized.split('/').some((segment) => segment === '..');
}

export interface PromoteAutoResult {
    branch: string;
    filesPromoted: string[];
    committed: boolean;
    error?: string;
}

/**
 * Automated promotion: copies drifted Synchronized files back to the
 * metadata repo, optionally on a new branch, and commits.
 */
export function promoteAuto(
    workspaceRoot: string,
    options: { branch?: string; layer?: string; message?: string; noBranch?: boolean },
): PromoteAutoResult {
    const state = loadManagedState(workspaceRoot);
    const tracked = Object.keys(state.files);

    if (tracked.length === 0) {
        return {
            branch: '',
            filesPromoted: [],
            committed: false,
            error: 'No managed files to check.',
        };
    }

    const drift = checkAllDrift(workspaceRoot, '.github', state);
    const drifted = drift.filter((d) => d.status === 'drifted');

    if (drifted.length === 0) {
        return {
            branch: '',
            filesPromoted: [],
            committed: false,
            error: 'No drifted files to promote.',
        };
    }

    // Find the metadata repo
    const configResult = loadConfig(workspaceRoot);
    if (!configResult.ok) {
        return { branch: '', filesPromoted: [], committed: false, error: 'Cannot load config.' };
    }
    const sourceRepoIds = new Set(
        drifted
            .map((entry) => state.files[entry.relativePath]?.sourceRepo)
            .filter((value): value is string => Boolean(value)),
    );

    if (sourceRepoIds.size > 1) {
        return {
            branch: '',
            filesPromoted: [],
            committed: false,
            error: 'Automatic promotion across multiple metadata repositories is not supported. Promote one repo at a time.',
        };
    }

    const sourceRepoId = sourceRepoIds.size === 1 ? Array.from(sourceRepoIds)[0] : undefined;
    const repoLocalPath =
        configResult.config.metadataRepo?.localPath ??
        configResult.config.metadataRepos?.find((repo) => repo.id === (sourceRepoId ?? 'primary'))
            ?.localPath ??
        (configResult.config.metadataRepos?.length === 1
            ? configResult.config.metadataRepos[0].localPath
            : undefined);
    if (!repoLocalPath) {
        return {
            branch: '',
            filesPromoted: [],
            committed: false,
            error: 'Cannot determine metadata repo path.',
        };
    }
    const repoPath = path.resolve(workspaceRoot, normalizeInputPath(repoLocalPath));

    if (!isGitRepo(repoPath)) {
        return {
            branch: '',
            filesPromoted: [],
            committed: false,
            error: `Metadata repo at ${repoPath} is not a git repository.`,
        };
    }

    // Generate branch name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const branchName = options.branch ?? `promote/${timestamp}`;

    const filesPromoted: string[] = [];

    try {
        // Create branch (unless --no-branch)
        if (!options.noBranch) {
            git(repoPath, ['checkout', '-b', branchName]);
        }

        // Copy drifted files back to their source layer in the metadata repo
        for (const d of drifted) {
            const sourceLayer = options.layer ?? state.files[d.relativePath]?.sourceLayer;
            if (!sourceLayer) {
                continue;
            }

            const sourceRelativePath = normalizeInputPath(
                state.files[d.relativePath]?.sourceRelativePath ?? d.relativePath,
            );
            if (!isSafeRelativePath(sourceRelativePath)) {
                continue;
            }

            const sourceRepo = state.files[d.relativePath]?.sourceRepo;
            const resolvedLayerPath =
                sourceRepo && sourceLayer.startsWith(`${sourceRepo}/`)
                    ? sourceLayer.slice(sourceRepo.length + 1)
                    : sourceLayer;

            const synchronizedPath = path.join(workspaceRoot, '.github', d.relativePath);
            const synchronizedContent = fs.readFileSync(synchronizedPath, 'utf-8');
            const cleanContent = stripProvenanceHeader(synchronizedContent);

            const targetPath = path.join(repoPath, resolvedLayerPath, sourceRelativePath);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, cleanContent, 'utf-8');
            filesPromoted.push(d.relativePath);
        }

        if (filesPromoted.length === 0) {
            return {
                branch: branchName,
                filesPromoted: [],
                committed: false,
                error: 'No files could be promoted (missing source metadata).',
            };
        }

        // Stage and commit
        git(repoPath, ['add', '.']);
        const commitMessage =
            options.message ?? `chore: promote ${filesPromoted.length} drifted file(s)`;
        git(repoPath, ['commit', '-m', commitMessage]);

        return { branch: branchName, filesPromoted, committed: true };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { branch: branchName, filesPromoted, committed: false, error: msg };
    }
}

// ── Command registration ───────────────────────────────────────────

export function registerPromoteCommand(program: Command): void {
    program
        .command('promote')
        .description('Detect locally modified Synchronized files, or auto-promote them')
        .option('--auto', 'Create branch and commit drifted files to metadata repo')
        .option('--branch <name>', 'Branch name for --auto promotion')
        .option(
            '--layer <path>',
            'Target layer path for --auto promotion (overrides auto-detection)',
        )
        .option('--message <msg>', 'Commit message for --auto promotion')
        .option('--no-branch', 'Skip branch creation, commit on current branch')
        .option('--json', 'Output as JSON (--auto mode only)')
        .action(
            (options: {
                auto?: boolean;
                branch?: string;
                layer?: string;
                message?: string;
                noBranch?: boolean;
                json?: boolean;
            }) => {
                const workspaceRoot = getWorkspaceRoot(program);

                if (options.auto) {
                    const result = promoteAuto(workspaceRoot, {
                        branch: options.branch,
                        layer: options.layer,
                        message: options.message,
                        noBranch: options.noBranch,
                    });

                    if (options.json) {
                        console.log(JSON.stringify(result, null, 2));
                        if (result.error) {
                            process.exitCode = 1;
                        }
                        return;
                    }

                    if (result.error) {
                        console.error(result.error);
                        process.exitCode = 1;
                        return;
                    }
                    console.log(`Created branch: ${result.branch}`);
                    console.log(`Promoted ${result.filesPromoted.length} file(s):`);
                    for (const f of result.filesPromoted) {
                        console.log(`  ${f}`);
                    }
                    if (result.committed) {
                        console.log('Changes committed to metadata repo.');
                    }
                    return;
                }

                // Standard mode: just detect drift
                const state = loadManagedState(workspaceRoot);
                const tracked = Object.keys(state.files);

                if (tracked.length === 0) {
                    console.log('No managed files to check.');
                    return;
                }

                const drift = checkAllDrift(workspaceRoot, '.github', state);
                const drifted = drift.filter((d) => d.status === 'drifted');

                if (drifted.length === 0) {
                    console.log('No locally modified files detected.');
                    return;
                }

                console.log(`Found ${drifted.length} locally modified file(s):`);
                for (const d of drifted) {
                    console.log(`  ${d.relativePath}`);
                }

                process.exitCode = 2;
            },
        );
}
