import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { apply, discoverConfigPath, loadConfig } from '@metaflow/engine';
import { getWorkspaceRoot, resolveEffectiveFiles } from './common';

/**
 * Debounce a function — only invoke after `delay` ms of inactivity.
 */
function debounce(fn: () => void, delay: number): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return () => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(fn, delay);
    };
}

export interface WatchHandle {
    /** Stop watching and clean up. */
    close(): void;
}

/**
 * Core watch logic — exported for testing.
 *
 * Watches `.ai-sync.json` and the metadata repo directory for changes.
 * On change, reloads config, resolves effective files, and applies.
 *
 * @returns A handle to stop watching.
 */
export function startWatch(
    workspaceRoot: string,
    options: { debounceMs?: number; force?: boolean; onCycle?: (result: WatchCycleResult) => void },
): WatchHandle {
    const debounceMs = options.debounceMs ?? 300;
    const force = options.force ?? false;
    const onCycle = options.onCycle;

    const watchers: fs.FSWatcher[] = [];

    function runApplyCycle(): void {
        const result: WatchCycleResult = {
            timestamp: new Date().toISOString(),
            written: 0,
            removed: 0,
            skipped: 0,
            error: undefined,
        };

        try {
            const configResult = loadConfig(workspaceRoot);
            if (!configResult.ok) {
                result.error = configResult.errors.map(e => e.message).join('; ');
                onCycle?.(result);
                return;
            }

            const files = resolveEffectiveFiles(configResult.config, workspaceRoot);
            const applyResult = apply({
                workspaceRoot,
                effectiveFiles: files,
                activeProfile: configResult.config.activeProfile,
                force,
            });

            result.written = applyResult.written.length;
            result.removed = applyResult.removed.length;
            result.skipped = applyResult.skipped.length;
        } catch (err: unknown) {
            result.error = err instanceof Error ? err.message : String(err);
        }

        onCycle?.(result);
    }

    const debouncedApply = debounce(runApplyCycle, debounceMs);

    // Watch config file
    const configPath = discoverConfigPath(workspaceRoot);
    if (configPath) {
        try {
            const watcher = fs.watch(configPath, { persistent: true }, () => {
                debouncedApply();
            });
            watchers.push(watcher);
        } catch {
            // Config file may not exist yet — skip watching it
        }
    }

    // Watch metadata repo directory (recursive)
    const configResult = loadConfig(workspaceRoot);
    if (configResult.ok) {
        const config = configResult.config;
        const repoPath = config.metadataRepo?.localPath;
        if (repoPath) {
            const absRepoPath = path.resolve(workspaceRoot, repoPath);
            if (fs.existsSync(absRepoPath)) {
                try {
                    const watcher = fs.watch(absRepoPath, { recursive: true, persistent: true }, () => {
                        debouncedApply();
                    });
                    watchers.push(watcher);
                } catch {
                    // Recursive watch not available on all platforms
                }
            }
        }

        // Also watch additional repos if multi-repo config
        if (config.metadataRepos) {
            for (const repo of config.metadataRepos) {
                if (repo.localPath) {
                    const absPath = path.resolve(workspaceRoot, repo.localPath);
                    if (fs.existsSync(absPath)) {
                        try {
                            const watcher = fs.watch(absPath, { recursive: true, persistent: true }, () => {
                                debouncedApply();
                            });
                            watchers.push(watcher);
                        } catch {
                            // Recursive watch not available on all platforms
                        }
                    }
                }
            }
        }
    }

    return {
        close() {
            for (const w of watchers) {
                w.close();
            }
            watchers.length = 0;
        },
    };
}

export interface WatchCycleResult {
    timestamp: string;
    written: number;
    removed: number;
    skipped: number;
    error: string | undefined;
}

export function registerWatchCommand(program: Command): void {
    program
        .command('watch')
        .description('Watch for config and metadata changes, auto-apply on change')
        .option('-f, --force', 'Overwrite drifted files on auto-apply')
        .option('--debounce <ms>', 'Debounce interval in milliseconds', '300')
        .action((options: { force?: boolean; debounce?: string }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const debounceMs = parseInt(options.debounce ?? '300', 10);

            // Validate config exists
            const configResult = loadConfig(workspaceRoot);
            if (!configResult.ok) {
                for (const err of configResult.errors) {
                    console.error(`Error: ${err.message}`);
                }
                process.exitCode = 1;
                return;
            }

            console.log(`Watching for changes in ${workspaceRoot} (debounce: ${debounceMs}ms)...`);
            console.log('Press Ctrl+C to stop.\n');

            // Do an initial apply
            const files = resolveEffectiveFiles(configResult.config, workspaceRoot);
            const initial = apply({
                workspaceRoot,
                effectiveFiles: files,
                activeProfile: configResult.config.activeProfile,
                force: options.force ?? false,
            });
            console.log(`Initial apply: ${initial.written.length} written, ${initial.removed.length} removed, ${initial.skipped.length} skipped.`);

            // Start watching
            startWatch(workspaceRoot, {
                debounceMs,
                force: options.force ?? false,
                onCycle(result) {
                    if (result.error) {
                        console.error(`[${result.timestamp}] Error: ${result.error}`);
                    } else {
                        console.log(
                            `[${result.timestamp}] Applied: ${result.written} written, ${result.removed} removed, ${result.skipped} skipped.`
                        );
                    }
                },
            });
        });
}
