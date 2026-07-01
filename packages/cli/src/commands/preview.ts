import { Command } from 'commander';
import {
    computeSettingsEntries,
    describeProjection,
    getTargetCapabilityMatrix,
    preview,
    TargetCapabilityMatrixEntry,
    ProjectionMetadata,
} from '@metaflow/engine';
import {
    formatSurfacedConflictWarnings,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolveExecutionProfiles,
    resolveEffectiveFiles,
    resolveHooks,
    resolveMcpServers,
    resolvePolicyGrants,
    resolveSurfacedFileConflicts,
    ResolvedMcpServer,
    ResolvedPolicyGrant,
    ResolvedHook,
    ResolvedExecutionProfile,
} from './common';

function formatFileProvenance(sourceLayer: string, sourceRepo?: string): string {
    return sourceRepo ? `${sourceLayer} (${sourceRepo})` : sourceLayer;
}

function formatProjection(projection: ProjectionMetadata): string {
    const notes = projection.notes.length > 0 ? `; ${projection.notes.join('; ')}` : '';
    return `${projection.target}; lossiness=${projection.lossiness}${notes}`;
}

function summarizeTargetCapabilityMatrix(entries: TargetCapabilityMatrixEntry[]): string[] {
    const rowsByTarget = new Map<string, TargetCapabilityMatrixEntry[]>();
    for (const entry of entries) {
        const rows = rowsByTarget.get(entry.target) ?? [];
        rows.push(entry);
        rowsByTarget.set(entry.target, rows);
    }

    return Array.from(rowsByTarget.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([target, rows]) => {
            const adapterVersion = rows[0]?.adapterVersion ?? 'unknown';
            const concepts = [...rows]
                .sort((left, right) => left.concept.localeCompare(right.concept))
                .map((entry) => `${entry.concept}=${entry.support}`)
                .join(', ');
            return `${target} (${adapterVersion}): ${concepts}`;
        });
}

function summarizeSources(files: Array<{ sourceLayer: string; sourceRepo?: string }>): string[] {
    const counts = new Map<string, number>();

    for (const file of files) {
        const label = formatFileProvenance(file.sourceLayer, file.sourceRepo);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }))
        .map(([label, count]) => `${label}: ${count}`);
}

function summarizeSettingsEntries(
    entries: Array<{ key: string; value: string | string[] | Record<string, boolean> }>,
): string[] {
    return entries
        .map((entry) => {
            const locations = Array.isArray(entry.value)
                ? entry.value
                : typeof entry.value === 'string'
                  ? [entry.value]
                  : Object.keys(entry.value);
            const joinedLocations = locations
                .sort((left, right) => left.localeCompare(right))
                .join(', ');
            return `${entry.key}: ${joinedLocations}`;
        })
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function formatPolicyGrant(grant: ResolvedPolicyGrant): string {
    const audit = grant.audit ? 'true' : 'false';
    return `${grant.id || '<invalid>'} [${grant.category}] ${grant.authority || '<missing authority>'} approval=${grant.approval} audit=${audit} @ ${formatFileProvenance(grant.sourceLayer, grant.sourceRepo)}`;
}

function formatMcpServer(server: ResolvedMcpServer): string {
    const category = server.capabilityCategory ? ` category=${server.capabilityCategory}` : '';
    const grants = server.policyGrants.length > 0 ? ` grants=${server.policyGrants.join(',')}` : '';
    const secrets =
        server.requiredSecrets.length > 0 ? ` secrets=${server.requiredSecrets.join(',')}` : '';
    return `${server.id || '<invalid>'} [${server.transport}]${category}${grants}${secrets} @ ${formatFileProvenance(server.sourceLayer, server.sourceRepo)}`;
}

function formatHook(hook: ResolvedHook): string {
    const scope = hook.scope ? ` scope=${hook.scope}` : '';
    const grants = hook.policyGrants.length > 0 ? ` grants=${hook.policyGrants.join(',')}` : '';
    const targets = hook.targets.length > 0 ? ` targets=${hook.targets.join(',')}` : '';
    return `${hook.id || '<invalid>'} [${hook.triggerPhase}/${hook.invocationType}] failure=${hook.failureBehavior}${scope}${grants}${targets} @ ${formatFileProvenance(hook.sourceLayer, hook.sourceRepo)}`;
}

function formatExecutionProfile(profile: ResolvedExecutionProfile): string {
    const runner = profile.runner ? ` runner=${profile.runner}` : '';
    const timeout =
        profile.timeoutSeconds !== undefined ? ` timeout=${profile.timeoutSeconds}s` : '';
    const grants =
        profile.policyGrants.length > 0 ? ` grants=${profile.policyGrants.join(',')}` : '';
    const targets = profile.targets.length > 0 ? ` targets=${profile.targets.join(',')}` : '';
    const secrets =
        profile.requiredSecrets.length > 0
            ? ` secrets=${profile.requiredSecrets.join(',')}`
            : '';
    return `${profile.id || '<invalid>'} [${profile.surface}/${profile.isolation}]${runner}${timeout}${grants}${targets}${secrets} @ ${formatFileProvenance(profile.sourceLayer, profile.sourceRepo)}`;
}

export function registerPreviewCommand(program: Command): void {
    program
        .command('preview')
        .description('Preview effective files and pending changes')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            try {
                const { config } = loaded;
                const files = resolveEffectiveFiles(config, workspaceRoot);
                const changes = preview(
                    workspaceRoot,
                    files,
                    undefined,
                    config.fileNamingStrategy,
                    config.layerSources,
                );
                const conflicts = resolveSurfacedFileConflicts(config, workspaceRoot);
                const warnings = formatSurfacedConflictWarnings(conflicts);
                const settingsEntries = computeSettingsEntries(files, workspaceRoot, config);
                const settingsEntrySummary = summarizeSettingsEntries(settingsEntries);
                const sourceSummary = summarizeSources(files);
                const policyGrants = resolvePolicyGrants(config, workspaceRoot);
                const mcpServers = resolveMcpServers(config, workspaceRoot);
                const hooks = resolveHooks(config, workspaceRoot);
                const executionProfiles = resolveExecutionProfiles(config, workspaceRoot);
                const targetCapabilityMatrix = getTargetCapabilityMatrix();
                const targetCapabilitySummary =
                    summarizeTargetCapabilityMatrix(targetCapabilityMatrix);
                const settingsCount = files.filter(
                    (file) => file.classification === 'settings',
                ).length;
                const synchronizedCount = files.length - settingsCount;

                if (options.json) {
                    const data = {
                        summary: {
                            total: files.length,
                            settings: settingsCount,
                            synchronized: synchronizedCount,
                            sourceCount: sourceSummary.length,
                            policyGrants: policyGrants.length,
                            mcpServers: mcpServers.length,
                            hooks: hooks.length,
                            executionProfiles: executionProfiles.length,
                        },
                        effectiveFiles: files.map((f) => ({
                            relativePath: f.relativePath,
                            sourceRelativePath: f.sourceRelativePath ?? f.relativePath,
                            classification: f.classification,
                            sourceLayer: f.sourceLayer,
                            sourceRepo: f.sourceRepo ?? null,
                            projection: describeProjection(
                                f.relativePath,
                                f.sourceRelativePath ?? f.relativePath,
                            ),
                        })),
                        pendingChanges: changes.map((c) => ({
                            relativePath: c.relativePath,
                            sourceRelativePath: c.sourceRelativePath ?? c.relativePath,
                            action: c.action,
                            reason: c.reason ?? null,
                            sourceLayer: c.sourceLayer,
                            sourceRepo: c.sourceRepo ?? null,
                            projection: c.projection,
                        })),
                        policyGrants,
                        mcpServers,
                        hooks,
                        executionProfiles,
                        settingsEntries,
                        sources: sourceSummary,
                        targetCapabilityMatrix,
                        surfacedFileConflicts: conflicts,
                        warnings,
                    };
                    console.log(JSON.stringify(data, null, 2));
                    return;
                }

                if (
                    files.length === 0 &&
                    policyGrants.length === 0 &&
                    mcpServers.length === 0 &&
                    hooks.length === 0 &&
                    executionProfiles.length === 0
                ) {
                    console.log('No files in overlay.');
                    return;
                }

                if (files.length > 0) {
                    console.log('Effective files:');
                    for (const f of files) {
                        const projection = describeProjection(
                            f.relativePath,
                            f.sourceRelativePath ?? f.relativePath,
                        );
                        console.log(
                            `  [${f.classification}] [${projection.target}] ${f.relativePath} @ ${formatFileProvenance(f.sourceLayer, f.sourceRepo)}`,
                        );
                        if (projection.pathTransformed || projection.lossiness !== 'none') {
                            console.log(`    projection: ${formatProjection(projection)}`);
                        }
                    }
                } else {
                    console.log('No files in overlay.');
                }
                console.log(
                    `\nSummary: ${files.length} total (${settingsCount} settings, ${synchronizedCount} synchronized)`,
                );
                if (settingsEntrySummary.length > 0) {
                    console.log(`Settings Entries: ${settingsEntrySummary.length}`);
                    for (const summary of settingsEntrySummary) {
                        console.log(`  - ${summary}`);
                    }
                }
                if (sourceSummary.length > 0) {
                    console.log(`Sources: ${sourceSummary.length}`);
                    for (const source of sourceSummary) {
                        console.log(`  - ${source}`);
                    }
                }
                if (policyGrants.length > 0) {
                    console.log(`Policy Grants: ${policyGrants.length}`);
                    for (const grant of policyGrants) {
                        console.log(`  - ${formatPolicyGrant(grant)}`);
                        for (const warning of grant.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (mcpServers.length > 0) {
                    console.log(`MCP Servers: ${mcpServers.length}`);
                    for (const server of mcpServers) {
                        console.log(`  - ${formatMcpServer(server)}`);
                        if (server.invocation) {
                            const args =
                                server.invocation.args.length > 0
                                    ? ` ${server.invocation.args.join(' ')}`
                                    : '';
                            console.log(`    invocation: ${server.invocation.command}${args}`);
                        }
                        if (server.endpoint) {
                            console.log(`    endpoint: ${server.endpoint}`);
                        }
                        for (const warning of server.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (hooks.length > 0) {
                    console.log(`Hooks: ${hooks.length}`);
                    for (const hook of hooks) {
                        console.log(`  - ${formatHook(hook)}`);
                        if (hook.command) {
                            const args = hook.args.length > 0 ? ` ${hook.args.join(' ')}` : '';
                            console.log(`    command: ${hook.command}${args}`);
                        }
                        if (hook.endpoint) {
                            console.log(`    endpoint: ${hook.endpoint}`);
                        }
                        for (const warning of hook.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (executionProfiles.length > 0) {
                    console.log(`Execution Profiles: ${executionProfiles.length}`);
                    for (const profile of executionProfiles) {
                        console.log(`  - ${formatExecutionProfile(profile)}`);
                        if (profile.workingDirectory) {
                            console.log(`    workingDirectory: ${profile.workingDirectory}`);
                        }
                        if (profile.environment && Object.keys(profile.environment).length > 0) {
                            const entries = Object.entries(profile.environment)
                                .sort((left, right) => left[0].localeCompare(right[0]))
                                .map(([key, value]) => `${key}=${value}`)
                                .join(', ');
                            console.log(`    environment: ${entries}`);
                        }
                        for (const warning of profile.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (targetCapabilitySummary.length > 0) {
                    console.log(`Target Capability Matrix: ${targetCapabilityMatrix.length}`);
                    for (const summary of targetCapabilitySummary) {
                        console.log(`  - ${summary}`);
                    }
                }

                if (changes.length > 0) {
                    console.log(`\nPending changes (${changes.length}):`);
                    for (const c of changes) {
                        const suffix = c.reason ? ` (${c.reason})` : '';
                        console.log(
                            `  ${c.action} [${c.projection.target}] ${c.relativePath}${suffix}`,
                        );
                        if (c.projection.pathTransformed || c.projection.lossiness !== 'none') {
                            console.log(`    projection: ${formatProjection(c.projection)}`);
                        }
                    }
                }

                if (warnings.length > 0) {
                    console.log(`\nWarnings (${warnings.length}):`);
                    for (const warning of warnings) {
                        console.log(`  ! ${warning}`);
                    }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                } else {
                    console.error(`Error: ${message}`);
                }
                process.exitCode = 1;
            }
        });
}
