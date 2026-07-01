import {
    AdapterReadinessAction,
    AdapterReadinessMetadataCounts,
    AdapterReadinessReport,
    AgentProfileMetadata,
    CodexProjectConfigMetadata,
    EvaluationProfileMetadata,
    ExecutionProfileMetadata,
    HookMetadata,
    McpServerMetadata,
    MemoryScopeMetadata,
    PolicyGrantMetadata,
    ProjectionTarget,
    TargetCapabilityConcept,
    TargetCapabilityMatrixEntry,
} from './types';
import { getTargetCapabilityMatrix } from './targetCapabilityMatrix';

export interface BuildAdapterReadinessReportsOptions {
    targets?: ProjectionTarget[];
    matrix?: TargetCapabilityMatrixEntry[];
    policyGrants?: PolicyGrantMetadata[];
    mcpServers?: McpServerMetadata[];
    hooks?: HookMetadata[];
    executionProfiles?: ExecutionProfileMetadata[];
    memoryScopes?: MemoryScopeMetadata[];
    evaluationProfiles?: EvaluationProfileMetadata[];
    agentProfiles?: AgentProfileMetadata[];
    codexProjectConfigs?: CodexProjectConfigMetadata[];
}

function appliesToTarget(targets: string[] | undefined, target: ProjectionTarget): boolean {
    return !targets || targets.length === 0 || targets.includes(target);
}

function uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function byId(left: { id: string }, right: { id: string }): number {
    return left.id.localeCompare(right.id);
}

function rowByConcept(
    rows: TargetCapabilityMatrixEntry[],
    concept: TargetCapabilityConcept,
): TargetCapabilityMatrixEntry | undefined {
    return rows.find((entry) => entry.concept === concept);
}

function rowEvidence(row: TargetCapabilityMatrixEntry | undefined): string[] {
    return row?.evidence ?? [];
}

function addRowWarnings(
    warnings: string[],
    row: TargetCapabilityMatrixEntry | undefined,
    count: number,
): void {
    if (!row || count === 0) {
        return;
    }
    warnings.push(...row.authorityImplications);
}

function action(
    concept: TargetCapabilityConcept,
    metadataId: string,
    message: string,
    evidence: string[],
): AdapterReadinessAction {
    return {
        concept,
        metadataId,
        severity: 'warning',
        message,
        evidence,
    };
}

function targetLabel(target: ProjectionTarget): string {
    switch (target) {
        case 'codex':
            return 'Codex';
        case 'github-copilot':
            return 'GitHub Copilot';
        case 'metaflow':
            return 'MetaFlow';
        case 'generic':
            return 'generic';
        default:
            return target;
    }
}

export function buildAdapterReadinessReports(
    options: BuildAdapterReadinessReportsOptions = {},
): AdapterReadinessReport[] {
    const targets = options.targets ?? ['codex', 'github-copilot'];
    const matrix = options.matrix ?? getTargetCapabilityMatrix(targets);
    const policyGrants = [...(options.policyGrants ?? [])].sort(byId);
    const mcpServers = [...(options.mcpServers ?? [])].sort(byId);
    const hooks = [...(options.hooks ?? [])].sort(byId);
    const executionProfiles = [...(options.executionProfiles ?? [])].sort(byId);
    const memoryScopes = [...(options.memoryScopes ?? [])].sort(byId);
    const evaluationProfiles = [...(options.evaluationProfiles ?? [])].sort(byId);
    const agentProfiles = [...(options.agentProfiles ?? [])].sort(byId);
    const codexProjectConfigs = [...(options.codexProjectConfigs ?? [])].sort(byId);

    return targets.map((target) => {
        const rows = matrix.filter((entry) => entry.target === target);
        const adapterVersion = rows[0]?.adapterVersion ?? 'unknown';
        const label = targetLabel(target);
        const targetHooks = hooks.filter((hook) => appliesToTarget(hook.targets, target));
        const targetExecutionProfiles = executionProfiles.filter((profile) =>
            appliesToTarget(profile.targets, target),
        );
        const targetMemoryScopes = memoryScopes.filter((scope) =>
            appliesToTarget(scope.targets, target),
        );
        const targetEvaluationProfiles = evaluationProfiles.filter((profile) =>
            appliesToTarget(profile.targets, target),
        );
        const targetAgentProfiles = agentProfiles.filter((profile) =>
            appliesToTarget(profile.targets, target),
        );
        const targetCodexProjectConfigs = codexProjectConfigs.filter((config) =>
            appliesToTarget(config.targets, target),
        );
        const counts: AdapterReadinessMetadataCounts = {
            agentProfiles: targetAgentProfiles.length,
            codexProjectConfigs: targetCodexProjectConfigs.length,
            policyGrants: policyGrants.length,
            mcpServers: mcpServers.length,
            hooks: targetHooks.length,
            executionProfiles: targetExecutionProfiles.length,
            memoryScopes: targetMemoryScopes.length,
            evaluationProfiles: targetEvaluationProfiles.length,
        };
        const policyRow = rowByConcept(rows, 'policyGrants');
        const mcpRow = rowByConcept(rows, 'mcpServers');
        const hookRow = rowByConcept(rows, 'hooks');
        const executionRow = rowByConcept(rows, 'executionSurfaces');
        const memoryRow = rowByConcept(rows, 'memoryScopes');
        const evaluationRow = rowByConcept(rows, 'evaluationSupport');
        const agentRow = rowByConcept(rows, 'agents');
        const projectConfigRow = rowByConcept(rows, 'projectConfig');
        const actionItems: AdapterReadinessAction[] = [];
        const warnings: string[] = [];

        for (const grant of policyGrants) {
            actionItems.push(
                action(
                    'policyGrants',
                    grant.id,
                    `${label} policy grant ${grant.id} (${grant.authority}) requires runtime authority review; MetaFlow metadata does not grant harness authority.`,
                    rowEvidence(policyRow),
                ),
            );
        }

        for (const server of mcpServers) {
            const secretText =
                server.requiredSecrets.length > 0
                    ? ` and secret review for ${server.requiredSecrets.join(', ')}`
                    : '';
            actionItems.push(
                action(
                    'mcpServers',
                    server.id,
                    `${label} MCP server ${server.id} requires target runtime MCP configuration, policy grants${secretText}.`,
                    rowEvidence(mcpRow),
                ),
            );
        }

        for (const hook of targetHooks) {
            actionItems.push(
                action(
                    'hooks',
                    hook.id,
                    `${label} hook ${hook.id} (${hook.triggerPhase}/${hook.invocationType}) requires target adapter materialization and runtime trust review before enforcement.`,
                    rowEvidence(hookRow),
                ),
            );
        }

        for (const profile of targetExecutionProfiles) {
            actionItems.push(
                action(
                    'executionSurfaces',
                    profile.id,
                    `${label} execution profile ${profile.id} (${profile.surface}/${profile.isolation}) requires execution surface selection and isolation review.`,
                    rowEvidence(executionRow),
                ),
            );
        }

        for (const scope of targetMemoryScopes) {
            actionItems.push(
                action(
                    'memoryScopes',
                    scope.id,
                    `${label} memory scope ${scope.id} (${scope.scopeType}/${scope.storage}) requires retention and authorization review.`,
                    rowEvidence(memoryRow),
                ),
            );
        }

        for (const profile of targetEvaluationProfiles) {
            actionItems.push(
                action(
                    'evaluationSupport',
                    profile.id,
                    `${label} evaluation profile ${profile.id} (${profile.evaluationType}) requires evaluation runner or check integration.`,
                    rowEvidence(evaluationRow),
                ),
            );
        }

        for (const profile of targetAgentProfiles) {
            actionItems.push(
                action(
                    'agents',
                    profile.id,
                    `${label} agent profile ${profile.id} requires target custom-agent review before operational use.`,
                    rowEvidence(agentRow),
                ),
            );
        }

        for (const config of targetCodexProjectConfigs) {
            actionItems.push(
                action(
                    'projectConfig',
                    config.id,
                    `${label} project config ${config.id} requires trusted-project and target configuration review before operational use.`,
                    rowEvidence(projectConfigRow),
                ),
            );
        }

        addRowWarnings(warnings, agentRow, counts.agentProfiles);
        addRowWarnings(warnings, projectConfigRow, counts.codexProjectConfigs);
        addRowWarnings(warnings, policyRow, counts.policyGrants);
        addRowWarnings(warnings, mcpRow, counts.mcpServers);
        addRowWarnings(warnings, hookRow, counts.hooks);
        addRowWarnings(warnings, executionRow, counts.executionProfiles);
        addRowWarnings(warnings, memoryRow, counts.memoryScopes);
        addRowWarnings(warnings, evaluationRow, counts.evaluationProfiles);

        return {
            target,
            adapterVersion,
            managedMetadata: counts,
            actionItems,
            warnings: uniqueSorted(warnings),
            evidence: uniqueSorted(actionItems.flatMap((item) => item.evidence)),
        };
    });
}
