import { Command } from 'commander';
import {
    auditAgentMetadataConformance,
    checkAllDrift,
    loadManagedState,
    planSynchronization,
    projectConfigForAgentMetadataAudit,
    resolveLayers,
    withReadOnlyRootSynchronizationAuthorization,
    resolveAgentPluginDisposition,
} from '@metaflow/engine';
import type { RootSynchronizationAuthorization } from '@metaflow/engine';
import {
    formatPiTargetDiagnostics,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolvePiTargetPlan,
    resolveWorkspaceArtifacts,
} from './common';
import { formatAgentPluginDiagnostic } from './agentPlugins';

export function registerValidateCommand(program: Command): void {
    program
        .command('validate')
        .description('Validate synchronized files match expected overlay state (for CI)')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);

            // Check config first
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            try {
                const validateWithConfig = (
                    config: typeof loaded.config,
                    authorization?: RootSynchronizationAuthorization,
                    migrationRequired = loaded.migrationRequired,
                ) => {
                    // Resolve expected overlay state
                    const resolved = resolveWorkspaceArtifacts(config, workspaceRoot);
                    const files = resolved.effectiveFiles;
                    const piPlan = resolvePiTargetPlan(config, workspaceRoot, resolved.layers);
                    const agentPlugins = auditAgentMetadataConformance(
                        resolveLayers(projectConfigForAgentMetadataAudit(config), workspaceRoot),
                        resolveAgentPluginDisposition(config),
                    );
                    const piDiagnostics = formatPiTargetDiagnostics(piPlan);
                    const piValid =
                        !piPlan.blocked &&
                        piPlan.changes.length === 0 &&
                        piPlan.stateAction === 'none';
                    const plan = planSynchronization({
                        workspaceRoot,
                        effectiveFiles: files,
                        fileNamingStrategy: config.fileNamingStrategy,
                        layerSources: config.layerSources,
                        synchronizationPolicy:
                            !migrationRequired &&
                            config.synchronization?.repoWideCopilotInstructions === true,
                        rootSynchronizationAuthorization: authorization,
                        rootSynchronizationConfigPath: loaded.configPath,
                    });
                    const expectedSynchronized = new Set(
                        plan.synchronizedFiles.map((file) => file.destinationRelativePath),
                    );

                    // Load current managed state
                    const state = loadManagedState(workspaceRoot);
                    const tracked = Object.keys(state.files);

                    // Check drift on all tracked files
                    const drift = checkAllDrift(workspaceRoot, '.github', state);
                    const drifted = drift.filter((d) => d.status === 'drifted');
                    const missing = drift.filter((d) => d.status === 'missing');
                    const retained = plan.retainedFiles;
                    const rootPolicyDisabled =
                        migrationRequired ||
                        config.synchronization?.repoWideCopilotInstructions !== true;
                    const relevantDrift = rootPolicyDisabled
                        ? drift.filter((d) => d.relativePath !== 'copilot-instructions.md')
                        : drift;
                    const relevantDrifted = relevantDrift.filter((d) => d.status === 'drifted');
                    const relevantMissing = relevantDrift.filter((d) => d.status === 'missing');

                    // Check for files that should be tracked but aren't
                    const trackedSet = new Set(tracked);
                    const unmanaged = [...expectedSynchronized].filter((f) => !trackedSet.has(f));

                    // Check for tracked files that are no longer expected
                    const stale = tracked.filter(
                        (f) =>
                            !expectedSynchronized.has(f) &&
                            !(rootPolicyDisabled && f === 'copilot-instructions.md'),
                    );

                    const isValid =
                        relevantDrifted.length === 0 &&
                        relevantMissing.length === 0 &&
                        unmanaged.length === 0 &&
                        stale.length === 0 &&
                        piValid;

                    if (options.json) {
                        const data = {
                            valid: isValid,
                            summary: {
                                expected: expectedSynchronized.size,
                                tracked: tracked.length,
                                drifted: relevantDrifted.length,
                                missing: relevantMissing.length,
                                retained: retained.length,
                                unmanaged: unmanaged.length,
                                stale: stale.length,
                                piPending: piPlan.changes.length,
                            },
                            drifted: relevantDrifted.map((d) => d.relativePath),
                            missing: relevantMissing.map((d) => d.relativePath),
                            retained,
                            unmanaged,
                            stale,
                            piTarget: {
                                valid: piValid,
                                blocked: piPlan.blocked,
                                stateAction: piPlan.stateAction,
                                pendingChanges: piPlan.changes,
                                diagnostics: piPlan.diagnostics,
                            },
                            agentPlugins,
                        };
                        console.log(JSON.stringify(data, null, 2));
                    } else {
                        if (isValid) {
                            console.log(
                                `Validation passed: ${tracked.length} synchronized files in sync.`,
                            );
                        } else {
                            console.log('Validation failed:');
                            if (relevantDrifted.length > 0) {
                                console.log(`  ${relevantDrifted.length} drifted file(s):`);
                                for (const d of relevantDrifted) {
                                    console.log(`    - ${d.relativePath}`);
                                }
                            }
                            if (relevantMissing.length > 0) {
                                console.log(`  ${relevantMissing.length} missing file(s):`);
                                for (const d of relevantMissing) {
                                    console.log(`    - ${d.relativePath}`);
                                }
                            }
                            if (unmanaged.length > 0) {
                                console.log(
                                    `  ${unmanaged.length} unmanaged file(s) (need 'apply'):`,
                                );
                                for (const f of unmanaged) {
                                    console.log(`    - ${f}`);
                                }
                            }
                            if (stale.length > 0) {
                                console.log(
                                    `  ${stale.length} stale file(s) (no longer in overlay):`,
                                );
                                for (const f of stale) {
                                    console.log(`    - ${f}`);
                                }
                            }
                            if (!piValid) {
                                console.log(
                                    `  Pi target requires reconciliation (${piPlan.changes.length} pending change(s), state ${piPlan.stateAction}):`,
                                );
                                for (const diagnostic of piDiagnostics) {
                                    console.log(`    - ${diagnostic}`);
                                }
                                for (const change of piPlan.changes) {
                                    console.log(`    - ${change.action} ${change.relativePath}`);
                                }
                            }
                        }
                        if (agentPlugins.disposition === 'audit-standard') {
                            console.log(
                                `Agent Plugins v1: ${agentPlugins.summary.standardConformancePercent}% conformant, ${agentPlugins.summary.portablePercent}% portable.`,
                            );
                            for (const diagnostic of agentPlugins.diagnostics) {
                                console.log(`  ${formatAgentPluginDiagnostic(diagnostic)}`);
                            }
                        }
                    }

                    if (!isValid) {
                        process.exitCode = 1;
                    }
                };

                if (loaded.migrationRequired) {
                    if (loaded.config.synchronization?.repoWideCopilotInstructions === true) {
                        throw new Error(
                            'Configuration migration is required before repository-wide Copilot instruction synchronization can be validated; run metaflow apply first.',
                        );
                    }
                    validateWithConfig(loaded.config);
                } else {
                    withReadOnlyRootSynchronizationAuthorization(
                        loaded.configPath,
                        (authorization, attested) => {
                            validateWithConfig(
                                attested.config,
                                authorization,
                                attested.migrationRequired === true,
                            );
                        },
                    );
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (options.json) {
                    console.log(JSON.stringify({ valid: false, error: message }, null, 2));
                } else {
                    console.error(`Error: ${message}`);
                }
                process.exitCode = 1;
            }
        });
}
