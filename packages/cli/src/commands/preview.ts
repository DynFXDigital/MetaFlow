import { Command } from 'commander';
import {
    buildAdapterReadinessReports,
    buildGitHubCopilotMcpHandoff,
    computeSettingsEntries,
    describeProjectionWithTargetAdapters,
    getTargetCapabilityMatrix,
    isSynchronizationPlanningError,
    preview,
    AdapterReadinessReport,
    TargetCapabilityMatrixEntry,
    ProjectionMetadata,
    buildTargetCapabilitySupportReference,
} from '@metaflow/engine';
import {
    formatSurfacedConflictWarnings,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolveAgentProfiles,
    resolveCodexProjectConfigs,
    resolveEvaluationProfiles,
    resolveExecutionProfiles,
    resolveEffectiveFiles,
    resolveHooks,
    resolveInstructions,
    resolveMcpServers,
    resolveMemoryScopes,
    resolvePackageManifests,
    resolvePolicyGrants,
    resolvePrompts,
    resolveSkills,
    resolveSurfacedFileConflicts,
    resolveTargetAdapters,
    resolveTools,
    ResolvedMcpServer,
    ResolvedAgentProfile,
    ResolvedCodexProjectConfig,
    ResolvedPolicyGrant,
    ResolvedHook,
    ResolvedExecutionProfile,
    ResolvedEvaluationProfile,
    ResolvedMemoryScope,
    ResolvedPackageManifest,
    ResolvedContent,
    ResolvedSkill,
    ResolvedTargetAdapter,
    ResolvedTool,
} from './common';

function formatFileProvenance(sourceLayer: string, sourceRepo?: string): string {
    return sourceRepo ? `${sourceLayer} (${sourceRepo})` : sourceLayer;
}

function formatProjection(projection: ProjectionMetadata): string {
    const notes = projection.notes.length > 0 ? `; ${projection.notes.join('; ')}` : '';
    const adapter =
        projection.targetAdapterId !== undefined
            ? `; adapter=${projection.targetAdapterId}; mode=${projection.targetAdapterMaterializationMode ?? 'unspecified'}; validation=${projection.targetAdapterValidationStatus ?? 'unverified'}`
            : '';
    return `${projection.target}; lossiness=${projection.lossiness}${adapter}${notes}`;
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

function formatMemoryScope(scope: ResolvedMemoryScope): string {
    const retention = scope.retention ? ` retention=${scope.retention}` : '';
    const sharing = scope.sharing ? ` sharing=${scope.sharing}` : '';
    const grants =
        scope.policyGrants.length > 0 ? ` grants=${scope.policyGrants.join(',')}` : '';
    const targets = scope.targets.length > 0 ? ` targets=${scope.targets.join(',')}` : '';
    return `${scope.id || '<invalid>'} [${scope.scopeType}/${scope.storage}]${retention}${sharing}${grants}${targets} @ ${formatFileProvenance(scope.sourceLayer, scope.sourceRepo)}`;
}

function formatEvaluationProfile(profile: ResolvedEvaluationProfile): string {
    const command = profile.command ? ` command=${profile.command}` : '';
    const artifacts =
        profile.artifacts.length > 0 ? ` artifacts=${profile.artifacts.join(',')}` : '';
    const grants =
        profile.policyGrants.length > 0 ? ` grants=${profile.policyGrants.join(',')}` : '';
    const targets = profile.targets.length > 0 ? ` targets=${profile.targets.join(',')}` : '';
    return `${profile.id || '<invalid>'} [${profile.evaluationType}]${command}${artifacts}${grants}${targets} @ ${formatFileProvenance(profile.sourceLayer, profile.sourceRepo)}`;
}

function formatAgentProfile(profile: ResolvedAgentProfile): string {
    const model = profile.model ? ` model=${profile.model}` : '';
    const effort = profile.modelReasoningEffort ? ` reasoning=${profile.modelReasoningEffort}` : '';
    const sandbox = profile.sandboxMode ? ` sandbox=${profile.sandboxMode}` : '';
    const tools = profile.tools.length > 0 ? ` tools=${profile.tools.join(',')}` : '';
    const mcpServers =
        profile.mcpServers.length > 0 ? ` mcpServers=${profile.mcpServers.join(',')}` : '';
    const grants =
        profile.policyGrants.length > 0 ? ` grants=${profile.policyGrants.join(',')}` : '';
    const targets = profile.targets.length > 0 ? ` targets=${profile.targets.join(',')}` : '';
    return `${profile.id || '<invalid>'} [${profile.name || '<missing name>'}]${model}${effort}${sandbox}${tools}${mcpServers}${grants}${targets} @ ${formatFileProvenance(profile.sourceLayer, profile.sourceRepo)}`;
}

function formatContent(content: ResolvedContent): string {
    const name = content.name ? ` [${content.name}]` : '';
    const risk = content.risk ? ` risk=${content.risk}` : '';
    const appliesTo =
        content.appliesTo.length > 0 ? ` appliesTo=${content.appliesTo.join(',')}` : '';
    const targets = content.targets.length > 0 ? ` targets=${content.targets.join(',')}` : '';
    return `${content.id || '<invalid>'}${name} entrypoint=${content.entrypoint}${risk}${appliesTo}${targets} @ ${formatFileProvenance(content.sourceLayer, content.sourceRepo)}`;
}

function formatSkill(skill: ResolvedSkill): string {
    const name = skill.name ? ` [${skill.name}]` : '';
    const risk = skill.risk ? ` risk=${skill.risk}` : '';
    const appliesTo = skill.appliesTo.length > 0 ? ` appliesTo=${skill.appliesTo.join(',')}` : '';
    const targets = skill.targets.length > 0 ? ` targets=${skill.targets.join(',')}` : '';
    return `${skill.id || '<invalid>'}${name} entrypoint=${skill.entrypoint}${risk}${appliesTo}${targets} @ ${formatFileProvenance(skill.sourceLayer, skill.sourceRepo)}`;
}

function formatCodexProjectConfig(config: ResolvedCodexProjectConfig): string {
    const settings = config.settings;
    const model = settings.model ? ` model=${settings.model}` : '';
    const approval = settings.approvalPolicy ? ` approval=${settings.approvalPolicy}` : '';
    const sandbox = settings.sandboxMode ? ` sandbox=${settings.sandboxMode}` : '';
    const search = settings.webSearch ? ` webSearch=${settings.webSearch}` : '';
    const grants = config.policyGrants.length > 0 ? ` grants=${config.policyGrants.join(',')}` : '';
    const targets = config.targets.length > 0 ? ` targets=${config.targets.join(',')}` : '';
    return `${config.id || '<invalid>'}${model}${approval}${sandbox}${search}${grants}${targets} @ ${formatFileProvenance(config.sourceLayer, config.sourceRepo)}`;
}

function formatTargetAdapter(adapter: ResolvedTargetAdapter): string {
    const enabled = adapter.enabled ? 'enabled' : 'disabled';
    const version = adapter.adapterVersion ? ` version=${adapter.adapterVersion}` : '';
    const grants =
        adapter.requiredPolicyGrants.length > 0
            ? ` grants=${adapter.requiredPolicyGrants.join(',')}`
            : '';
    const evidence =
        adapter.validationEvidence.length > 0
            ? ` evidence=${adapter.validationEvidence.join(',')}`
            : '';
    return `${adapter.id || '<invalid>'} [${adapter.target}] ${enabled} mode=${adapter.materializationMode} validation=${adapter.validationStatus}${version}${grants}${evidence} @ ${formatFileProvenance(adapter.sourceLayer, adapter.sourceRepo)}`;
}

function formatPackageManifest(manifest: ResolvedPackageManifest): string {
    const grants =
        manifest.policyGrants.length > 0 ? ` grants=${manifest.policyGrants.join(',')}` : '';
    const evidence =
        manifest.validationEvidence.length > 0
            ? ` evidence=${manifest.validationEvidence.join(',')}`
            : '';
    const targets = Object.entries(manifest.targets)
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([targetId, declaration]) => {
            const enabled =
                declaration.enabled === undefined
                    ? ''
                    : `:${declaration.enabled ? 'enabled' : 'disabled'}`;
            const pluginName = declaration.pluginName ? `=${declaration.pluginName}` : '';
            return `${targetId}${pluginName}${enabled}`;
        });
    const targetText = targets.length > 0 ? ` targets=${targets.join(',')}` : '';
    return `${manifest.id || '<invalid>'} [${manifest.kind || '<missing kind>'}] ${manifest.name || '<missing name>'}${grants}${targetText}${evidence} @ ${formatFileProvenance(manifest.sourceLayer, manifest.sourceRepo)}`;
}

function formatTool(tool: ResolvedTool): string {
    const grants = tool.policyGrants.length > 0 ? ` grants=${tool.policyGrants.join(',')}` : '';
    const targets = tool.targets.length > 0 ? ` targets=${tool.targets.join(',')}` : '';
    const execution =
        tool.executionProfiles.length > 0
            ? ` execution=${tool.executionProfiles.join(',')}`
            : '';
    const binding =
        tool.kind === 'command' && tool.command
            ? ` command=${tool.command}`
            : tool.kind === 'mcp' && tool.mcpServer && tool.mcpTool
              ? ` mcp=${tool.mcpServer}.${tool.mcpTool}`
              : tool.kind === 'http' && tool.endpoint
                ? ` endpoint=${tool.endpoint}`
                : '';
    return `${tool.id || '<invalid>'} [${tool.kind}]${binding}${grants}${targets}${execution} @ ${formatFileProvenance(tool.sourceLayer, tool.sourceRepo)}`;
}

function formatAdapterReport(report: AdapterReadinessReport): string {
    const counts = Object.entries(report.managedMetadata)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}=${count}`)
        .join(', ');
    return `${report.target} (${report.adapterVersion})${counts ? `: ${counts}` : ''}`;
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
                const githubCopilotMcpHandoff = buildGitHubCopilotMcpHandoff(mcpServers);
                const hooks = resolveHooks(config, workspaceRoot);
                const executionProfiles = resolveExecutionProfiles(config, workspaceRoot);
                const memoryScopes = resolveMemoryScopes(config, workspaceRoot);
                const evaluationProfiles = resolveEvaluationProfiles(config, workspaceRoot);
                const agentProfiles = resolveAgentProfiles(config, workspaceRoot);
                const instructionManifests = resolveInstructions(config, workspaceRoot);
                const promptManifests = resolvePrompts(config, workspaceRoot);
                const skills = resolveSkills(config, workspaceRoot);
                const codexProjectConfigs = resolveCodexProjectConfigs(config, workspaceRoot);
                const targetAdapters = resolveTargetAdapters(config, workspaceRoot);
                const packageManifests = resolvePackageManifests(config, workspaceRoot);
                const tools = resolveTools(config, workspaceRoot);
                const targetCapabilityMatrix = getTargetCapabilityMatrix();
                const targetCapabilitySummary =
                    summarizeTargetCapabilityMatrix(targetCapabilityMatrix);
                const targetCapabilitySupportReference =
                    buildTargetCapabilitySupportReference(targetCapabilityMatrix);
                const adapterReports = buildAdapterReadinessReports({
                    matrix: targetCapabilityMatrix,
                    policyGrants,
                    mcpServers,
                    hooks,
                    executionProfiles,
                    memoryScopes,
                    evaluationProfiles,
                    agentProfiles,
                    instructions: instructionManifests,
                    prompts: promptManifests,
                    codexProjectConfigs,
                    packageManifests,
                    tools,
                });
                const actionableAdapterReports = adapterReports.filter(
                    (report) => report.actionItems.length > 0 || report.warnings.length > 0,
                );
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
                            githubCopilotMcpHandoff:
                                githubCopilotMcpHandoff?.servers.length ?? 0,
                            hooks: hooks.length,
                            executionProfiles: executionProfiles.length,
                            memoryScopes: memoryScopes.length,
                            evaluationProfiles: evaluationProfiles.length,
                            agentProfiles: agentProfiles.length,
                            instructionManifests: instructionManifests.length,
                            promptManifests: promptManifests.length,
                            skills: skills.length,
                            codexProjectConfigs: codexProjectConfigs.length,
                            targetAdapters: targetAdapters.length,
                            packageManifests: packageManifests.length,
                            tools: tools.length,
                            adapterReports: adapterReports.length,
                        },
                        effectiveFiles: files.map((f) => ({
                            relativePath: f.relativePath,
                            sourceRelativePath: f.sourceRelativePath ?? f.relativePath,
                            classification: f.classification,
                            sourceLayer: f.sourceLayer,
                            sourceRepo: f.sourceRepo ?? null,
                            projection: describeProjectionWithTargetAdapters(
                                f.relativePath,
                                f.sourceRelativePath ?? f.relativePath,
                                f.sourceTargetAdapters,
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
                        githubCopilotMcpHandoff,
                        hooks,
                        executionProfiles,
                        memoryScopes,
                        evaluationProfiles,
                        agentProfiles,
                        instructionManifests,
                        promptManifests,
                        skills,
                        codexProjectConfigs,
                        targetAdapters,
                        packageManifests,
                        tools,
                        adapterReports,
                        settingsEntries,
                        sources: sourceSummary,
                        targetCapabilityMatrix,
                        targetCapabilitySupportReference,
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
                    !githubCopilotMcpHandoff &&
                    hooks.length === 0 &&
                    executionProfiles.length === 0 &&
                    memoryScopes.length === 0 &&
                    evaluationProfiles.length === 0 &&
                    agentProfiles.length === 0 &&
                    skills.length === 0 &&
                    codexProjectConfigs.length === 0 &&
                    targetAdapters.length === 0 &&
                    packageManifests.length === 0 &&
                    tools.length === 0 &&
                    actionableAdapterReports.length === 0
                ) {
                    console.log('No files in overlay.');
                    return;
                }

                if (files.length > 0) {
                    console.log('Effective files:');
                    for (const f of files) {
                        const projection = describeProjectionWithTargetAdapters(
                            f.relativePath,
                            f.sourceRelativePath ?? f.relativePath,
                            f.sourceTargetAdapters,
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
                if (githubCopilotMcpHandoff) {
                    const supported = githubCopilotMcpHandoff.servers.filter(
                        (server) => server.supported,
                    ).length;
                    console.log('GitHub Copilot MCP Handoff:');
                    console.log(
                        `  - ${githubCopilotMcpHandoff.destination} (${supported}/${githubCopilotMcpHandoff.servers.length} servers supported, operator review required)`,
                    );
                    for (const server of githubCopilotMcpHandoff.servers) {
                        const status = server.supported ? 'supported' : 'unsupported';
                        const secrets =
                            server.requiredSecrets.length > 0
                                ? ` secrets=${server.requiredSecrets.join(',')}`
                                : '';
                        const grants =
                            server.policyGrants.length > 0
                                ? ` grants=${server.policyGrants.join(',')}`
                                : '';
                        console.log(`    ${server.id || '<invalid>'}: ${status}${secrets}${grants}`);
                    }
                    for (const warning of githubCopilotMcpHandoff.warnings) {
                        console.log(`    ! ${warning}`);
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
                if (memoryScopes.length > 0) {
                    console.log(`Memory Scopes: ${memoryScopes.length}`);
                    for (const scope of memoryScopes) {
                        console.log(`  - ${formatMemoryScope(scope)}`);
                        if (scope.readPolicy) {
                            console.log(`    readPolicy: ${scope.readPolicy}`);
                        }
                        if (scope.writePolicy) {
                            console.log(`    writePolicy: ${scope.writePolicy}`);
                        }
                        for (const warning of scope.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (evaluationProfiles.length > 0) {
                    console.log(`Evaluation Profiles: ${evaluationProfiles.length}`);
                    for (const profile of evaluationProfiles) {
                        console.log(`  - ${formatEvaluationProfile(profile)}`);
                        if (profile.args.length > 0) {
                            console.log(`    args: ${profile.args.join(' ')}`);
                        }
                        if (profile.successCriteria) {
                            console.log(`    successCriteria: ${profile.successCriteria}`);
                        }
                        for (const warning of profile.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (agentProfiles.length > 0) {
                    console.log(`Agent Profiles: ${agentProfiles.length}`);
                    for (const profile of agentProfiles) {
                        console.log(`  - ${formatAgentProfile(profile)}`);
                        if (profile.description) {
                            console.log(`    description: ${profile.description}`);
                        }
                        if (profile.nicknameCandidates.length > 0) {
                            console.log(
                                `    nicknameCandidates: ${profile.nicknameCandidates.join(', ')}`,
                            );
                        }
                        for (const note of profile.notes) {
                            console.log(`    note: ${note}`);
                        }
                        for (const warning of profile.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (instructionManifests.length > 0) {
                    console.log(`Instruction Manifests: ${instructionManifests.length}`);
                    for (const instruction of instructionManifests) {
                        console.log(`  - ${formatContent(instruction)}`);
                        if (instruction.description) {
                            console.log(`    description: ${instruction.description}`);
                        }
                        for (const warning of instruction.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (promptManifests.length > 0) {
                    console.log(`Prompt Manifests: ${promptManifests.length}`);
                    for (const prompt of promptManifests) {
                        console.log(`  - ${formatContent(prompt)}`);
                        if (prompt.description) {
                            console.log(`    description: ${prompt.description}`);
                        }
                        for (const warning of prompt.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (skills.length > 0) {
                    console.log(`Skill Manifests: ${skills.length}`);
                    for (const skill of skills) {
                        console.log(`  - ${formatSkill(skill)}`);
                        if (skill.description) {
                            console.log(`    description: ${skill.description}`);
                        }
                        for (const warning of skill.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (codexProjectConfigs.length > 0) {
                    console.log(`Codex Project Configs: ${codexProjectConfigs.length}`);
                    for (const config of codexProjectConfigs) {
                        console.log(`  - ${formatCodexProjectConfig(config)}`);
                        for (const note of config.notes) {
                            console.log(`    note: ${note}`);
                        }
                        for (const warning of config.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (targetAdapters.length > 0) {
                    console.log(`Target Adapters: ${targetAdapters.length}`);
                    for (const adapter of targetAdapters) {
                        console.log(`  - ${formatTargetAdapter(adapter)}`);
                        const conceptEntries = Object.entries(adapter.concepts).sort((left, right) =>
                            left[0].localeCompare(right[0]),
                        );
                        if (conceptEntries.length > 0) {
                            const concepts = conceptEntries
                                .map(([concept, mode]) => `${concept}=${mode}`)
                                .join(', ');
                            console.log(`    concepts: ${concepts}`);
                        }
                        for (const note of adapter.notes) {
                            console.log(`    note: ${note}`);
                        }
                        for (const warning of adapter.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (packageManifests.length > 0) {
                    console.log(`Package Manifests: ${packageManifests.length}`);
                    for (const manifest of packageManifests) {
                        console.log(`  - ${formatPackageManifest(manifest)}`);
                        const componentEntries = [
                            ['agents', manifest.agents],
                            ['skills', manifest.skills],
                            ['instructions', manifest.instructions],
                            ['prompts', manifest.prompts],
                            ['mcpServers', manifest.mcpServers],
                            ['tools', manifest.tools],
                            ['hooks', manifest.hooks],
                        ].filter(([, values]) => (values as string[]).length > 0);
                        if (componentEntries.length > 0) {
                            const components = componentEntries
                                .map(([kind, values]) => `${kind}=${(values as string[]).join(',')}`)
                                .join('; ');
                            console.log(`    components: ${components}`);
                        }
                        if (manifest.description) {
                            console.log(`    description: ${manifest.description}`);
                        }
                        for (const entry of manifest.marketplaceEntries) {
                            const packageName = entry.packageName
                                ? ` package=${entry.packageName}`
                                : '';
                            const title = entry.title ? ` title=${entry.title}` : '';
                            const publisher = entry.publisher
                                ? ` publisher=${entry.publisher}`
                                : '';
                            const categories =
                                entry.categories.length > 0
                                    ? ` categories=${entry.categories.join(',')}`
                                    : '';
                            const keywords =
                                entry.keywords.length > 0
                                    ? ` keywords=${entry.keywords.join(',')}`
                                    : '';
                            console.log(
                                `    marketplaceEntry: ${entry.target}${packageName}${title}${publisher}${categories}${keywords}`,
                            );
                        }
                        for (const record of manifest.runtimeValidation) {
                            const command = record.command ? ` command=${record.command}` : '';
                            const concepts =
                                record.concepts && record.concepts.length > 0
                                    ? ` concepts=${record.concepts.join(',')}`
                                    : '';
                            const evidence =
                                record.evidence.length > 0
                                    ? ` evidence=${record.evidence.join(',')}`
                                    : '';
                            const limitations =
                                record.limitations.length > 0
                                    ? ` limitations=${record.limitations.join('; ')}`
                                    : '';
                            console.log(
                                `    runtimeValidation: ${record.target}/${record.harness} ${record.status} adapter=${record.adapterVersion} scenario=${record.scenario}${concepts}${command}${evidence}${limitations}`,
                            );
                        }
                        for (const warning of manifest.warnings) {
                            const severity = warning.severity ? `${warning.severity}: ` : '';
                            console.log(`    ! ${severity}${warning.code}: ${warning.message}`);
                        }
                    }
                }
                if (tools.length > 0) {
                    console.log(`Tools: ${tools.length}`);
                    for (const tool of tools) {
                        console.log(`  - ${formatTool(tool)}`);
                        if (tool.args.length > 0) {
                            console.log(`    args: ${tool.args.join(' ')}`);
                        }
                        if (tool.description) {
                            console.log(`    description: ${tool.description}`);
                        }
                        if (tool.inputSchema) {
                            console.log('    inputSchema: declared');
                        }
                        for (const warning of tool.warnings) {
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
                    if (targetCapabilitySupportReference) {
                        const references = targetCapabilitySupportReference.targets
                            .map(
                                (entry) =>
                                    `${entry.target}=${entry.runtimeOnlyCount} see ${entry.documentation}`,
                            )
                            .join('; ');
                        console.log(
                            `  Runtime-only support boundaries: ${targetCapabilitySupportReference.runtimeOnlyCount} rows require operator or harness evidence; ${references}.`,
                        );
                    }
                }
                if (actionableAdapterReports.length > 0) {
                    console.log(`Adapter Readiness Reports: ${actionableAdapterReports.length}`);
                    for (const report of actionableAdapterReports) {
                        console.log(`  - ${formatAdapterReport(report)}`);
                        for (const boundary of report.supportBoundaries) {
                            console.log(
                                `    boundary: [${boundary.concept}] ${boundary.message} See ${boundary.documentation}.`,
                            );
                        }
                        for (const item of report.actionItems) {
                            console.log(`    * [${item.concept}] ${item.message}`);
                        }
                        for (const warning of report.warnings) {
                            console.log(`    ! ${warning}`);
                        }
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
                    const conflicts = isSynchronizationPlanningError(err) ? err.conflicts : [];
                    console.log(
                        JSON.stringify(
                            {
                                error: message,
                                conflicts,
                            },
                            null,
                            2,
                        ),
                    );
                } else {
                    console.error(`Error: ${message}`);
                }
                process.exitCode = 1;
            }
        });
}
