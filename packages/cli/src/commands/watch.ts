import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
    apply,
    applyPiProjectPluginSynchronization,
    discoverConfigPath,
    loadConfig,
    normalizeInputPath,
    isPiTargetEnabled,
    withRootSynchronizationAuthorization,
} from '@metaflow/engine';
import {
    formatPiTargetDiagnostics,
    getWorkspaceRoot,
    resolvePiTargetPlan,
    resolveWorkspaceArtifacts,
} from './common';

function applyWorkspaceTargets(
    workspaceRoot: string,
    configPath: string,
    config: Parameters<typeof resolveWorkspaceArtifacts>[0],
    migrationRequired: boolean,
    authorization: Parameters<typeof apply>[0]['rootSynchronizationAuthorization'],
    force: boolean,
) {
    const resolved = resolveWorkspaceArtifacts(config, workspaceRoot);
    const piPlan = resolvePiTargetPlan(config, workspaceRoot, resolved.layers);
    if (piPlan.blocked) {
        throw new Error(formatPiTargetDiagnostics(piPlan).join('; '));
    }
    const pi = applyPiProjectPluginSynchronization({
        workspaceRoot,
        enabled: isPiTargetEnabled(config),
        ...(piPlan.projection ? { projection: piPlan.projection } : {}),
    });
    if (pi.plan.blocked) {
        throw new Error(formatPiTargetDiagnostics(pi.plan).join('; '));
    }
    const synchronization = apply({
        workspaceRoot,
        effectiveFiles: resolved.effectiveFiles,
        activeProfile: config.activeProfile,
        fileNamingStrategy: config.fileNamingStrategy,
        layerSources: config.layerSources,
        synchronizationPolicy:
            !migrationRequired && config.synchronization?.repoWideCopilotInstructions === true,
        rootSynchronizationAuthorization: authorization,
        rootSynchronizationConfigPath: configPath,
        force,
    });
    return { synchronization, pi };
}

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
 * Watches `.metaflow/config.jsonc` and metadata repo directories for changes.
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
                result.error = configResult.errors.map((e) => e.message).join('; ');
                onCycle?.(result);
                return;
            }

            const applyResult = withRootSynchronizationAuthorization(
                configResult.configPath!,
                (authorization, attested) => {
                    return applyWorkspaceTargets(
                        workspaceRoot,
                        configResult.configPath!,
                        attested.config,
                        attested.migrationRequired === true,
                        authorization,
                        force,
                    );
                },
            );

            result.written =
                applyResult.synchronization.written.length + applyResult.pi.written.length;
            result.removed =
                applyResult.synchronization.removed.length + applyResult.pi.removed.length;
            result.skipped = applyResult.synchronization.skipped.length;
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
            const absRepoPath = path.resolve(workspaceRoot, normalizeInputPath(repoPath));
            if (fs.existsSync(absRepoPath)) {
                try {
                    const watcher = fs.watch(
                        absRepoPath,
                        { recursive: true, persistent: true },
                        () => {
                            debouncedApply();
                        },
                    );
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
                    const absPath = path.resolve(workspaceRoot, normalizeInputPath(repo.localPath));
                    if (fs.existsSync(absPath)) {
                        try {
                            const watcher = fs.watch(
                                absPath,
                                { recursive: true, persistent: true },
                                () => {
                                    debouncedApply();
                                },
                            );
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
            try {
                const initial = withRootSynchronizationAuthorization(
                    configResult.configPath!,
                    (authorization, attested) => {
                        return applyWorkspaceTargets(
                            workspaceRoot,
                            configResult.configPath!,
                            attested.config,
                            attested.migrationRequired === true,
                            authorization,
                            options.force ?? false,
                        );
                    },
                );
                console.log(
                    `Initial apply: ${initial.synchronization.written.length} written, ${initial.synchronization.removed.length} removed, ${initial.synchronization.skipped.length} skipped; Pi ${initial.pi.written.length} written, ${initial.pi.removed.length} removed.`,
                );
            } catch (err: unknown) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exitCode = 1;
                return;
            }

            // Start watching
            startWatch(workspaceRoot, {
                debounceMs,
                force: options.force ?? false,
                onCycle(result) {
                    if (result.error) {
                        console.error(`[${result.timestamp}] Error: ${result.error}`);
                    } else {
                        console.log(
                            `[${result.timestamp}] Applied: ${result.written} written, ${result.removed} removed, ${result.skipped} skipped.`,
                        );
                    }
                },
            });
        });
}
