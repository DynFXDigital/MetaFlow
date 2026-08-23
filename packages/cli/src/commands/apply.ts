import { Command } from 'commander';
import {
    apply,
    applyPiProjectPluginSynchronization,
    isPiTargetEnabled,
    withRootSynchronizationAuthorization,
} from '@metaflow/engine';
import {
    formatPiTargetDiagnostics,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolvePiTargetPlan,
    resolveWorkspaceArtifacts,
} from './common';

export function registerApplyCommand(program: Command): void {
    program
        .command('apply')
        .description('Synchronize overlay outputs and enabled project targets')
        .option('-f, --force', 'Overwrite drifted files')
        .action((options: { force?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            try {
                withRootSynchronizationAuthorization(
                    loaded.configPath,
                    (authorization, attested) => {
                        const config = attested.config;
                        const resolved = resolveWorkspaceArtifacts(config, workspaceRoot);
                        const piPlan = resolvePiTargetPlan(config, workspaceRoot, resolved.layers);
                        if (piPlan.blocked) {
                            throw new Error(formatPiTargetDiagnostics(piPlan).join('; '));
                        }
                        const piResult = applyPiProjectPluginSynchronization({
                            workspaceRoot,
                            enabled: isPiTargetEnabled(config),
                            ...(piPlan.projection ? { projection: piPlan.projection } : {}),
                        });
                        if (piResult.plan.blocked) {
                            throw new Error(formatPiTargetDiagnostics(piResult.plan).join('; '));
                        }
                        const result = apply({
                            workspaceRoot,
                            effectiveFiles: resolved.effectiveFiles,
                            activeProfile: config.activeProfile,
                            fileNamingStrategy: config.fileNamingStrategy,
                            layerSources: config.layerSources,
                            synchronizationPolicy:
                                attested.migrationRequired !== true &&
                                config.synchronization?.repoWideCopilotInstructions === true,
                            rootSynchronizationAuthorization: authorization,
                            rootSynchronizationConfigPath: loaded.configPath,
                            force: options.force ?? false,
                        });

                        for (const rel of result.written) {
                            console.log(`write  ${rel}`);
                        }
                        for (const rel of result.removed) {
                            console.log(`remove ${rel}`);
                        }
                        for (const rel of result.skipped) {
                            console.log(`skip   ${rel}`);
                        }
                        for (const retained of result.retained) {
                            console.log(`retain ${retained.relativePath} (${retained.status})`);
                        }
                        for (const rel of piResult.written) {
                            console.log(`pi write  ${rel}`);
                        }
                        for (const rel of piResult.removed) {
                            console.log(`pi remove ${rel}`);
                        }

                        if (result.warnings.length > 0) {
                            for (const w of result.warnings) {
                                console.warn(`Warning: ${w}`);
                            }
                        }
                        for (const diagnostic of formatPiTargetDiagnostics(piResult.plan)) {
                            console.warn(`Pi: ${diagnostic}`);
                        }

                        console.log(
                            `\nDone: ${result.written.length} written, ${result.removed.length} removed, ${result.skipped.length} skipped, ${result.retained.length} retained; Pi ${piResult.written.length} written, ${piResult.removed.length} removed.`,
                        );
                    },
                );
            } catch (err: unknown) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exitCode = 1;
            }
        });
}
