import {
    CapabilityDiagnosticSeverity,
    ProjectionTarget,
    RuntimeEvidenceMetadata,
    RuntimeEvidenceStatus,
    TargetCapabilityConcept,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportReference,
    TargetCapabilitySupportStatus,
} from './types';

type MatrixSeed = Omit<TargetCapabilityMatrixEntry, 'adapterVersion' | 'documentation' | 'target'> & {
    documentation?: string;
};

const CODEX_ADAPTER_VERSION = 'codex-v0.1';
const GITHUB_COPILOT_ADAPTER_VERSION = 'github-copilot-v0.1';

export interface CodexSupportBoundariesDocument {
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    runtimeOnlyCount: number;
    fileBackedRows: TargetCapabilityMatrixEntry[];
    runtimeOnlyRows: TargetCapabilityMatrixEntry[];
    runtimeEvidenceCoverageSummary: CodexRuntimeEvidenceCoverageSummary;
    runtimeEvidenceWaiverSummary: CodexRuntimeEvidenceWaiverSummary;
    runtimeEvidenceCompletenessSummary: CodexRuntimeEvidenceCompletenessSummary;
    runtimeEvidenceCompletionBlockerSummary: CodexRuntimeEvidenceCompletionBlockerSummary;
    runtimeEvidenceCompletionReadinessSummary: CodexRuntimeEvidenceCompletionReadinessSummary;
    runtimeEvidenceGateSummary: CodexRuntimeEvidenceGateSummary;
    runtimeEvidenceReadinessSummary: CodexRuntimeEvidenceReadinessSummary;
    runtimeEvidenceActionPlan: CodexRuntimeEvidenceActionPlanItem[];
    runtimeEvidenceCompletionActionPlan: CodexRuntimeEvidenceActionPlanItem[];
    runtimeEvidenceChecklist: CodexRuntimeEvidenceChecklistItem[];
    technicalImpossibilitySummary: CodexTechnicalImpossibilitySummary;
    notAchievableByRepositoryProjection: string[];
    runtimeEvidenceExpected: string[];
    relatedGuides: string[];
    content: string;
}

export type CodexRuntimeEvidenceCoverageStatus = RuntimeEvidenceStatus | 'missing';

export interface CodexRuntimeEvidenceCoverageSummary {
    totalRuntimeOnlyConcepts: number;
    conceptsWithEvidence: number;
    conceptsWithoutEvidence: number;
    records: number;
    recordsWithWarnings: number;
    conceptsWithWarnings: number;
    conceptsWithEvidenceWithoutDiagnostics: number;
    conceptsWithEvidenceWithDiagnostics: number;
    diagnosticRecordsBySeverity: Record<CapabilityDiagnosticSeverity, number>;
    diagnosticConceptsBySeverity: Record<CapabilityDiagnosticSeverity, number>;
    recordsWithExpiredEvidence: number;
    conceptsWithExpiredEvidence: number;
    recordsWithStaleAdapterVersion: number;
    conceptsWithStaleAdapterVersion: number;
    conceptsWithErrorRecords: TargetCapabilityConcept[];
    conceptsWithExpiredEvidenceRecords: TargetCapabilityConcept[];
    conceptsWithStaleAdapterVersionRecords: TargetCapabilityConcept[];
    byStatus: Record<CodexRuntimeEvidenceCoverageStatus, number>;
    conceptsByStatus: Record<CodexRuntimeEvidenceCoverageStatus, TargetCapabilityConcept[]>;
    conceptsWithWarningRecords: TargetCapabilityConcept[];
    conceptsWithEvidenceWithoutDiagnosticRecords: TargetCapabilityConcept[];
    conceptsWithEvidenceWithDiagnosticRecords: TargetCapabilityConcept[];
}

export interface CodexRuntimeEvidenceWaiverSummaryItem {
    concept: TargetCapabilityConcept;
    runtimeEvidenceRecordIds: string[];
    limitations: string[];
    notAchievableByRepositoryProjection: string;
    authorityImplications: string[];
}

export interface CodexRuntimeEvidenceWaiverSummary {
    waivedConcepts: number;
    waivedRecords: number;
    notAchievableByRepositoryProjectionItems: number;
    concepts: TargetCapabilityConcept[];
    items: CodexRuntimeEvidenceWaiverSummaryItem[];
}

export interface CodexRuntimeEvidenceCompletenessSummary {
    releaseReady: boolean;
    runtimeComplete: boolean;
    runtimeOnlyConcepts: number;
    passedConcepts: number;
    partialConcepts: number;
    waivedConcepts: number;
    missingConcepts: number;
    failedConcepts: number;
    notRunConcepts: number;
    diagnosticConcepts: number;
    expiredEvidenceConcepts: number;
    staleAdapterVersionConcepts: number;
    remainingCompletionActionItems: number;
    repositoryProjectionImpossibleItems: number;
    partialConceptList: TargetCapabilityConcept[];
    waivedConceptList: TargetCapabilityConcept[];
    blockingConditions: CodexRuntimeEvidenceGateCondition[];
}

export interface CodexTechnicalImpossibilitySummary {
    repositoryProjectionImpossibleItems: number;
    externalAuthorityItems: number;
    hostedOrNetworkItems: number;
    appOrPlatformItems: number;
    runtimeNativeProofItems: number;
    items: string[];
}

export interface CodexRuntimeEvidenceCompletionBlockerSummaryItem {
    concept: TargetCapabilityConcept;
    runtimeEvidenceRecordIds: string[];
    runtimeEvidenceLimitations: string[];
    nativeSurfaces: string[];
    authorityImplications: string[];
    runtimeEvidenceExpected: string;
}

export interface CodexRuntimeEvidenceCompletionBlockerSummary {
    partialConcepts: number;
    partialRecords: number;
    limitationItems: number;
    authorityImplicationItems: number;
    nativeSurfaceItems: number;
    concepts: TargetCapabilityConcept[];
    items: CodexRuntimeEvidenceCompletionBlockerSummaryItem[];
}

export type CodexRuntimeEvidenceCompletionReadinessCategory =
    | 'current-environment-candidate'
    | 'requires-external-authority'
    | 'requires-hosted-or-network-surface'
    | 'requires-app-or-platform-surface';

export interface CodexRuntimeEvidenceCompletionReadinessItem {
    concept: TargetCapabilityConcept;
    categories: CodexRuntimeEvidenceCompletionReadinessCategory[];
    runtimeEvidenceRecordIds: string[];
    nextEvidenceRequired: string;
}

export interface CodexRuntimeEvidenceCompletionReadinessSummary {
    partialConcepts: number;
    currentEnvironmentCandidates: number;
    externalAuthorityBoundConcepts: number;
    hostedOrNetworkBoundConcepts: number;
    appOrPlatformBoundConcepts: number;
    currentEnvironmentCandidateConcepts: TargetCapabilityConcept[];
    externalAuthorityBoundConceptsList: TargetCapabilityConcept[];
    hostedOrNetworkBoundConceptsList: TargetCapabilityConcept[];
    appOrPlatformBoundConceptsList: TargetCapabilityConcept[];
    items: CodexRuntimeEvidenceCompletionReadinessItem[];
}

export type CodexRuntimeEvidenceGateCondition =
    | 'missing-evidence'
    | 'diagnostics'
    | 'error-diagnostics'
    | 'failed'
    | 'not-run'
    | 'partial';

export interface CodexRuntimeEvidenceGateResult {
    condition: CodexRuntimeEvidenceGateCondition;
    triggered: boolean;
    count: number;
    concepts: TargetCapabilityConcept[];
    message: string;
}

export type CodexRuntimeEvidenceGateSummary = Record<
    CodexRuntimeEvidenceGateCondition,
    CodexRuntimeEvidenceGateResult
>;

export interface CodexRuntimeEvidenceReadinessSummary {
    preset: 'release-ready';
    ready: boolean;
    blockingConditions: CodexRuntimeEvidenceGateCondition[];
    blockingMessages: string[];
    checkedConditions: CodexRuntimeEvidenceGateCondition[];
}

export type CodexRuntimeEvidenceActionKind =
    | 'collect-runtime-evidence'
    | 'review-runtime-diagnostics'
    | 'rerun-failed-evidence'
    | 'run-not-run-evidence'
    | 'complete-partial-runtime-evidence';

export interface CodexRuntimeEvidenceActionPlanConceptDetail {
    concept: TargetCapabilityConcept;
    coverageStatus: CodexRuntimeEvidenceCoverageStatus;
    nativeSurfaces: string[];
    runtimeEvidenceExpected: string;
    authorityImplications: string[];
    runtimeEvidenceRecordIds: string[];
    runtimeEvidenceLimitations: string[];
}

export interface CodexRuntimeEvidenceActionPlanItem {
    kind: CodexRuntimeEvidenceActionKind;
    condition: CodexRuntimeEvidenceGateCondition;
    blockingReadiness: boolean;
    concepts: TargetCapabilityConcept[];
    conceptDetails: CodexRuntimeEvidenceActionPlanConceptDetail[];
    message: string;
}

export interface CodexRuntimeEvidenceChecklistItem {
    concept: TargetCapabilityMatrixEntry['concept'];
    nativeSurfaces: string[];
    notAchievableByRepositoryProjection: string;
    runtimeEvidenceExpected: string;
    authorityImplications: string[];
    evidence: string[];
    runtimeEvidenceRecords: RuntimeEvidenceMetadata[];
    coverageStatus: CodexRuntimeEvidenceCoverageStatus;
}

export interface CodexRuntimeEvidenceGuideConcept {
    concept: TargetCapabilityConcept;
    coverageStatus: CodexRuntimeEvidenceCoverageStatus;
    nativeSurfaces: string[];
    authorityImplications: string[];
    runtimeEvidenceExpected: string;
    notAchievableByRepositoryProjection: string;
    evidence: string[];
    runtimeEvidenceRecordIds: string[];
    suggestedTemplateCommand: string;
    suggestedScaffoldPath: string;
    collectionChecklist: string[];
}

export interface CodexRuntimeEvidenceGuideDocument {
    schemaVersion: 'metaflow.runtimeEvidenceGuide/v1';
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    target: 'codex';
    concepts: CodexRuntimeEvidenceGuideConcept[];
    content: string;
}

export interface CodexRuntimeEvidenceTemplateRecord {
    suggestedPath: string;
    content: {
        schemaVersion: 'metaflow.runtimeEvidence/v1';
        id: string;
        target: 'codex';
        concepts: TargetCapabilityConcept[];
        harness: string;
        adapterVersion: string;
        scenario: string;
        status: RuntimeEvidenceStatus;
        command: string;
        evidence: string[];
        evidenceArtifacts: Array<{
            kind: 'report';
            ref: string;
            description: string;
        }>;
        limitations: string[];
        policyGrants: string[];
        description: string;
    };
}

export interface CodexRuntimeEvidenceTemplateDocument {
    schemaVersion: 'metaflow.runtimeEvidenceTemplate/v1';
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    target: 'codex';
    source:
        | 'runtimeEvidenceActionPlan'
        | 'runtimeEvidenceCompletionActionPlan'
        | 'runtimeEvidenceChecklist';
    filters?: {
        concepts: TargetCapabilityConcept[];
        queue?: CodexRuntimeEvidenceReviewQueueId;
    };
    runtimeEvidenceCompletionReadinessSummary?: CodexRuntimeEvidenceCompletionReadinessSummary;
    completionReadinessItems?: CodexRuntimeEvidenceCompletionReadinessItem[];
    records: CodexRuntimeEvidenceTemplateRecord[];
}

export const CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS = [
    'all',
    'release-ready',
    'runtime-complete',
    'completion-readiness',
    'completion-readiness-current-environment',
    'completion-readiness-external-authority',
    'completion-readiness-hosted-network',
    'completion-readiness-app-platform',
    'missing-evidence',
    'diagnostics',
    'error-diagnostics',
    'failed',
    'not-run',
    'partial',
    'expired-evidence',
    'stale-adapter-version',
    'waived',
] as const;

export type CodexRuntimeEvidenceReviewQueueId =
    (typeof CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS)[number];

export interface CodexRuntimeEvidenceReviewQueueDocument {
    schemaVersion: 'metaflow.runtimeEvidenceReviewQueue/v1';
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    target: 'codex';
    queue: CodexRuntimeEvidenceReviewQueueId;
    concepts: TargetCapabilityConcept[];
    runtimeEvidenceCompletionReadinessSummary?: CodexRuntimeEvidenceCompletionReadinessSummary;
    completionReadinessItems?: CodexRuntimeEvidenceCompletionReadinessItem[];
    content: string;
}

export interface CodexProjectionBoundarySummary {
    fileBackedRows: number;
    runtimeOnlyRows: number;
    unsupportedRows: number;
    notAchievableItems: number;
    authoritySensitiveRuntimeOnlyRows: number;
    runtimeEvidenceExpectedItems: number;
}

export interface CodexProjectionBoundaryRuntimeItem {
    concept: TargetCapabilityConcept;
    nativeSurfaces: string[];
    boundary: string;
    authorityImplications: string[];
    evidence: string[];
}

export interface CodexProjectionBoundaryFileBackedItem {
    concept: TargetCapabilityConcept;
    support: TargetCapabilitySupportStatus;
    nativeSurfaces: string[];
    notes: string[];
    evidence: string[];
}

export interface CodexProjectionBoundaryDocument {
    schemaVersion: 'metaflow.codexProjectionBoundary/v1';
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    target: 'codex';
    summary: CodexProjectionBoundarySummary;
    fileBackedSurfaces: CodexProjectionBoundaryFileBackedItem[];
    runtimeOnlySurfaces: CodexProjectionBoundaryRuntimeItem[];
    unsupportedSurfaces: CodexProjectionBoundaryFileBackedItem[];
    technicalImpossibilitySummary: CodexTechnicalImpossibilitySummary;
    notAchievableByRepositoryProjection: string[];
    runtimeEvidenceExpected: string[];
    relatedGuides: string[];
    content: string;
}

function row(
    concept: MatrixSeed['concept'],
    support: TargetCapabilitySupportStatus,
    nativeSurfaces: string[],
    notes: string[],
    authorityImplications: string[] = [],
    evidence: string[] = [],
    documentation?: string,
): MatrixSeed {
    return {
        concept,
        support,
        nativeSurfaces,
        notes,
        authorityImplications,
        evidence,
        ...(documentation ? { documentation } : {}),
    };
}

const CODEX_MATRIX: MatrixSeed[] = [
    row(
        'instructions',
        'supported',
        [
            '.metaflow/instructions/*.json',
            '.metaflow/instructions/*.md',
            'AGENTS.md',
            'AGENTS.override.md',
        ],
        [
            'Canonical MetaFlow instruction files project to shared instruction artifacts.',
            'Root project instructions materialize as guarded repository-root Codex files.',
        ],
        [],
        ['RUN-023'],
    ),
    row(
        'prompts',
        'partial',
        [
            '.metaflow/prompts/*.json',
            '.metaflow/prompts/*.md',
            '~/.codex/prompts/*.md (deprecated local-only)',
        ],
        [
            'Canonical MetaFlow prompt metadata is parsed and reported for adapter review.',
            'Codex custom prompts are deprecated explicit slash-command files in the local Codex home directory, not repository-shared metadata.',
            'Shared reusable Codex workflows should be represented as skills rather than projected prompt files.',
        ],
        [],
        ['RUN-052', 'RUN-066'],
    ),
    row(
        'skills',
        'supported',
        [
            '.metaflow/skills/<skill-id>/skill.json',
            '.metaflow/skills/<skill-id>/SKILL.md',
            '.agents/skills/<skill-id>/SKILL.md',
        ],
        [
            'Canonical MetaFlow skills project to Codex repository skills without known semantic loss.',
        ],
        [],
        ['RUN-028', 'RUN-029', 'RUN-030'],
    ),
    row(
        'agents',
        'partial',
        ['.codex/agents/*.toml'],
        [
            'Target-native Codex agent files are materialized safely when authored.',
            'Canonical MetaFlow agent profiles project to Codex custom-agent TOML according to target adapter materialization gates.',
            'Codex loads project-scoped custom agents as subagent configuration layers, and installed Codex CLI 0.142.3 reports the multi_agent feature as stable and enabled, but it does not expose a non-interactive named custom-agent activation flag or debug prompt-input proof for repo-local agent TOML.',
        ],
        ['Agent files can imply tool or model authority and require policy review.'],
        ['RUN-024', 'RUN-042', 'RUN-055'],
    ),
    row(
        'agentRuntime',
        'runtime-only',
        [
            'Codex subagent workflows',
            'Codex CLI /agent threads',
            'Codex app subagent activity',
            'project and user custom-agent config layers',
        ],
        [
            'Repository metadata can describe and project custom-agent configuration, but it cannot spawn subagents, choose an agent for a task, manage active agent threads, satisfy runtime approvals, or prove that a custom agent executed.',
            'Codex subagents inherit the parent session sandbox and approval posture at runtime, and live overrides or interactive approvals are not represented by static metadata projection.',
            'Subagent orchestration, concurrency limits, nested delegation depth, thread lifecycle, model selection at spawn time, and consolidated results require harness-native evidence.',
        ],
        [
            'Subagents can consume tokens, run tools, request approvals, inspect repository data, and perform writes under inherited runtime authority.',
        ],
        ['RUN-072', 'RUN-167'],
    ),
    row(
        'automationRuntime',
        'runtime-only',
        [
            'Codex app automations',
            'thread automations',
            'standalone automations',
            'project automations',
            'automation background worktrees',
        ],
        [
            'Codex automations are scheduled runtime state in the Codex app and are not repository metadata projection.',
            'Repository metadata can describe automation intent and reusable skills, but it cannot create or update scheduled automations, keep the local machine and Codex app running, select local versus worktree execution, manage Triage runs, archive runs, or prove scheduled execution.',
            'Automation runs inherit Codex runtime sandbox settings, can use available skills and plugins, and can run unattended with approval behavior controlled by user or organization policy.',
        ],
        [
            'Automations can run unattended, modify local files or worktrees, use plugins and skills, access connected sources, consume tokens, and run under sandbox or approval policy selected outside repository metadata.',
        ],
        ['RUN-073'],
    ),
    row(
        'authenticationRuntime',
        'runtime-only',
        [
            'Codex sign-in session',
            'ChatGPT workspace identity',
            'OpenAI API key authentication',
            'Codex access tokens',
            'connected GitHub account',
        ],
        [
            'Codex authentication is host runtime state across ChatGPT sign-in, API key sign-in, access-token automation, local credential storage, workspace policy, and connected account state.',
            'Repository metadata can describe required authentication posture and validation evidence, but it cannot sign in users, create or store API keys or Codex access tokens, connect GitHub accounts, select a ChatGPT workspace identity, satisfy admin policy, or prove authenticated runtime behavior.',
            'Authentication method determines whether ChatGPT workspace permissions, enterprise retention and residency, API organization settings, Codex Local permissions, access-token permissions, MFA, SSO, RBAC, and GitHub connector authority apply.',
        ],
        [
            'Authenticated sessions and tokens can expose workspace identity, repositories, cloud tasks, connectors, billing posture, audit records, and organization policy obligations.',
        ],
        ['RUN-074'],
    ),
    row(
        'permissionRuntime',
        'runtime-only',
        [
            'Codex sandbox enforcement',
            'approval prompts',
            'permission profiles',
            'auto-review reviewer decisions',
            'managed requirements',
            'network policy enforcement',
        ],
        [
            'Codex permissions are enforced by the active runtime through sandbox mode, approval policy, permission profiles, network controls, managed requirements, app and MCP tool annotations, and optional auto-review.',
            'Repository metadata can describe desired permission posture, command rules, policy grants, and validation evidence, but it cannot grant runtime permissions, approve boundary-crossing actions, select effective managed requirements, run auto-review decisions, enforce OS sandboxing, or prove permission behavior.',
            'Permission behavior depends on the active Codex surface, trusted project state, OS sandbox support, user or admin settings, interactive approvals, granular approval policy, permission profile selection, and managed configuration precedence.',
        ],
        [
            'Runtime permissions control filesystem writes, network access, command escalation, app and MCP side effects, browser domains, protected paths, credential exposure, and organization policy enforcement.',
        ],
        ['RUN-075'],
    ),
    row(
        'enterprisePolicyRuntime',
        'runtime-only',
        [
            'Codex managed configuration',
            'cloud-managed requirements.toml policies',
            'Codex admin group assignment',
            'macOS managed preferences',
            'system requirements.toml',
            'feature and marketplace policy pins',
        ],
        [
            'Codex enterprise policy is admin-managed runtime state across cloud-managed requirements, device-managed preferences, system requirements files, group assignment, and local managed-configuration precedence.',
            'Repository metadata can describe required governance posture, policy grants, and validation evidence, but it cannot assign Codex Admin roles, assign managed policies to user groups, fetch signed managed requirements, write device-level policy, choose the effective policy layer, enforce feature pins, constrain plugin marketplace sources, or prove policy behavior.',
            'Managed configuration can constrain approval policies, approval reviewers, automatic review policy, sandbox modes, permission profiles, web search behavior, MCP server allowlists, plugin marketplace sources, command rules, feature flags, Browser Use, Computer Use, Appshots, and remote-control behavior.',
        ],
        [
            'Enterprise policy can restrict or permit shell, browser, network, MCP, plugin, marketplace, review, remote-control, and desktop automation authority and requires administrator ownership, auditability, and fleet-version controls.',
        ],
        ['RUN-079'],
    ),
    row(
        'projectConfig',
        'partial',
        ['.codex/config.toml', '.metaflow/project-config/*.json'],
        [
            'Canonical MetaFlow Codex project configs project to Codex TOML according to target adapter materialization gates.',
            'Codex project configs are loaded by Codex only in trusted projects and cannot override provider, profile, notification, or telemetry keys.',
        ],
        [
            'Project configuration can alter sandbox, approval, hooks, MCP, model, and search behavior and requires explicit review.',
        ],
        ['RUN-024', 'RUN-043'],
    ),
    row(
        'worktreeInclude',
        'partial',
        ['.worktreeinclude', 'Codex app managed worktrees', '.gitignore-style copy patterns'],
        [
            'Codex worktree include files list ignored setup paths that the local Codex app copies into new Codex-managed worktrees.',
            'MetaFlow can materialize guarded `.worktreeinclude` files and report the intended copy policy, but it cannot create Codex-managed worktrees, copy ignored files, overwrite existing files, copy source symlinks, or prove copied-file availability.',
            'Codex automatically copies ignored `AGENTS.override.md` into local managed worktrees, so `.worktreeinclude` does not need to list it.',
        ],
        [
            'Ignored setup files can include secrets, credentials, tokens, local endpoints, or machine-specific configuration and require explicit copy-scope review.',
        ],
        ['RUN-080'],
    ),
    row(
        'commandRules',
        'partial',
        ['.codex/rules/*.rules', 'Codex rules config layers', 'Codex execpolicy check'],
        [
            'Codex command rules control which command prefixes can run outside the sandbox.',
            'MetaFlow can materialize guarded project-local `.codex/rules/*.rules` files and report rule authority, but Codex loads project-local rules only for trusted project config layers and after Codex startup.',
            'Rule syntax, matching behavior, shell-wrapper splitting, and admin-enforced requirements remain Codex runtime policy concerns.',
        ],
        [
            'Command rules can allow, prompt for, or forbid escalated commands and require explicit policy review.',
        ],
        ['RUN-024', 'RUN-064'],
    ),
    row(
        'mcpServers',
        'partial',
        ['.metaflow/mcp/*.json', 'Codex MCP configuration and runtime MCP server registry'],
        [
            'Canonical MCP server metadata is parsed and reported for adapter review.',
            'Codex supports MCP at runtime through CLI and IDE shared project or user config.',
            'Canonical MetaFlow stdio and Streamable HTTP MCP server metadata projects to Codex project config according to target adapter materialization gates.',
            'Canonical project config and supported MCP sections share one Codex project config file when each concept is managed by the target adapter.',
            'Projected MCP options include command arguments, literal environment, forwarded environment variables, working directory, bearer-token environment mapping, HTTP headers, OAuth scopes and resource, timeouts, enablement, requirement flags, tool allow and deny lists, and tool approval modes.',
            'Side-effecting MCP tools, OAuth login, remote stdio, Streamable HTTP reachability, and agent-phase network access remain runtime concerns that require harness-native evidence.',
        ],
        [
            'MCP servers require explicit tool, secret, approval, OAuth callback, and network authority review.',
        ],
        ['RUN-033', 'RUN-045', 'RUN-046', 'RUN-047', 'RUN-048', 'RUN-050', 'RUN-052'],
    ),
    row(
        'tools',
        'partial',
        ['.metaflow/tools/*.json', 'Codex MCP tools', 'local commands', 'HTTP tools'],
        [
            'Canonical tool metadata is parsed and reported for adapter review.',
            'MetaFlow tool manifests describe callable surfaces and policy requirements but do not grant Codex runtime tool access.',
            'Command, MCP, HTTP, and manual tools remain operational only when the target harness has matching configured authority.',
        ],
        [
            'Tool use requires explicit command, MCP, network, secret, approval, and sandbox authority review.',
        ],
        ['RUN-052'],
        'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
    ),
    row(
        'hooks',
        'partial',
        ['.metaflow/hooks/*.json', '.codex/hooks.json'],
        [
            'Canonical hook metadata is parsed and reported for adapter review.',
            'Target-native Codex hook policy files are materialized safely when authored.',
            'Supported canonical MetaFlow command lifecycle hooks project to Codex hook JSON according to target adapter materialization gates.',
            'Unsupported canonical hook forms remain report-only adapter metadata.',
        ],
        ['Hooks execute code or commands and require explicit trust and sandbox review.'],
        ['RUN-024', 'RUN-034', 'RUN-044', 'RUN-049'],
    ),
    row(
        'packageManifests',
        'supported',
        ['.metaflow/packages/*.json', '.codex-plugin/plugin.json', '.agents/plugins/marketplace.json'],
        [
            'Codex plugin manifests and local marketplace entries are generated separately from Copilot plugin metadata.',
        ],
        ['Third-party plugin packages must be treated as trusted code.'],
        ['RUN-025', 'RUN-026', 'RUN-027'],
        'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
    ),
    row(
        'pluginRuntime',
        'runtime-only',
        ['Codex plugin directory', 'installed Codex plugins', 'plugin enablement', 'plugin app and MCP setup'],
        [
            'Codex plugin manifests and marketplace catalogs are repository metadata, but plugin installation, enabled state, workspace sharing, app authentication, MCP setup, restart discovery, and task-time activation are Codex runtime behavior.',
            'Repository metadata can publish reviewable plugin package and marketplace candidates, but it cannot install plugins into Codex, enable them for a user, authenticate bundled apps, complete MCP setup, share plugins with a workspace, or prove that Codex invoked the plugin in a thread.',
        ],
        [
            'Installed plugins can expose skills, apps, MCP servers, hooks, credentials, and external-service authority and require explicit trust, authentication, and data-sharing review.',
        ],
        ['RUN-069'],
    ),
    row(
        'policyGrants',
        'partial',
        ['.metaflow/policies/*.json'],
        [
            'Canonical policy grant metadata is parsed and reported for adapter review.',
            'Policy grants do not directly grant Codex runtime authority.',
        ],
        ['Authority-sensitive projections remain guarded until explicit harness adapters exist.'],
        ['RUN-032'],
    ),
    row(
        'executionSurfaces',
        'partial',
        [
            '.metaflow/execution/*.json',
            'local Codex CLI',
            'Codex Cloud',
            'Codex issue/PR workflows',
            'Codex GitHub Action',
            'Codex app-server',
            'Codex SDK',
            'always-on workflow orchestrators',
        ],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Codex execution surface selection remains a runtime workflow until explicit projection adapters exist.',
            'Codex cloud environments use hosted containers, setup scripts, environment variables, secret handling, and agent internet-access controls outside repository metadata projection.',
            'Execution profiles can classify issue/PR-native, GitHub Action, app-server, SDK-embedded, and always-on workflow surfaces without provisioning those runtimes.',
        ],
        [
            'Execution surface selection changes filesystem, network, credential, and approval boundaries.',
        ],
        ['RUN-035', 'RUN-052', 'RUN-062'],
    ),
    row(
        'memoryScopes',
        'partial',
        ['.metaflow/memory/*.json'],
        [
            'Canonical memory scope metadata is parsed and reported for adapter review.',
            'Canonical memory scope metadata records intended memory boundaries, retention, sharing, and policy posture.',
            'Codex memory generation and injection remain runtime workflows governed by Codex settings and thread controls.',
        ],
        ['Persistent memory requires explicit authorization and retention policy.'],
        ['RUN-036'],
    ),
    row(
        'memoryRuntime',
        'runtime-only',
        ['Codex Memories', 'Codex home memory files', 'Codex app and TUI /memories controls'],
        [
            'Codex Memories are opt-in runtime state stored under the Codex home directory and controlled by Codex settings or per-thread controls.',
            'Repository metadata can describe intended memory boundaries, but it cannot enable Memories, generate or inject memory files, authorize thread memory use, or prove memory recall behavior.',
            'Required team guidance belongs in checked-in instructions or documentation rather than generated memory state.',
        ],
        [
            'Persistent memory can retain user, repository, organization, and task context and requires retention, sharing, consent, and secret-review controls.',
        ],
        ['RUN-067'],
    ),
    row(
        'chronicleRuntime',
        'runtime-only',
        [
            'Codex Chronicle',
            'Codex app Personalization settings',
            'macOS Screen Recording permission',
            'macOS Accessibility permission',
            'Chronicle screen context memories',
        ],
        [
            'Chronicle is opt-in Codex app runtime state on macOS that augments Codex Memories with recent screen context and is not repository metadata projection.',
            'Repository metadata can describe Chronicle evidence expectations, but it cannot enable Memories, turn on Chronicle, grant macOS Screen Recording or Accessibility permissions, pause or resume Chronicle, create or remove Chronicle memories, process screen captures, or prove Chronicle recall behavior.',
            'Chronicle-generated memories are stored locally under the Codex home directory and screen captures are temporarily stored on device while Chronicle is running.',
        ],
        [
            'Chronicle can expose visible screen content, OCR text, local file paths, tool and workflow context, and generated memory content; it increases prompt-injection risk and requires explicit consent, privacy, retention, and sensitive-content controls.',
        ],
        ['RUN-078'],
    ),
    row(
        'appshotsRuntime',
        'runtime-only',
        [
            'Codex app Appshots',
            'frontmost window image attachment',
            'frontmost window available text attachment',
            'macOS Screen & System Audio Recording permission',
            'macOS Accessibility permission',
        ],
        [
            'Appshots are Codex app runtime attachments on macOS that send the frontmost app window image and available text to a Codex thread.',
            'Repository metadata can describe Appshots evidence expectations, but it cannot create an appshot, select the frontmost window, capture visible images or available text, grant macOS Screen & System Audio Recording or Accessibility permissions, attach appshots to the intended thread, or prove thread behavior.',
            'Appshots are stored locally in the Codex session file and behave like manually attached files or images after capture.',
        ],
        [
            'Appshots can expose visible window content, available off-screen text exposed by the app, screenshots, local session attachments, app context, private messages, documents, settings, and credentials if visible; they require explicit consent and sensitive-content review.',
        ],
        ['RUN-082'],
    ),
    row(
        'recordReplayRuntime',
        'runtime-only',
        [
            'Codex app Record & Replay',
            'Record a skill',
            'generated Codex skills',
            'Computer Use and browser replay',
        ],
        [
            'Record & Replay is Codex app runtime state on macOS, requires Computer Use availability, and is not repository metadata projection.',
            'Repository metadata can describe reusable workflow intent and expected evidence, but it cannot start a recording, capture UI actions or window content, generate or refine the resulting skill, enable Computer Use, or prove replay behavior.',
            'Generated Record & Replay skills require sensitive-data review before sharing; stable team packages still use plugin packaging and skills metadata.',
        ],
        [
            'Record & Replay can expose app and window content, preferences, credentials if demonstrated, plugins, browser and Computer Use authority, and external accounts; it requires consent and data review.',
        ],
        ['RUN-081'],
    ),
    row(
        'importRuntime',
        'runtime-only',
        [
            'Codex app Import other agent setup',
            'AGENTS.md import',
            'config.toml import',
            'skills, plugins, MCP, hooks, and subagents import',
            'recent chat session import',
        ],
        [
            'Import to Codex is Codex app runtime state that detects supported user and project setup, imports selected items, leaves existing setup unchanged, and flags plugins or connections needing follow-up setup.',
            'Repository metadata can describe import review expectations, but it cannot launch the app import flow, select external agent sources or items, migrate local user settings or sessions, authorize plugins or connectors, or prove imported setup behavior.',
            'Imported permissions, tool restrictions, MCP auth, hooks, plugins, prompts, and subagents require operator review after import.',
        ],
        [
            'Import can carry tool restrictions, hooks, MCP auth, environment or header configuration, plugins, marketplaces, subagents, project folders, recent sessions, and connection setup obligations; it requires review.',
        ],
        ['RUN-081'],
    ),
    row(
        'modelProviderRuntime',
        'runtime-only',
        [
            'Codex model provider selection',
            'amazon-bedrock model provider',
            '~/.codex/config.toml model_provider',
            '~/.codex/.env provider credentials',
            'AWS IAM or Bedrock API key authentication',
        ],
        [
            'Codex model-provider selection is user or environment runtime configuration and is not safe project metadata projection.',
            'Repository metadata can describe provider intent and evidence requirements, but it cannot select the active Codex model provider, write user-global config or credential files, configure AWS IAM or Bedrock API keys, choose AWS Regions, grant model access, restart apps or extensions, or prove provider routing.',
            'Amazon Bedrock support is local-workflow provider routing; OpenAI-hosted cloud services, hosted tools, cloud-managed discovery, Fast Mode, and ChatGPT-authenticated connector behavior require separate runtime evidence.',
        ],
        [
            'Model-provider configuration can route code and prompts through external provider infrastructure, expose AWS identity and billing posture, require regional model availability, depend on local environment inheritance, and change which hosted Codex features are available.',
        ],
        ['RUN-083'],
    ),
    row(
        'nonInteractiveRuntime',
        'runtime-only',
        [
            'codex exec',
            'Codex non-interactive mode',
            'CI, pre-merge, scheduled, or scripted automation',
            'CODEX_API_KEY',
            'CODEX_ACCESS_TOKEN',
            'codex exec --json',
            'codex exec --output-schema',
        ],
        [
            'Codex non-interactive mode is a CLI runtime for scripted or pipeline execution and is not repository metadata projection.',
            'Repository metadata can describe automation intent, policy expectations, structured output requirements, and evidence requirements, but it cannot invoke `codex exec`, choose live credentials, select the active sandbox or approval posture, create JSONL or schema-constrained output, resume sessions, satisfy the Git repository safety check, or prove run behavior.',
            'For GitHub Actions, the Codex GitHub Action is the preferred hosted automation surface; standalone `codex exec` still requires runtime authentication and safety controls.',
        ],
        [
            'Non-interactive Codex execution can read and edit files, run commands, use configured tools and MCP servers, consume credentials, emit CI artifacts, and drive downstream automation; it requires explicit sandbox, approval, credential, repository-trust, and output-handling controls.',
        ],
        ['RUN-088'],
    ),
    row(
        'sdkRuntime',
        'runtime-only',
        [
            'Codex SDK',
            '@openai/codex-sdk',
            'openai-codex Python package',
            'Codex TypeScript SDK',
            'Codex Python SDK',
            'Codex app-server JSON-RPC runtime',
            'SDK thread start and resume',
            'SDK sandbox presets',
        ],
        [
            'Codex SDK integrations are application runtime behavior and are not repository metadata projection.',
            'Repository metadata can describe SDK integration intent, policy expectations, and evidence requirements, but it cannot install SDK packages, provision Node.js or Python runtimes, start local app-server processes, initialize SDK clients, select credentials, create or resume SDK threads, choose live sandbox presets, deploy embedding applications, capture traces, or prove SDK behavior.',
            'SDK usage can be more flexible than non-interactive mode and requires integration-specific runtime evidence for the embedding application, process sandbox, credentials, thread lifecycle, and deployed environment.',
        ],
        [
            'SDK integrations can run Codex under application, CI, or internal-tool authority, read and write repository files, execute commands, expose traces or logs, consume credentials, and route data through deployed application infrastructure.',
        ],
        ['RUN-089'],
    ),
    row(
        'appServerRuntime',
        'runtime-only',
        [
            'codex app-server',
            'Codex app-server JSON-RPC 2.0 runtime',
            'stdio app-server transport',
            'WebSocket app-server transport',
            'Unix socket app-server transport',
            'initialize / initialized handshake',
            'thread/start, thread/resume, thread/fork',
            'turn/start, turn/steer, turn/interrupt',
            'app-server schema generation',
        ],
        [
            'Codex app-server integrations are process and protocol runtime behavior and are not repository metadata projection.',
            'Repository metadata can describe app-server integration intent, policy expectations, schema expectations, and evidence requirements, but it cannot start app-server processes, choose live transports, authenticate WebSocket listeners, initialize JSON-RPC clients, create or resume threads, start or steer turns, manage event streams, handle overload or retry behavior, generate version-matched schemas, or prove app-server behavior.',
            'App-server WebSocket transport is experimental and unsupported; non-loopback listeners require explicit authentication posture before exposure.',
        ],
        [
            'App-server integrations can expose local or remote control over Codex threads, repository files, command execution, event streams, telemetry, credentials, and hosted application authority and require explicit transport, authentication, sandbox, approval, and client-identity review.',
        ],
        ['RUN-090'],
    ),
    row(
        'ideExtensionRuntime',
        'runtime-only',
        [
            'Codex IDE extension',
            'VS Code-compatible editor sidebar',
            'Codex IDE Command Palette commands',
            'open files context',
            'selected text range context',
            'Add to Codex Thread',
            'IDE file tagging',
            'IDE model selector',
            'shared CLI and IDE config.toml',
            'IDE extension cloud preview and continue-local workflow',
        ],
        [
            'Codex IDE extension behavior is editor runtime state and not repository metadata projection.',
            'Repository metadata can describe IDE-extension intent, context expectations, policy expectations, and evidence requirements, but it cannot install the extension, open or focus the sidebar, select the active workspace or editor, choose open files or selected text, invoke Command Palette actions, add editor selections to a thread, tag files in a prompt, select the IDE model, reload the extension, authenticate the editor session, configure WSL execution in VS Code settings, preview cloud changes, continue local threads, or prove IDE behavior.',
            'The IDE extension shares Codex CLI configuration and authentication cache, but live editor state and VS Code-compatible host behavior require runtime evidence.',
        ],
        [
            'IDE extension integrations can expose open file and selected text context, local workspace files, editor state, configured MCP servers, plugins, skills, command execution, cloud task handoff, credentials, and hosted or local agent authority; require explicit editor host, workspace trust, sandbox, approval, config, authentication, and context-scope review.',
        ],
        ['RUN-091'],
    ),
    row(
        'windowsPlatformRuntime',
        'runtime-only',
        [
            'Codex Windows app',
            'native Windows elevated sandbox',
            'native Windows unelevated sandbox',
            'windows.sandbox_private_desktop',
            'WSL2 Linux sandbox',
            '/sandbox-add-read-dir',
        ],
        [
            'Codex Windows platform behavior is host runtime state across native Windows, fallback native sandboxing, and WSL2 execution.',
            'Repository metadata can describe Windows platform intent and evidence requirements, but it cannot select the effective Windows sandbox, perform administrator-approved setup, change enterprise requirements, grant session read directories, move repositories into WSL2, verify ConPTY or winget availability, or prove sandbox enforcement.',
            'WSL2 uses the Linux sandbox implementation and WSL1 is not supported by current Codex Linux sandbox behavior.',
        ],
        [
            'Windows platform configuration controls filesystem boundaries, network isolation, private desktop behavior, administrator setup, enterprise policy compatibility, WSL repository location, and command access to local directories.',
        ],
        ['RUN-084'],
    ),
    row(
        'linuxPlatformRuntime',
        'runtime-only',
        [
            'Codex CLI on Linux',
            'Codex IDE extension on Linux',
            'WSL2 Linux sandbox',
            'bubblewrap',
            'Ubuntu AppArmor profile',
            'sandbox_workspace_write.writable_roots',
        ],
        [
            'Codex Linux and WSL2 platform behavior is host runtime state across distro package availability, user namespace support, bubblewrap sandbox setup, AppArmor policy, repository location, and configured writable roots.',
            'Repository metadata can describe Linux platform intent and evidence requirements, but it cannot install bubblewrap, load AppArmor profiles, enable user namespaces, choose the active distro, move repositories into Linux-native paths, grant runtime writable roots, configure OS package repositories, or prove sandbox enforcement.',
            'WSL2 uses the Linux sandbox implementation; WSL1 is not supported by current Codex Linux sandbox behavior.',
        ],
        [
            'Linux platform configuration controls filesystem boundaries, network isolation, user namespace behavior, AppArmor policy, WSL repository location, package-manager setup, and command access to local directories.',
        ],
        ['RUN-085'],
    ),
    row(
        'macosPlatformRuntime',
        'runtime-only',
        [
            'Codex CLI on macOS',
            'Codex IDE extension on macOS',
            'Codex app on macOS',
            'Seatbelt sandbox',
            'macOS Privacy & Security permissions',
            'Codex local environments platform scripts',
        ],
        [
            'Codex macOS platform behavior is host runtime state across the built-in Seatbelt sandbox, Codex app availability, macOS privacy permissions, local environment actions, platform-specific setup scripts, managed preferences, and configured writable roots.',
            'Repository metadata can describe macOS platform intent and evidence requirements, but it cannot grant macOS Screen Recording or Accessibility permissions, install the Codex app, open a workspace in the app, configure MDM managed preferences, run or verify local environment actions, choose active macOS privacy settings, or prove sandbox enforcement.',
            'Appshots, Computer Use, Chronicle, Record & Replay, locked Computer Use, and remote Mac control are macOS runtime workflows that require harness-native evidence in their own boundary rows.',
        ],
        [
            'macOS platform configuration controls filesystem boundaries, network isolation, Seatbelt sandbox behavior, app permissions, local environment setup, managed preferences, Computer Use visibility, and command access to local directories.',
        ],
        ['RUN-086'],
    ),
    row(
        'cloudEnvironmentRuntime',
        'runtime-only',
        [
            'Codex Cloud environments',
            'hosted containers',
            'setup scripts',
            'cloud secrets',
            'agent internet access',
            'repository checkout',
        ],
        [
            'Codex Cloud environments are hosted runtime configuration and execution state rather than repository metadata projection.',
            'Repository metadata can describe intended execution profiles and validation evidence, but it cannot create or select cloud environments, configure hosted secrets, run setup scripts, choose internet access policy, install dependencies, or prove hosted task behavior.',
        ],
        [
            'Cloud environments can expose repository data to hosted execution, consume secrets, run setup commands, access networks, mutate branches, and incur cost or audit obligations.',
        ],
        ['RUN-070'],
    ),
    row(
        'localEnvironmentRuntime',
        'runtime-only',
        [
            'Codex app local environments',
            'project .codex local environment configuration',
            'worktree setup scripts',
            'project actions',
            'platform-specific local scripts',
            'integrated terminal actions',
        ],
        [
            'Codex local environments are Codex app runtime configuration for project worktree setup scripts and common project actions.',
            'Repository metadata can describe local environment intent and evidence requirements, but it cannot open the Codex app settings pane, select a project directory, create or update app-local environment state, run setup scripts in a new worktree, start integrated-terminal actions, install dependencies, satisfy platform prerequisites, or prove action behavior.',
            'Checked-in `.codex` local environment files remain operator-reviewed Codex app configuration and do not prove that a user has opened the matching project, run a thread, or accepted the resulting setup and action behavior.',
        ],
        [
            'Local environments can run shell commands, install dependencies, start development servers, expose local files or services, inherit host credentials, and behave differently across macOS, Windows, and Linux scripts.',
        ],
        ['RUN-087'],
    ),
    row(
        'appConnectorRuntime',
        'runtime-only',
        [
            'Codex Slack app',
            'Codex Linear connector',
            'Codex GitHub integration',
            'ChatGPT workspace connectors',
            'connected app account links',
        ],
        [
            'Codex app connectors are workspace, account, and channel runtime state rather than repository metadata projection.',
            'Repository metadata can describe connector intent and required evidence, but it cannot install Slack or Linear apps, approve workspace connectors, connect GitHub accounts, link user accounts, add Codex to channels, configure connector posting policy, or prove connector task behavior.',
        ],
        [
            'App connectors can expose issue, thread, repository, channel, account, and workspace data and can post replies or create hosted tasks under user or workspace authority.',
        ],
        ['RUN-071'],
    ),
    row(
        'localCloudHandoff',
        'runtime-only',
        ['Codex CLI', 'Codex IDE extension', 'Codex app', 'Codex Cloud'],
        [
            'Local to cloud handoff is a Codex runtime workflow and is not represented by generated MetaFlow files.',
            'CLI, IDE extension, and Codex app share local configuration layers, but cloud delegation depends on configured cloud environments and account/workspace access.',
        ],
        ['Cloud delegation changes data residency, credential, and audit boundaries.'],
        ['RUN-052'],
    ),
    row(
        'issuePrOperation',
        'runtime-only',
        ['Codex review', 'Codex GitHub integration', 'Codex Slack integration', 'Codex Linear integration', 'Codex Cloud task workflows'],
        [
            'Issue, PR, and review operation depends on Codex runtime integrations rather than static repository metadata.',
            'GitHub review, Slack, and Linear flows require configured app connectors, repository environments, and user or workspace authorization outside MetaFlow projection.',
        ],
        ['Repository write, review, and CI authority require explicit policy.'],
        ['RUN-052'],
    ),
    row(
        'reviewRuntime',
        'runtime-only',
        [
            'Codex app review pane',
            'Codex /review command',
            'GitHub-triggered @codex review',
            'automatic Codex code review',
            'pull request feedback in Codex app',
        ],
        [
            'Codex review behavior is runtime state across the local Git repository, Codex app review pane, GitHub PR context, GitHub CLI authentication, Codex Cloud setup, repository code-review settings, and optional automatic review triggers.',
            'Repository metadata can describe review guidance and expected evidence, but it cannot open the review pane, run /review, enable repository code review settings, trigger @codex review, read PR comments, post GitHub reviews, or prove that Codex addressed review feedback.',
            'Codex applies AGENTS.md review guidance at runtime, including nested guidance closest to changed files, but review execution and posted findings remain harness-owned behavior.',
        ],
        [
            'Review runtime can read uncommitted diffs, staged changes, branch diffs, pull request comments, GitHub identity, repository permissions, and can post review comments or start cloud tasks under configured authority.',
        ],
        ['RUN-076'],
    ),
    row(
        'remoteConnectionRuntime',
        'runtime-only',
        [
            'Codex mobile remote control',
            'Codex App connected hosts',
            'ChatGPT mobile Codex access',
            'Codex SSH host projects',
            'Codex secure relay',
        ],
        [
            'Codex remote connections are runtime state across paired devices, connected Mac or Windows hosts, ChatGPT mobile access, SSH host configuration, account or workspace authorization, and host availability.',
            'Repository metadata can describe remote-connection evidence expectations, but it cannot pair devices, keep hosts awake or online, configure SSH hosts, install or authenticate remote Codex, expose host plugins or tools, approve remote actions, or prove remote task behavior.',
            'Remote sessions use the connected host or SSH environment for repository files, shell commands, credentials, plugins, MCP servers, skills, browser access, Computer Use, sandbox settings, security controls, and approvals.',
        ],
        [
            'Remote connection runtime can expose host files, credentials, plugins, MCP servers, browser sessions, Computer Use, SSH accounts, shell commands, approvals, screenshots, terminal output, and repository changes across devices.',
        ],
        ['RUN-077'],
    ),
    row(
        'remoteMcpRuntime',
        'runtime-only',
        ['Codex Streamable HTTP MCP runtime', 'remote MCP endpoints', 'agent network policy'],
        [
            'Remote MCP reachability is a Codex runtime property rather than a repository metadata projection.',
            'Repository metadata can describe Streamable HTTP MCP configuration, but endpoint reachability, TLS, network policy, and hosted-agent access require harness-native validation.',
        ],
        ['Remote MCP access can expose network, credential, data residency, and audit boundaries.'],
        ['RUN-052'],
    ),
    row(
        'oauthMcpRuntime',
        'runtime-only',
        ['Codex MCP OAuth login', 'OAuth callback handling', 'MCP resource authorization'],
        [
            'OAuth MCP login and callback handling are Codex runtime workflows and cannot be proven by static MCP configuration alone.',
            'Repository metadata can describe OAuth scopes and resource metadata, but user login, callback routing, token handling, and account authorization require harness-native validation.',
        ],
        ['OAuth MCP access can grant external-service authority and requires explicit policy review.'],
        ['RUN-052'],
    ),
    row(
        'sideEffectMcpRuntime',
        'runtime-only',
        ['Codex MCP tool approval', 'side-effecting MCP tool calls', 'agent approval policy'],
        [
            'Side-effecting MCP tool behavior depends on Codex runtime approval, sandbox, and configured tool authority.',
            'Repository metadata can describe tool approval policy, but destructive or externally mutating tool behavior requires harness-native runtime evidence before support claims are valid.',
        ],
        ['Side-effecting MCP tools can mutate files, repositories, services, tickets, messages, or external systems.'],
        ['RUN-050', 'RUN-052'],
    ),
    row(
        'browserRuntime',
        'runtime-only',
        ['Codex in-app browser', 'Browser plugin', 'browser comments', 'Browser developer mode'],
        [
            'Codex Browser Use is a runtime plugin workflow rather than a repository metadata projection.',
            'Repository metadata can describe review intent, but website allowlists, browser plugin installation, full CDP access, visual annotations, and page interaction evidence require harness-native validation.',
        ],
        ['Browser runtime access can expose page content, screenshots, network traces, console output, and untrusted web context.'],
        ['RUN-063'],
    ),
    row(
        'chromeRuntime',
        'runtime-only',
        ['Codex Chrome extension', 'Chrome plugin', 'signed-in browser profile'],
        [
            'Codex Chrome use depends on the Chrome plugin, browser extension installation, active browser profile, website allowlists, and user approval.',
            'Repository metadata cannot install the extension, grant website access, read browser history, or prove signed-in browser task behavior.',
        ],
        ['Chrome runtime access can act with the user browser profile and requires website, history, and account-scope review.'],
        ['RUN-063'],
    ),
    row(
        'computerUseRuntime',
        'runtime-only',
        ['Codex Computer Use plugin', 'desktop app control', 'OS-level screen and accessibility permissions'],
        [
            'Computer Use depends on plugin installation, operating system permissions, active desktop state, allowed app decisions, and user approval.',
            'Repository metadata cannot grant screen recording, accessibility, foreground desktop control, locked-use policy, or app-specific approval.',
        ],
        ['Computer Use can operate GUI apps, pointer, keyboard, clipboard, visible secrets, and system state outside repository files.'],
        ['RUN-063'],
    ),
    row(
        'sitesRuntime',
        'runtime-only',
        ['Codex Sites plugin', '.openai/hosting.json', 'hosted site versions and deployments'],
        [
            'Sites publishing depends on the Sites plugin, hosted project provisioning, build compatibility, audience settings, hosted secrets, saved versions, and deployment approval.',
            'Repository metadata can classify hosting intent, but it cannot create hosted project state, set production access, configure hosted secrets, or prove deployment behavior.',
        ],
        ['Sites deployments can publish production URLs, expose data, widen audience access, and bind hosted storage or secrets.'],
        ['RUN-063'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'Codex CLI smoke runs'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Evaluation profiles can distinguish static projection checks from harness-native runtime evaluations with harness, adapter, scenario, evidence, and limitation fields.',
            'Codex evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-027', 'RUN-030', 'RUN-037', 'RUN-060'],
    ),
    row(
        'evaluationRuntime',
        'runtime-only',
        ['Codex Cloud tasks', 'Codex CLI smoke runs', 'Codex GitHub Action', 'Codex SDK', 'harness benchmark runs'],
        [
            'Harness-native evaluation execution depends on the selected Codex runtime, repository checkout, credentials, sandbox, network, model, tool approvals, and evaluation harness configuration.',
            'Repository metadata can describe evaluation profiles and expected evidence, but it cannot execute benchmark tasks, create hosted evaluation environments, invoke reviewer agents, collect traces, or prove scoring behavior by projection alone.',
        ],
        [
            'Evaluation runtime execution can consume credentials, mutate test systems, incur cost, publish artifacts, or expose repository and task data to hosted services.',
        ],
        ['RUN-068'],
    ),
];

const GITHUB_COPILOT_MATRIX: MatrixSeed[] = [
    row(
        'instructions',
        'supported',
        [
            '.metaflow/instructions/*.json',
            '.metaflow/instructions/*.md',
            '.github/instructions/**',
            '.github/copilot-instructions.md',
        ],
        [
            'Canonical MetaFlow instruction files project to Copilot-compatible instruction artifacts.',
            'Copilot instruction metadata is supported through existing plugin/settings and synchronized-file flows.',
        ],
        [],
        ['RUN-022'],
    ),
    row(
        'prompts',
        'supported',
        [
            '.metaflow/prompts/*.json',
            '.metaflow/prompts/*.md',
            'prompts/*.md',
            '.github/prompts/**',
        ],
        ['Canonical MetaFlow prompt files project to Copilot-compatible prompt artifacts.'],
        [],
        ['RUN-022'],
    ),
    row(
        'skills',
        'supported',
        [
            '.metaflow/skills/<skill-id>/skill.json',
            '.metaflow/skills/<skill-id>/SKILL.md',
            'skills/<skill-id>/SKILL.md',
            '.github/skills/**',
        ],
        ['Canonical MetaFlow skills project to Copilot skill packaging paths.'],
        [],
        ['RUN-028', 'RUN-029'],
    ),
    row(
        'agents',
        'supported',
        ['.github/agents/*.agent.md', 'agents/*.agent.md'],
        [
            'Copilot agent metadata participates in existing plugin-mode classification and packaging.',
            'Canonical MetaFlow agent profiles project to GitHub Copilot custom-agent Markdown profiles with optional agent-local MCP server frontmatter.',
        ],
        ['Agents can imply tool or repository authority and require policy review.'],
        ['RUN-022', 'RUN-051'],
    ),
    row(
        'agentRuntime',
        'runtime-only',
        ['GitHub Copilot custom agents', 'GitHub Agent HQ routing', 'agent assignment and execution state'],
        [
            'GitHub Copilot custom-agent metadata can be projected, but selecting, routing, assigning, or proving agent execution happens in the GitHub Copilot or Agent HQ runtime.',
            'Repository metadata cannot grant organization policy, connect runtime tools, route issues or pull requests to a hosted agent, or prove that a specific custom agent handled a task.',
        ],
        [
            'Custom-agent execution can access repository, issue, pull request, organization, tool, and connector data under user or organization authority.',
        ],
        ['RUN-072'],
    ),
    row(
        'automationRuntime',
        'runtime-only',
        [
            'GitHub Copilot scheduled or recurring agent workflows',
            'GitHub Agent HQ background routing',
            'GitHub Actions scheduled agent jobs',
        ],
        [
            'Recurring or scheduled Copilot and Agent HQ work is host runtime state rather than repository metadata projection.',
            'Repository metadata can describe automation intent and evidence requirements, but it cannot schedule hosted agent runs, route recurring work, configure host approvals, or prove background execution.',
        ],
        [
            'Scheduled host-agent workflows can access repositories, issues, pull requests, organization data, CI runners, connectors, and secrets under user or organization authority.',
        ],
        ['RUN-073'],
    ),
    row(
        'authenticationRuntime',
        'runtime-only',
        [
            'GitHub account session',
            'GitHub Copilot license or entitlement',
            'organization SSO and policy',
            'GitHub App or token credentials',
            'Agent HQ identity context',
        ],
        [
            'GitHub Copilot and Agent HQ authentication is host runtime state across GitHub account sessions, Copilot entitlement, organization policy, SSO, GitHub App installations, and token-backed operations.',
            'Repository metadata can describe required authentication posture and validation evidence, but it cannot sign in users, grant Copilot entitlements, complete SSO, create PATs or GitHub App credentials, connect organization accounts, or prove authenticated hosted-agent behavior.',
            'Authenticated GitHub and Copilot sessions determine repository, issue, pull request, organization, connector, billing, audit, and hosted-agent authority.',
        ],
        [
            'Authenticated host sessions can access repositories, issues, pull requests, organization resources, connectors, secrets, audit trails, and hosted agent operations under user or organization authority.',
        ],
        ['RUN-074'],
    ),
    row(
        'permissionRuntime',
        'runtime-only',
        [
            'GitHub Copilot tool and repository permissions',
            'GitHub organization policy',
            'GitHub App installation permissions',
            'MCP and connector approvals',
            'Agent HQ policy routing',
        ],
        [
            'GitHub Copilot and Agent HQ permissions are enforced by host runtime policy, GitHub account authority, GitHub App installation permissions, organization settings, connector approvals, MCP tool policy, and hosted agent routing.',
            'Repository metadata can describe desired permission posture and validation evidence, but it cannot grant repository or organization permissions, approve tool calls, change branch protection, satisfy enterprise policy, route Agent HQ authority, or prove hosted permission behavior.',
            'Permission behavior depends on the active GitHub identity, repository permissions, organization policy, branch protection, app installation scope, connector authorization, MCP server configuration, and hosted runtime approvals.',
        ],
        [
            'Runtime permissions control repository reads and writes, issue and pull request mutation, branch operations, connector side effects, secrets access, MCP tool authority, and audit obligations.',
        ],
        ['RUN-075'],
    ),
    row(
        'enterprisePolicyRuntime',
        'runtime-only',
        [
            'GitHub Copilot organization policy',
            'Agent HQ governance',
            'Copilot enterprise settings',
            'GitHub App installation policy',
            'repository and organization rulesets',
        ],
        [
            'GitHub Copilot and Agent HQ enterprise policy is host runtime state across organization settings, enterprise policy, GitHub App installation scope, rulesets, connector policy, marketplace governance, and hosted-agent routing.',
            'Repository metadata can describe required governance posture, policy grants, and validation evidence, but it cannot assign organization roles, change enterprise policy, install or approve GitHub Apps, alter branch protection or rulesets, route Agent HQ authority, constrain hosted marketplace access, or prove policy behavior.',
            'Policy behavior depends on the active GitHub identity, enterprise and organization configuration, repository permissions, branch protection, rulesets, connector approvals, hosted-agent settings, audit policy, and marketplace governance.',
        ],
        [
            'Enterprise policy can restrict or permit repository mutation, issue and pull request operations, hosted agent routing, connector side effects, marketplace access, MCP tool authority, secrets access, and audit obligations.',
        ],
        ['RUN-079'],
    ),
    row(
        'projectConfig',
        'unsupported',
        [],
        [
            'Codex project config is target-specific.',
            'GitHub Copilot uses separate host settings and agent-plugin surfaces instead of Codex project TOML.',
        ],
        ['Project configuration authority must be represented through the target harness controls.'],
    ),
    row(
        'commandRules',
        'unsupported',
        [],
        [
            'Codex command rules are target-specific Codex policy files.',
            'GitHub Copilot uses separate host and workspace policy controls instead of Codex `.rules` files.',
        ],
        ['Command execution authority must be represented through the target harness controls.'],
        ['RUN-064'],
    ),
    row(
        'worktreeInclude',
        'unsupported',
        [],
        [
            'Codex `.worktreeinclude` is specific to local Codex app managed worktrees.',
            'GitHub Copilot and Agent HQ use separate hosted workspace, runner, repository, and setup mechanisms instead of Codex managed-worktree copy patterns.',
        ],
        ['Ignored setup-file copy behavior must be represented through the target harness setup and secret-management controls.'],
        ['RUN-080'],
    ),
    row(
        'mcpServers',
        'partial',
        ['.metaflow/mcp/*.json', 'GitHub Copilot repository MCP settings', '.github/agents/*.agent.md'],
        [
            'Canonical MCP server metadata is parsed and reported for adapter review.',
            'Copilot repository-wide MCP configuration remains a GitHub settings operation.',
            'MetaFlow reports a reviewable `.vscode/mcp.json` handoff candidate for supported canonical MCP servers and leaves application to the operator.',
            'Canonical MCP server metadata referenced by canonical agent profiles projects into GitHub Copilot custom-agent frontmatter.',
        ],
        ['MCP servers require explicit tool, secret, and network authority review.'],
        ['RUN-033', 'RUN-051'],
    ),
    row(
        'tools',
        'partial',
        ['.metaflow/tools/*.json', 'GitHub Copilot MCP tools', 'local commands', 'HTTP tools'],
        [
            'Canonical tool metadata is parsed and reported for adapter review.',
            'MetaFlow tool manifests describe callable surfaces and policy requirements but do not grant GitHub Copilot runtime tool access.',
            'Command, MCP, HTTP, and manual tools remain operational only when the target harness has matching configured authority.',
        ],
        ['Tool use requires explicit command, MCP, network, secret, and approval authority review.'],
    ),
    row(
        'hooks',
        'partial',
        ['.metaflow/hooks/*.json', 'hooks/**', 'chat.hookFilesLocations'],
        [
            'Canonical hook metadata is parsed and reported for adapter review.',
            'Hook files can be surfaced through existing settings injection, but canonical hook projection is not implemented.',
        ],
        ['Hooks execute code or commands and require explicit trust and sandbox review.'],
        ['RUN-034'],
    ),
    row(
        'packageManifests',
        'supported',
        ['.metaflow/packages/*.json', 'plugin.json', '.github/plugin/marketplace.json'],
        [
            'Copilot agent-plugin manifests and marketplace generation remain separate from Codex plugin metadata.',
        ],
        ['Third-party plugin packages must be treated as trusted code.'],
        ['RUN-025', 'RUN-026'],
    ),
    row(
        'pluginRuntime',
        'runtime-only',
        ['GitHub Copilot agent plugin install state', 'GitHub Agent HQ marketplace or registry', 'host app and MCP setup'],
        [
            'Copilot agent-plugin manifests and marketplace catalogs are repository metadata, but installation, enablement, organization policy, app authentication, MCP setup, and task-time routing are GitHub or Copilot runtime behavior.',
            'Repository metadata can publish reviewable plugin package and marketplace candidates, but it cannot install plugins into a host, enable them for a user or organization, authenticate bundled apps, complete MCP setup, or prove that the host routed work through the plugin.',
        ],
        [
            'Installed agent plugins can expose skills, apps, MCP servers, credentials, repository authority, and external-service authority and require explicit trust, authentication, and organization-policy review.',
        ],
        ['RUN-069'],
    ),
    row(
        'policyGrants',
        'partial',
        ['.metaflow/policies/*.json'],
        [
            'Canonical policy grant metadata is parsed and reported for adapter review.',
            'Policy grants do not directly grant GitHub Copilot runtime authority.',
        ],
        ['Authority-sensitive projections remain guarded until explicit harness adapters exist.'],
        ['RUN-032'],
    ),
    row(
        'executionSurfaces',
        'partial',
        [
            '.metaflow/execution/*.json',
            'GitHub Copilot host runtime',
            'GitHub cloud agent workflows',
            'GitHub issue/PR workflows',
            'GitHub Actions',
            'always-on workflow orchestrators',
        ],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Copilot and GitHub execution surface selection remains a runtime workflow until explicit projection adapters exist.',
            'Execution profiles can classify issue/PR-native, GitHub Actions, SDK-embedded, and always-on workflow surfaces without provisioning those runtimes.',
        ],
        ['Execution surface selection changes repository, organization, and CI authority.'],
        ['RUN-035', 'RUN-062'],
    ),
    row(
        'memoryScopes',
        'partial',
        ['.metaflow/memory/*.json'],
        [
            'Canonical memory scope metadata is parsed and reported for adapter review.',
            'Canonical memory scope metadata records intended memory boundaries, retention, sharing, and policy posture.',
            'Copilot and GitHub memory behavior remains a runtime workflow until explicit projection adapters exist.',
        ],
        ['Persistent memory requires explicit authorization and retention policy.'],
        ['RUN-036'],
    ),
    row(
        'memoryRuntime',
        'runtime-only',
        ['GitHub Copilot personalization and host memory controls', 'GitHub Agent HQ context'],
        [
            'GitHub Copilot and GitHub-hosted memory behavior depends on target runtime settings and organization policy rather than repository metadata projection.',
            'Repository metadata can describe intended memory boundaries, but it cannot enable host memory, authorize user or organization retention, or prove memory recall behavior.',
        ],
        [
            'Persistent memory can retain user, repository, organization, and task context and requires retention, sharing, consent, and secret-review controls.',
        ],
        ['RUN-067'],
    ),
    row(
        'chronicleRuntime',
        'unsupported',
        [],
        [
            'Codex Chronicle is a Codex app macOS screen-context memory surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot personalization, host memory, and Agent HQ context behavior must be represented through memoryRuntime or GitHub-specific target concepts instead.',
        ],
        ['Screen-context memory authority must be represented through the target harness controls.'],
        ['RUN-078'],
    ),
    row(
        'appshotsRuntime',
        'unsupported',
        ['Codex app Appshots'],
        [
            'Appshots are a Codex app macOS frontmost-window attachment surface and are not a GitHub Copilot target surface.',
            'GitHub Copilot and Agent HQ visual, attachment, editor, or browser context behavior must be represented through GitHub-specific target concepts or host-runtime evidence.',
        ],
        ['Visual and document context authority must be represented through the target harness controls.'],
        ['RUN-082'],
    ),
    row(
        'recordReplayRuntime',
        'unsupported',
        ['Codex app Record & Replay'],
        [
            'Record & Replay is a Codex app workflow for recording a demonstrated workflow into a Codex skill and is not a GitHub Copilot target surface.',
            'GitHub Copilot and Agent HQ use separate workflow, custom-agent, plugin, and automation mechanisms that must be represented through GitHub-specific target concepts.',
        ],
        ['Recorded workflow authority must be represented through the target harness controls.'],
        ['RUN-081'],
    ),
    row(
        'importRuntime',
        'unsupported',
        ['Codex app Import other agent setup'],
        [
            'Import to Codex is a Codex app workflow for importing selected setup from other agent harnesses and is not a GitHub Copilot target surface.',
            'GitHub Copilot and Agent HQ use their own setup, organization policy, Agent HQ, and marketplace flows that must be represented through GitHub-specific target concepts.',
        ],
        ['Imported agent setup authority must be represented through the target harness controls.'],
        ['RUN-081'],
    ),
    row(
        'modelProviderRuntime',
        'unsupported',
        ['Codex amazon-bedrock model provider'],
        [
            'Codex model-provider selection, including Amazon Bedrock, is a Codex runtime configuration surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot and Agent HQ model routing, entitlement, and organization policy must be represented through GitHub-specific provider, policy, or runtime evidence rather than Codex provider metadata.',
        ],
        ['Provider routing authority must be represented through the target harness controls.'],
        ['RUN-083'],
    ),
    row(
        'nonInteractiveRuntime',
        'unsupported',
        ['codex exec and Codex non-interactive mode'],
        [
            'Codex non-interactive mode is a Codex CLI runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot or Agent HQ scripted, CI, and hosted task behavior must be represented through GitHub-specific execution, Actions, policy, or runtime-evidence concepts instead.',
        ],
        ['Non-interactive execution authority must be represented through the target harness controls.'],
        ['RUN-088'],
    ),
    row(
        'sdkRuntime',
        'unsupported',
        ['Codex SDK and Codex app-server SDK runtime'],
        [
            'Codex SDK integrations are Codex programmatic runtime surfaces and are not GitHub Copilot target surfaces.',
            'GitHub Copilot or Agent HQ SDK, hosted-agent, Actions, or enterprise-router behavior must be represented through GitHub-specific execution, policy, connector, or runtime-evidence concepts instead.',
        ],
        ['SDK execution authority must be represented through the target harness controls.'],
        ['RUN-089'],
    ),
    row(
        'appServerRuntime',
        'unsupported',
        ['Codex app-server JSON-RPC runtime'],
        [
            'Codex app-server is a Codex programmatic runtime protocol surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot or Agent HQ embedded-agent, hosted-agent, Actions, or enterprise-router behavior must be represented through GitHub-specific execution, policy, connector, or runtime-evidence concepts instead.',
        ],
        ['App-server protocol authority must be represented through the target harness controls.'],
        ['RUN-090'],
    ),
    row(
        'ideExtensionRuntime',
        'unsupported',
        ['Codex IDE extension'],
        [
            'Codex IDE extension is a Codex local runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot, VS Code Copilot Chat, Agent HQ, or GitHub-hosted editor and agent behavior must be represented through GitHub-specific editor, execution, policy, connector, or runtime-evidence concepts instead.',
        ],
        ['IDE extension authority must be represented through target harness controls.'],
        ['RUN-091'],
    ),
    row(
        'windowsPlatformRuntime',
        'unsupported',
        ['Codex Windows app and Windows sandbox'],
        [
            'Codex Windows platform behavior is a Codex runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot Windows, WSL, Dev Container, or Codespaces behavior must be represented through GitHub-specific editor, execution, or environment concepts instead.',
        ],
        ['Windows platform authority must be represented through the target harness controls.'],
        ['RUN-084'],
    ),
    row(
        'linuxPlatformRuntime',
        'unsupported',
        ['Codex Linux and WSL2 sandbox'],
        [
            'Codex Linux and WSL2 platform behavior is a Codex runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot Linux, WSL, Dev Container, or Codespaces behavior must be represented through GitHub-specific editor, execution, or environment concepts instead.',
        ],
        ['Linux platform authority must be represented through the target harness controls.'],
        ['RUN-085'],
    ),
    row(
        'macosPlatformRuntime',
        'unsupported',
        ['Codex macOS app, CLI, IDE extension, and Seatbelt sandbox'],
        [
            'Codex macOS platform behavior is a Codex runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot macOS editor, Dev Container, or Codespaces behavior must be represented through GitHub-specific editor, execution, or environment concepts instead.',
        ],
        ['macOS platform authority must be represented through the target harness controls.'],
        ['RUN-086'],
    ),
    row(
        'cloudEnvironmentRuntime',
        'runtime-only',
        [
            'GitHub Copilot cloud agent environment',
            'GitHub-hosted runners or sandboxes',
            'repository checkout',
            'secrets and organization policy',
        ],
        [
            'GitHub Copilot or GitHub cloud agent environments are hosted runtime state rather than repository metadata projection.',
            'Repository metadata can describe intended execution profiles and evidence, but it cannot create hosted environments, grant repository or organization access, configure hosted secrets, run setup, or prove hosted agent behavior.',
        ],
        [
            'Hosted agent environments can expose repository data, consume secrets, mutate branches or pull requests, and depend on organization policy and audit controls.',
        ],
        ['RUN-070'],
    ),
    row(
        'localEnvironmentRuntime',
        'unsupported',
        ['Codex app local environments and project .codex setup/action configuration'],
        [
            'Codex local environment behavior is a Codex app runtime surface and is not a GitHub Copilot target surface.',
            'GitHub Copilot project setup, VS Code tasks, Dev Container setup, Codespaces setup, or Actions runner setup must be represented through GitHub-specific execution or environment concepts instead.',
        ],
        ['Local environment authority must be represented through the target harness controls.'],
        ['RUN-087'],
    ),
    row(
        'appConnectorRuntime',
        'runtime-only',
        [
            'GitHub Copilot app integrations',
            'GitHub Agent HQ connectors',
            'connected app account links',
            'organization connector policy',
        ],
        [
            'GitHub Copilot and Agent HQ app connector behavior depends on host installation, account authorization, organization policy, and task routing rather than repository metadata projection.',
            'Repository metadata can describe connector intent and evidence, but it cannot install host apps, approve organization connectors, link user accounts, grant repository access, or prove connector task behavior.',
        ],
        [
            'App connectors can expose issue, pull request, repository, organization, channel, account, and workspace data and can route work under user or organization authority.',
        ],
        ['RUN-071'],
    ),
    row(
        'localCloudHandoff',
        'runtime-only',
        ['GitHub Copilot host runtime', 'GitHub Agent HQ'],
        [
            'Local to cloud handoff is a Copilot/GitHub runtime workflow and is not represented by generated MetaFlow files.',
        ],
        ['Cloud delegation changes repository, organization, credential, and audit boundaries.'],
    ),
    row(
        'issuePrOperation',
        'runtime-only',
        ['GitHub issues', 'GitHub pull requests', 'GitHub Agent HQ'],
        [
            'Issue and PR operation depends on GitHub runtime integrations rather than static repository metadata.',
        ],
        ['Repository write, review, and CI authority require explicit policy.'],
    ),
    row(
        'reviewRuntime',
        'runtime-only',
        ['GitHub pull request reviews', 'GitHub Copilot code review', 'GitHub Agent HQ review routing'],
        [
            'GitHub Copilot and Agent HQ review behavior is host runtime state across pull request context, review assignment, organization policy, repository permissions, branch protection, and reviewer or agent routing.',
            'Repository metadata can describe review guidance and validation evidence, but it cannot enable Copilot review, assign hosted reviewers, post GitHub reviews, satisfy organization policy, or prove hosted review behavior.',
        ],
        [
            'Review runtime can read pull request diffs, comments, checks, repository history, organization policy, and can post review findings or route follow-up work under user or organization authority.',
        ],
        ['RUN-076'],
    ),
    row(
        'remoteConnectionRuntime',
        'unsupported',
        [],
        [
            'Codex remote connections are a Codex app, ChatGPT mobile, and SSH-host runtime surface and are not a GitHub Copilot target surface.',
            'GitHub Copilot remote development and hosted-agent workflows must be represented through GitHub-specific execution, app connector, or cloud environment concepts instead.',
        ],
        ['Remote host authority must be represented through the target harness controls.'],
        ['RUN-077'],
    ),
    row(
        'remoteMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP runtime', 'remote MCP endpoints', 'host network policy'],
        [
            'Remote MCP reachability is a GitHub Copilot runtime property rather than a repository metadata projection.',
            'Repository metadata can describe candidate MCP configuration, but endpoint reachability, TLS, network policy, and host access require harness-native validation.',
        ],
        ['Remote MCP access can expose network, credential, data residency, and audit boundaries.'],
    ),
    row(
        'oauthMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP OAuth login', 'OAuth callback handling', 'MCP resource authorization'],
        [
            'OAuth MCP login and callback handling are GitHub Copilot runtime workflows and cannot be proven by static MCP metadata alone.',
            'Repository metadata can describe OAuth intent, but user login, callback routing, token handling, and account authorization require harness-native validation.',
        ],
        ['OAuth MCP access can grant external-service authority and requires explicit policy review.'],
    ),
    row(
        'sideEffectMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP tool approval', 'side-effecting MCP tool calls', 'host approval policy'],
        [
            'Side-effecting MCP tool behavior depends on GitHub Copilot runtime approval and configured tool authority.',
            'Repository metadata can describe tool intent, but destructive or externally mutating tool behavior requires harness-native runtime evidence before support claims are valid.',
        ],
        ['Side-effecting MCP tools can mutate files, repositories, services, tickets, messages, or external systems.'],
    ),
    row(
        'browserRuntime',
        'unsupported',
        [],
        [
            'Codex Browser Use is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Browser runtime authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'chromeRuntime',
        'unsupported',
        [],
        [
            'The Codex Chrome extension is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Chrome profile authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'computerUseRuntime',
        'unsupported',
        [],
        [
            'Codex Computer Use is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Desktop automation authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'sitesRuntime',
        'unsupported',
        [],
        [
            'Codex Sites is a Codex app/plugin hosting surface and is not a GitHub Copilot target surface.',
        ],
        ['Hosted deployment authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'extension integration tests'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Evaluation profiles can distinguish static projection checks from harness-native runtime evaluations with harness, adapter, scenario, evidence, and limitation fields.',
            'Copilot and GitHub evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-026', 'RUN-037', 'RUN-060'],
    ),
    row(
        'evaluationRuntime',
        'runtime-only',
        ['GitHub Copilot cloud agent', 'GitHub Agent HQ', 'GitHub Actions', 'harness benchmark runs'],
        [
            'Harness-native evaluation execution depends on the selected GitHub or Copilot runtime, repository checkout, credentials, runner permissions, model or agent selection, tool approvals, and evaluation harness configuration.',
            'Repository metadata can describe evaluation profiles and expected evidence, but it cannot execute benchmark tasks, route cloud agents, collect traces, or prove scoring behavior by projection alone.',
        ],
        [
            'Evaluation runtime execution can consume credentials, mutate test systems, incur cost, publish artifacts, or expose repository and task data to hosted services.',
        ],
        ['RUN-068'],
    ),
];

const MATRIX_BY_TARGET: Record<
    string,
    { adapterVersion: string; documentation: string; rows: MatrixSeed[] }
> = {
    codex: {
        adapterVersion: CODEX_ADAPTER_VERSION,
        documentation: 'docs/CODEX-SUPPORT.md',
        rows: CODEX_MATRIX,
    },
    'github-copilot': {
        adapterVersion: GITHUB_COPILOT_ADAPTER_VERSION,
        documentation: 'README.md',
        rows: GITHUB_COPILOT_MATRIX,
    },
};

export function getTargetCapabilityMatrix(
    targets: ProjectionTarget[] = ['codex', 'github-copilot'],
): TargetCapabilityMatrixEntry[] {
    const targetSet = new Set(targets);
    const entries: TargetCapabilityMatrixEntry[] = [];
    for (const target of ['codex', 'github-copilot'] as const) {
        if (!targetSet.has(target)) {
            continue;
        }
        const matrix = MATRIX_BY_TARGET[target];
        entries.push(
            ...matrix.rows.map((entry) => ({
                target,
                adapterVersion: matrix.adapterVersion,
                documentation: entry.documentation ?? matrix.documentation,
                ...entry,
            })),
        );
    }
    return entries;
}

export function buildTargetCapabilitySupportReference(
    entries: TargetCapabilityMatrixEntry[],
): TargetCapabilitySupportReference | undefined {
    const runtimeOnlyRows = entries.filter((entry) => entry.support === 'runtime-only');
    if (runtimeOnlyRows.length === 0) {
        return undefined;
    }

    const referencesByTarget = new Map<string, { count: number; documentation: string }>();
    for (const entry of runtimeOnlyRows) {
        const existing = referencesByTarget.get(entry.target);
        referencesByTarget.set(entry.target, {
            count: (existing?.count ?? 0) + 1,
            documentation: existing?.documentation ?? entry.documentation,
        });
    }

    return {
        runtimeOnlyCount: runtimeOnlyRows.length,
        targets: Array.from(referencesByTarget.entries())
            .sort((left, right) =>
                left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
            )
            .map(([target, reference]) => ({
                target,
                runtimeOnlyCount: reference.count,
                documentation: reference.documentation,
        })),
    };
}

const RUNTIME_EVIDENCE_COVERAGE_STATUSES: CodexRuntimeEvidenceCoverageStatus[] = [
    'passed',
    'partial',
    'failed',
    'not-run',
    'waived',
    'missing',
];

function emptyRuntimeEvidenceCoverageSummary(
    totalRuntimeOnlyConcepts: number,
): CodexRuntimeEvidenceCoverageSummary {
    const byStatus: Record<CodexRuntimeEvidenceCoverageStatus, number> = {
        passed: 0,
        partial: 0,
        failed: 0,
        'not-run': 0,
        waived: 0,
        missing: 0,
    };
    const conceptsByStatus: Record<
        CodexRuntimeEvidenceCoverageStatus,
        TargetCapabilityConcept[]
    > = {
        passed: [],
        partial: [],
        failed: [],
        'not-run': [],
        waived: [],
        missing: [],
    };
    const diagnosticRecordsBySeverity: Record<CapabilityDiagnosticSeverity, number> = {
        error: 0,
        warning: 0,
        info: 0,
    };
    const diagnosticConceptsBySeverity: Record<CapabilityDiagnosticSeverity, number> = {
        error: 0,
        warning: 0,
        info: 0,
    };

    return {
        totalRuntimeOnlyConcepts,
        conceptsWithEvidence: 0,
        conceptsWithoutEvidence: totalRuntimeOnlyConcepts,
        records: 0,
        recordsWithWarnings: 0,
        conceptsWithWarnings: 0,
        conceptsWithEvidenceWithoutDiagnostics: 0,
        conceptsWithEvidenceWithDiagnostics: 0,
        diagnosticRecordsBySeverity,
        diagnosticConceptsBySeverity,
        recordsWithExpiredEvidence: 0,
        conceptsWithExpiredEvidence: 0,
        recordsWithStaleAdapterVersion: 0,
        conceptsWithStaleAdapterVersion: 0,
        conceptsWithErrorRecords: [],
        conceptsWithExpiredEvidenceRecords: [],
        conceptsWithStaleAdapterVersionRecords: [],
        byStatus,
        conceptsByStatus,
        conceptsWithWarningRecords: [],
        conceptsWithEvidenceWithoutDiagnosticRecords: [],
        conceptsWithEvidenceWithDiagnosticRecords: [],
    };
}

function classifyRuntimeEvidenceCoverageStatus(
    records: RuntimeEvidenceMetadata[],
): CodexRuntimeEvidenceCoverageStatus {
    if (records.length === 0) {
        return 'missing';
    }

    if (records.some((record) => record.status === 'passed')) {
        return 'passed';
    }

    if (records.some((record) => record.status === 'partial')) {
        return 'partial';
    }

    if (records.some((record) => record.status === 'failed')) {
        return 'failed';
    }

    if (records.some((record) => record.status === 'not-run')) {
        return 'not-run';
    }

    return 'waived';
}

function hasRuntimeEvidenceDiagnosticSeverity(
    record: RuntimeEvidenceMetadata,
    severity: CapabilityDiagnosticSeverity,
): boolean {
    return record.warnings.some((warning) => (warning.severity ?? 'warning') === severity);
}

function hasExpiredRuntimeEvidenceDiagnostic(record: RuntimeEvidenceMetadata): boolean {
    return record.warnings.some((warning) => warning.code === 'RUNTIME_EVIDENCE_EXPIRED');
}

function hasStaleAdapterVersionRuntimeEvidenceDiagnostic(
    record: RuntimeEvidenceMetadata,
): boolean {
    return record.warnings.some(
        (warning) => warning.code === 'RUNTIME_EVIDENCE_ADAPTER_VERSION_MISMATCH',
    );
}

function formatRuntimeEvidenceConceptQueue(concepts: TargetCapabilityConcept[]): string {
    return concepts.length > 0 ? concepts.join(', ') : 'none';
}

function buildRuntimeEvidenceGateResult(
    condition: CodexRuntimeEvidenceGateCondition,
    count: number,
    concepts: TargetCapabilityConcept[],
    message: string,
): CodexRuntimeEvidenceGateResult {
    return {
        condition,
        triggered: count > 0,
        count,
        concepts,
        message,
    };
}

function buildRuntimeEvidenceGateSummary(
    summary: CodexRuntimeEvidenceCoverageSummary,
): CodexRuntimeEvidenceGateSummary {
    return {
        'missing-evidence': buildRuntimeEvidenceGateResult(
            'missing-evidence',
            summary.conceptsWithoutEvidence,
            summary.conceptsByStatus.missing,
            `${summary.conceptsWithoutEvidence} runtime-only concept(s) have no matching evidence`,
        ),
        diagnostics: buildRuntimeEvidenceGateResult(
            'diagnostics',
            summary.recordsWithWarnings,
            summary.conceptsWithWarningRecords,
            `${summary.recordsWithWarnings} runtime evidence record(s) have diagnostics`,
        ),
        'error-diagnostics': buildRuntimeEvidenceGateResult(
            'error-diagnostics',
            summary.diagnosticRecordsBySeverity.error,
            summary.conceptsWithErrorRecords,
            `${summary.diagnosticRecordsBySeverity.error} runtime evidence record(s) have error diagnostics`,
        ),
        failed: buildRuntimeEvidenceGateResult(
            'failed',
            summary.byStatus.failed,
            summary.conceptsByStatus.failed,
            `${summary.byStatus.failed} runtime-only concept(s) are covered by failed evidence`,
        ),
        'not-run': buildRuntimeEvidenceGateResult(
            'not-run',
            summary.byStatus['not-run'],
            summary.conceptsByStatus['not-run'],
            `${summary.byStatus['not-run']} runtime-only concept(s) are covered by not-run evidence`,
        ),
        partial: buildRuntimeEvidenceGateResult(
            'partial',
            summary.byStatus.partial,
            summary.conceptsByStatus.partial,
            `${summary.byStatus.partial} runtime-only concept(s) are covered by partial evidence`,
        ),
    };
}

const RUNTIME_EVIDENCE_RELEASE_READY_CONDITIONS: CodexRuntimeEvidenceGateCondition[] = [
    'missing-evidence',
    'diagnostics',
    'failed',
    'not-run',
];

function buildRuntimeEvidenceReadinessSummary(
    gateSummary: CodexRuntimeEvidenceGateSummary,
): CodexRuntimeEvidenceReadinessSummary {
    const blockingConditions = RUNTIME_EVIDENCE_RELEASE_READY_CONDITIONS.filter(
        (condition) => gateSummary[condition].triggered,
    );
    return {
        preset: 'release-ready',
        ready: blockingConditions.length === 0,
        blockingConditions,
        blockingMessages: blockingConditions.map(
            (condition) => `${condition}: ${gateSummary[condition].message}`,
        ),
        checkedConditions: RUNTIME_EVIDENCE_RELEASE_READY_CONDITIONS,
    };
}

function actionKindForGateCondition(
    condition: CodexRuntimeEvidenceGateCondition,
): CodexRuntimeEvidenceActionKind {
    switch (condition) {
        case 'missing-evidence':
            return 'collect-runtime-evidence';
        case 'diagnostics':
        case 'error-diagnostics':
            return 'review-runtime-diagnostics';
        case 'failed':
            return 'rerun-failed-evidence';
        case 'not-run':
            return 'run-not-run-evidence';
        case 'partial':
            return 'complete-partial-runtime-evidence';
    }
}

function buildRuntimeEvidenceActionPlan(
    gateSummary: CodexRuntimeEvidenceGateSummary,
    readinessSummary: CodexRuntimeEvidenceReadinessSummary,
    runtimeEvidenceChecklist: CodexRuntimeEvidenceChecklistItem[],
): CodexRuntimeEvidenceActionPlanItem[] {
    return readinessSummary.checkedConditions
        .map((condition) => gateSummary[condition])
        .filter((gate) => gate.triggered)
        .map((gate) => {
            const conceptDetails = gate.concepts.flatMap((concept) => {
                const item = runtimeEvidenceChecklist.find(
                    (checklistItem) => checklistItem.concept === concept,
                );
                if (!item) {
                    return [];
                }
                return [
                    {
                        concept: item.concept,
                        coverageStatus: item.coverageStatus,
                        nativeSurfaces: item.nativeSurfaces,
                        runtimeEvidenceExpected: item.runtimeEvidenceExpected,
                        authorityImplications: item.authorityImplications,
                        runtimeEvidenceRecordIds: item.runtimeEvidenceRecords.map(
                            (record) => record.id,
                        ),
                        runtimeEvidenceLimitations: item.runtimeEvidenceRecords.flatMap(
                            (record) => record.limitations,
                        ),
                    },
                ];
            });
            return {
                kind: actionKindForGateCondition(gate.condition),
                condition: gate.condition,
                blockingReadiness: readinessSummary.blockingConditions.includes(gate.condition),
                concepts: gate.concepts,
                conceptDetails,
                message: gate.message,
            };
        });
}

function buildRuntimeEvidenceCompletionActionPlan(
    gateSummary: CodexRuntimeEvidenceGateSummary,
    runtimeEvidenceChecklist: CodexRuntimeEvidenceChecklistItem[],
): CodexRuntimeEvidenceActionPlanItem[] {
    const gate = gateSummary.partial;
    if (!gate.triggered) {
        return [];
    }
    const conceptDetails = gate.concepts.flatMap((concept) => {
        const item = runtimeEvidenceChecklist.find(
            (checklistItem) => checklistItem.concept === concept,
        );
        if (!item) {
            return [];
        }
        return [
            {
                concept: item.concept,
                coverageStatus: item.coverageStatus,
                nativeSurfaces: item.nativeSurfaces,
                runtimeEvidenceExpected: item.runtimeEvidenceExpected,
                authorityImplications: item.authorityImplications,
                runtimeEvidenceRecordIds: item.runtimeEvidenceRecords.map((record) => record.id),
                runtimeEvidenceLimitations: item.runtimeEvidenceRecords.flatMap(
                    (record) => record.limitations,
                ),
            },
        ];
    });
    return [
        {
            kind: actionKindForGateCondition(gate.condition),
            condition: gate.condition,
            blockingReadiness: true,
            concepts: gate.concepts,
            conceptDetails,
            message: gate.message,
        },
    ];
}

function buildRuntimeEvidenceWaiverSummary(
    runtimeEvidenceChecklist: CodexRuntimeEvidenceChecklistItem[],
    notAchievableByRepositoryProjection: string[],
): CodexRuntimeEvidenceWaiverSummary {
    const items = runtimeEvidenceChecklist
        .filter((item) => item.coverageStatus === 'waived')
        .map((item) => {
            const waivedRecords = item.runtimeEvidenceRecords.filter(
                (record) => record.status === 'waived',
            );
            return {
                concept: item.concept,
                runtimeEvidenceRecordIds: waivedRecords.map((record) => record.id),
                limitations: waivedRecords.flatMap((record) => record.limitations),
                notAchievableByRepositoryProjection: item.notAchievableByRepositoryProjection,
                authorityImplications: item.authorityImplications,
            };
        });
    return {
        waivedConcepts: items.length,
        waivedRecords: items.reduce(
            (count, item) => count + item.runtimeEvidenceRecordIds.length,
            0,
        ),
        notAchievableByRepositoryProjectionItems: notAchievableByRepositoryProjection.length,
        concepts: items.map((item) => item.concept),
        items,
    };
}

function buildRuntimeEvidenceCompletenessSummary(
    coverageSummary: CodexRuntimeEvidenceCoverageSummary,
    readinessSummary: CodexRuntimeEvidenceReadinessSummary,
    waiverSummary: CodexRuntimeEvidenceWaiverSummary,
    completionActionPlan: CodexRuntimeEvidenceActionPlanItem[],
): CodexRuntimeEvidenceCompletenessSummary {
    return {
        releaseReady: readinessSummary.ready,
        runtimeComplete: readinessSummary.ready && coverageSummary.byStatus.partial === 0,
        runtimeOnlyConcepts: coverageSummary.totalRuntimeOnlyConcepts,
        passedConcepts: coverageSummary.byStatus.passed,
        partialConcepts: coverageSummary.byStatus.partial,
        waivedConcepts: coverageSummary.byStatus.waived,
        missingConcepts: coverageSummary.byStatus.missing,
        failedConcepts: coverageSummary.byStatus.failed,
        notRunConcepts: coverageSummary.byStatus['not-run'],
        diagnosticConcepts: coverageSummary.conceptsWithWarnings,
        expiredEvidenceConcepts: coverageSummary.conceptsWithExpiredEvidence,
        staleAdapterVersionConcepts: coverageSummary.conceptsWithStaleAdapterVersion,
        remainingCompletionActionItems: completionActionPlan.reduce(
            (count, item) => count + item.concepts.length,
            0,
        ),
        repositoryProjectionImpossibleItems:
            waiverSummary.notAchievableByRepositoryProjectionItems,
        partialConceptList: coverageSummary.conceptsByStatus.partial,
        waivedConceptList: coverageSummary.conceptsByStatus.waived,
        blockingConditions: readinessSummary.blockingConditions,
    };
}

function buildCodexTechnicalImpossibilitySummary(
    notAchievableByRepositoryProjection: string[],
): CodexTechnicalImpossibilitySummary {
    return {
        repositoryProjectionImpossibleItems: notAchievableByRepositoryProjection.length,
        externalAuthorityItems: notAchievableByRepositoryProjection.filter((item) =>
            matchesAnyRuntimeEvidenceCompletionPattern(
                item,
                EXTERNAL_AUTHORITY_COMPLETION_PATTERNS,
            ),
        ).length,
        hostedOrNetworkItems: notAchievableByRepositoryProjection.filter((item) =>
            matchesAnyRuntimeEvidenceCompletionPattern(
                item,
                HOSTED_OR_NETWORK_COMPLETION_PATTERNS,
            ),
        ).length,
        appOrPlatformItems: notAchievableByRepositoryProjection.filter((item) =>
            matchesAnyRuntimeEvidenceCompletionPattern(item, APP_OR_PLATFORM_COMPLETION_PATTERNS),
        ).length,
        runtimeNativeProofItems: notAchievableByRepositoryProjection.filter((item) =>
            /\bproving?\b|\bwithout a harness-native run\b|\bruntime\b/i.test(item),
        ).length,
        items: [...notAchievableByRepositoryProjection],
    };
}

function buildRuntimeEvidenceCompletionBlockerSummary(
    completionActionPlan: CodexRuntimeEvidenceActionPlanItem[],
): CodexRuntimeEvidenceCompletionBlockerSummary {
    const items = completionActionPlan.flatMap((action) =>
        action.conceptDetails.map((detail) => ({
            concept: detail.concept,
            runtimeEvidenceRecordIds: detail.runtimeEvidenceRecordIds,
            runtimeEvidenceLimitations: detail.runtimeEvidenceLimitations,
            nativeSurfaces: detail.nativeSurfaces,
            authorityImplications: detail.authorityImplications,
            runtimeEvidenceExpected: detail.runtimeEvidenceExpected,
        })),
    );
    return {
        partialConcepts: items.length,
        partialRecords: items.reduce(
            (count, item) => count + item.runtimeEvidenceRecordIds.length,
            0,
        ),
        limitationItems: items.reduce(
            (count, item) => count + item.runtimeEvidenceLimitations.length,
            0,
        ),
        authorityImplicationItems: items.reduce(
            (count, item) => count + item.authorityImplications.length,
            0,
        ),
        nativeSurfaceItems: items.reduce((count, item) => count + item.nativeSurfaces.length, 0),
        concepts: items.map((item) => item.concept),
        items,
    };
}

const CURRENT_ENVIRONMENT_COMPLETION_PATTERNS = [
    /\blocal\b/i,
    /\binstalled\b/i,
    /\bcli\b/i,
    /\bcodex exec\b/i,
    /\bnon-interactive\b/i,
    /\bwindows\b/i,
    /\bpowershell\b/i,
    /\bworking directory\b/i,
    /\bcommit-scoped review\b/i,
    /\bschema generation\b/i,
];

const EXTERNAL_AUTHORITY_COMPLETION_PATTERNS = [
    /\bauth/i,
    /\bcredential/i,
    /\bsecret/i,
    /\btoken/i,
    /\boauth\b/i,
    /\baccount\b/i,
    /\bworkspace\b/i,
    /\borgani[sz]ation\b/i,
    /\bpolicy\b/i,
    /\bapproval\b/i,
    /\bpermission\b/i,
    /\baws\b/i,
    /\bbedrock\b/i,
    /\bbilling\b/i,
    /\bcost\b/i,
    /\bconnector\b/i,
    /\bpost\b/i,
    /\bcreate\b/i,
    /\bmutat/i,
    /\bwrite\b/i,
];

const HOSTED_OR_NETWORK_COMPLETION_PATTERNS = [
    /\bcloud\b/i,
    /\bhosted\b/i,
    /\bremote\b/i,
    /\bnetwork\b/i,
    /\burl\b/i,
    /\bhttp\b/i,
    /\bmcp\b/i,
    /\bgithub\b/i,
    /\bslack\b/i,
    /\blinear\b/i,
    /\bissue\b/i,
    /\bpull request\b/i,
    /\bpr\b/i,
];

const APP_OR_PLATFORM_COMPLETION_PATTERNS = [
    /\bapp\b/i,
    /\bide\b/i,
    /\bvs code\b/i,
    /\bextension\b/i,
    /\bbrowser\b/i,
    /\bchrome\b/i,
    /\bcomputer use\b/i,
    /\bgui\b/i,
    /\bwindow\b/i,
    /\bscreenshot\b/i,
    /\bdesktop\b/i,
    /\bmacos\b/i,
    /\blinux\b/i,
    /\bwsl\b/i,
];

function matchesAnyRuntimeEvidenceCompletionPattern(value: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(value));
}

function classifyRuntimeEvidenceCompletionReadiness(
    detail: CodexRuntimeEvidenceActionPlanConceptDetail,
): CodexRuntimeEvidenceCompletionReadinessCategory[] {
    const searchableText = [
        detail.concept,
        detail.runtimeEvidenceExpected,
        ...detail.nativeSurfaces,
        ...detail.authorityImplications,
        ...detail.runtimeEvidenceLimitations,
    ].join('\n');
    const categories: CodexRuntimeEvidenceCompletionReadinessCategory[] = [];
    if (matchesAnyRuntimeEvidenceCompletionPattern(searchableText, CURRENT_ENVIRONMENT_COMPLETION_PATTERNS)) {
        categories.push('current-environment-candidate');
    }
    if (matchesAnyRuntimeEvidenceCompletionPattern(searchableText, EXTERNAL_AUTHORITY_COMPLETION_PATTERNS)) {
        categories.push('requires-external-authority');
    }
    if (matchesAnyRuntimeEvidenceCompletionPattern(searchableText, HOSTED_OR_NETWORK_COMPLETION_PATTERNS)) {
        categories.push('requires-hosted-or-network-surface');
    }
    if (matchesAnyRuntimeEvidenceCompletionPattern(searchableText, APP_OR_PLATFORM_COMPLETION_PATTERNS)) {
        categories.push('requires-app-or-platform-surface');
    }
    return categories.length > 0 ? categories : ['requires-external-authority'];
}

function buildRuntimeEvidenceCompletionReadinessSummary(
    completionActionPlan: CodexRuntimeEvidenceActionPlanItem[],
): CodexRuntimeEvidenceCompletionReadinessSummary {
    const items = completionActionPlan.flatMap((action) =>
        action.conceptDetails.map((detail) => ({
            concept: detail.concept,
            categories: classifyRuntimeEvidenceCompletionReadiness(detail),
            runtimeEvidenceRecordIds: detail.runtimeEvidenceRecordIds,
            nextEvidenceRequired: detail.runtimeEvidenceExpected,
        })),
    );
    const conceptsForCategory = (category: CodexRuntimeEvidenceCompletionReadinessCategory) =>
        items
            .filter((item) => item.categories.includes(category))
            .map((item) => item.concept)
            .sort();
    const currentEnvironmentCandidateConcepts = conceptsForCategory(
        'current-environment-candidate',
    );
    const externalAuthorityBoundConceptsList = conceptsForCategory(
        'requires-external-authority',
    );
    const hostedOrNetworkBoundConceptsList = conceptsForCategory(
        'requires-hosted-or-network-surface',
    );
    const appOrPlatformBoundConceptsList = conceptsForCategory(
        'requires-app-or-platform-surface',
    );
    return {
        partialConcepts: items.length,
        currentEnvironmentCandidates: currentEnvironmentCandidateConcepts.length,
        externalAuthorityBoundConcepts: externalAuthorityBoundConceptsList.length,
        hostedOrNetworkBoundConcepts: hostedOrNetworkBoundConceptsList.length,
        appOrPlatformBoundConcepts: appOrPlatformBoundConceptsList.length,
        currentEnvironmentCandidateConcepts,
        externalAuthorityBoundConceptsList,
        hostedOrNetworkBoundConceptsList,
        appOrPlatformBoundConceptsList,
        items,
    };
}

function formatRuntimeEvidenceActionPlan(actionPlan: CodexRuntimeEvidenceActionPlanItem[]): string[] {
    if (actionPlan.length === 0) {
        return ['No blocking runtime evidence actions.'];
    }
    return actionPlan.flatMap((action) => [
        `- ${action.kind} (${action.blockingReadiness ? 'blocking' : 'advisory'}): ${action.message}; concepts: ${formatRuntimeEvidenceConceptQueue(action.concepts)}`,
        ...action.conceptDetails.map((detail) => {
            const records =
                detail.runtimeEvidenceRecordIds.length > 0
                    ? detail.runtimeEvidenceRecordIds.join(', ')
                    : 'none recorded';
            const authority =
                detail.authorityImplications.length > 0
                    ? detail.authorityImplications.join(' ')
                    : 'none';
            const limitations =
                detail.runtimeEvidenceLimitations.length > 0
                    ? detail.runtimeEvidenceLimitations.join(' ')
                    : 'none recorded';
            return `  - ${detail.concept}: coverage=${detail.coverageStatus}; records=${records}; surfaces=${detail.nativeSurfaces.join(', ')}; authority=${authority}; limitations=${limitations}; expected=${detail.runtimeEvidenceExpected}`;
        }),
    ]);
}

function toRuntimeEvidenceSlug(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

export function buildCodexRuntimeEvidenceGuideDocument(
    supportBoundariesDocument: CodexSupportBoundariesDocument,
    concepts: TargetCapabilityConcept[],
    options?: {
        generatedBy?: string;
    },
): CodexRuntimeEvidenceGuideDocument {
    const requestedConcepts = new Set(concepts);
    const guideConcepts = supportBoundariesDocument.runtimeEvidenceChecklist
        .filter((item) => requestedConcepts.has(item.concept))
        .map((item) => {
            const conceptSlug = toRuntimeEvidenceSlug(item.concept);
            return {
                concept: item.concept,
                coverageStatus: item.coverageStatus,
                nativeSurfaces: item.nativeSurfaces,
                authorityImplications: item.authorityImplications,
                runtimeEvidenceExpected: item.runtimeEvidenceExpected,
                notAchievableByRepositoryProjection: item.notAchievableByRepositoryProjection,
                evidence: item.evidence,
                runtimeEvidenceRecordIds: item.runtimeEvidenceRecords.map((record) => record.id),
                suggestedTemplateCommand: `metaflow codex-support-boundaries --runtime-evidence-template-dir .metaflow/runtime-evidence --runtime-evidence-concept ${item.concept}`,
                suggestedScaffoldPath: `.metaflow/runtime-evidence/codex-${conceptSlug}.json`,
                collectionChecklist: [
                    'Name the active Codex surface and version used for validation.',
                    'Record the runtime configuration, authentication state, sandbox, approval, and policy posture.',
                    'Run a representative operation for the selected concept and record the exact command, UI path, hosted task, or review procedure.',
                    'Attach reviewable artifacts such as logs, reports, screenshots, traces, recordings, URLs, or run identifiers.',
                    'Document uncovered surfaces, connector limits, permission limits, environment limits, and platform limits.',
                    'Convert the scaffold record from not-run to passed, partial, failed, or waived only after the evidence artifact is reviewed.',
                ],
            };
        });
    const generatedBy = options?.generatedBy ?? 'metaflow codex-support-boundaries --runtime-evidence-guide';
    const lines = [
        '# Codex Runtime Evidence Guide',
        '',
        `Generated by \`${generatedBy}\`.`,
        `Generated at \`${supportBoundariesDocument.generatedAt}\`.`,
        `Codex adapter version \`${supportBoundariesDocument.adapterVersion}\`.`,
        '',
        'This guide prepares reviewable runtime evidence records. It does not create runtime proof or grant Codex authority.',
        '',
    ];
    for (const item of guideConcepts) {
        lines.push(
            `## ${item.concept}`,
            '',
            `Coverage status: ${item.coverageStatus}.`,
            `Suggested scaffold path: \`${item.suggestedScaffoldPath}\`.`,
            `Suggested scaffold command: \`${item.suggestedTemplateCommand}\`.`,
            '',
            'Native surfaces:',
            ...item.nativeSurfaces.map((surface) => `- ${surface}`),
            '',
            'Runtime evidence expected:',
            '',
            item.runtimeEvidenceExpected,
            '',
            'Authority implications:',
            ...(item.authorityImplications.length > 0
                ? item.authorityImplications.map((authority) => `- ${authority}`)
                : ['- none recorded']),
            '',
            'Repository projection boundary:',
            '',
            item.notAchievableByRepositoryProjection,
            '',
            'Evidence collection checklist:',
            ...item.collectionChecklist.map((entry) => `- ${entry}`),
            '',
            'Existing runtime evidence records:',
            ...(item.runtimeEvidenceRecordIds.length > 0
                ? item.runtimeEvidenceRecordIds.map((id) => `- ${id}`)
                : ['- none recorded']),
            '',
        );
        if (item.evidence.length > 0) {
            lines.push(
                'Reference evidence:',
                ...item.evidence.map((evidence) => `- ${evidence}`),
                '',
            );
        }
    }
    return {
        schemaVersion: 'metaflow.runtimeEvidenceGuide/v1',
        generatedBy,
        generatedAt: supportBoundariesDocument.generatedAt,
        adapterVersion: supportBoundariesDocument.adapterVersion,
        target: 'codex',
        concepts: guideConcepts,
        content: `${lines.join('\n')}\n`,
    };
}

export function buildCodexRuntimeEvidenceTemplateDocument(
    supportBoundariesDocument: CodexSupportBoundariesDocument,
    concepts: TargetCapabilityConcept[] = [],
    options?: {
        generatedBy?: string;
        queue?: CodexRuntimeEvidenceReviewQueueId;
    },
): CodexRuntimeEvidenceTemplateDocument {
    const seenConcepts = new Set<TargetCapabilityConcept>();
    const requestedConcepts = new Set(concepts);
    const records: CodexRuntimeEvidenceTemplateRecord[] = [];
    if (requestedConcepts.size > 0) {
        for (const item of supportBoundariesDocument.runtimeEvidenceChecklist) {
            if (!requestedConcepts.has(item.concept)) {
                continue;
            }
            if (seenConcepts.has(item.concept)) {
                continue;
            }
            seenConcepts.add(item.concept);
            records.push(
                buildCodexRuntimeEvidenceTemplateRecordFromChecklistItem(
                    item,
                    supportBoundariesDocument.adapterVersion,
                ),
            );
        }
    } else {
        const templateActions =
            supportBoundariesDocument.runtimeEvidenceActionPlan.length > 0
                ? supportBoundariesDocument.runtimeEvidenceActionPlan
                : supportBoundariesDocument.runtimeEvidenceCompletionActionPlan;
        for (const action of templateActions) {
            for (const detail of action.conceptDetails) {
                if (seenConcepts.has(detail.concept)) {
                    continue;
                }
                seenConcepts.add(detail.concept);
                records.push(
                    buildCodexRuntimeEvidenceTemplateRecordFromActionDetail(
                        detail,
                        supportBoundariesDocument.adapterVersion,
                    ),
                );
            }
        }
    }

    const generatedBy =
        options?.generatedBy ?? 'metaflow codex-support-boundaries --runtime-evidence-template';
    const conceptSet = new Set(concepts);
    const completionReadinessItems =
        options?.queue && isCodexCompletionReadinessReviewQueue(options.queue)
            ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.items.filter(
                  (item) => conceptSet.has(item.concept),
              )
            : undefined;
    return {
        schemaVersion: 'metaflow.runtimeEvidenceTemplate/v1',
        generatedBy,
        generatedAt: supportBoundariesDocument.generatedAt,
        adapterVersion: supportBoundariesDocument.adapterVersion,
        target: 'codex',
        source:
            requestedConcepts.size > 0
                ? 'runtimeEvidenceChecklist'
                : supportBoundariesDocument.runtimeEvidenceActionPlan.length > 0
                  ? 'runtimeEvidenceActionPlan'
                  : 'runtimeEvidenceCompletionActionPlan',
        ...(concepts.length > 0 || options?.queue
            ? { filters: { concepts, ...(options?.queue ? { queue: options.queue } : {}) } }
            : {}),
        ...(completionReadinessItems
            ? {
                  runtimeEvidenceCompletionReadinessSummary:
                      supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary,
                  completionReadinessItems,
              }
            : {}),
        records,
    };
}

function buildCodexRuntimeEvidenceTemplateRecordFromActionDetail(
    detail: CodexRuntimeEvidenceActionPlanConceptDetail,
    adapterVersion: string,
): CodexRuntimeEvidenceTemplateRecord {
    return buildCodexRuntimeEvidenceTemplateRecord({
        concept: detail.concept,
        coverageStatus: detail.coverageStatus,
        nativeSurfaces: detail.nativeSurfaces,
        runtimeEvidenceExpected: detail.runtimeEvidenceExpected,
        authorityImplications: detail.authorityImplications,
        adapterVersion,
    });
}

function buildCodexRuntimeEvidenceTemplateRecordFromChecklistItem(
    item: CodexRuntimeEvidenceChecklistItem,
    adapterVersion: string,
): CodexRuntimeEvidenceTemplateRecord {
    return buildCodexRuntimeEvidenceTemplateRecord({
        concept: item.concept,
        coverageStatus: item.coverageStatus,
        nativeSurfaces: item.nativeSurfaces,
        runtimeEvidenceExpected: item.runtimeEvidenceExpected,
        authorityImplications: item.authorityImplications,
        adapterVersion,
    });
}

function buildCodexRuntimeEvidenceTemplateRecord(options: {
    concept: TargetCapabilityConcept;
    coverageStatus: CodexRuntimeEvidenceCoverageStatus;
    nativeSurfaces: string[];
    runtimeEvidenceExpected: string;
    authorityImplications: string[];
    adapterVersion: string;
}): CodexRuntimeEvidenceTemplateRecord {
    const conceptSlug = toRuntimeEvidenceSlug(options.concept);
    const authority =
        options.authorityImplications.length > 0
            ? options.authorityImplications.join(' ')
            : 'No explicit authority implication is recorded for this concept.';
    return {
        suggestedPath: `.metaflow/runtime-evidence/codex-${conceptSlug}.json`,
        content: {
            schemaVersion: 'metaflow.runtimeEvidence/v1',
            id: `codex-${conceptSlug}`,
            target: 'codex',
            concepts: [options.concept],
            harness: `TODO: Codex runtime surface (${options.nativeSurfaces.join(', ')})`,
            adapterVersion: options.adapterVersion,
            scenario: options.runtimeEvidenceExpected,
            status: 'not-run',
            command: 'TODO: command, hosted workflow, UI procedure, or review procedure used for validation',
            evidence: [],
            evidenceArtifacts: [
                {
                    kind: 'report',
                    ref: `doc/ftr/TODO-codex-${conceptSlug}.md`,
                    description: 'TODO: replace with the reviewed runtime evidence artifact.',
                },
            ],
            limitations: [
                'TODO: document uncovered Codex surfaces, connectors, permissions, environments, or platform limits.',
            ],
            policyGrants: [],
            description: [
                `Runtime evidence template for ${options.concept}.`,
                `Coverage status at template generation: ${options.coverageStatus}.`,
                `Authority implications: ${authority}`,
            ].join(' '),
        },
    };
}

function formatCodexRuntimeEvidenceReviewQueueConcepts(
    concepts: TargetCapabilityConcept[],
): string {
    return concepts.length > 0 ? concepts.join(', ') : 'none';
}

function uniqueCodexRuntimeEvidenceReviewQueueConcepts(
    concepts: TargetCapabilityConcept[],
): TargetCapabilityConcept[] {
    return [...new Set(concepts)].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
}

function isCodexCompletionReadinessReviewQueue(
    queue: CodexRuntimeEvidenceReviewQueueId,
): boolean {
    return (
        queue === 'completion-readiness' ||
        queue === 'completion-readiness-current-environment' ||
        queue === 'completion-readiness-external-authority' ||
        queue === 'completion-readiness-hosted-network' ||
        queue === 'completion-readiness-app-platform'
    );
}

function filterCodexRuntimeEvidenceActionPlanByConcepts(
    actionPlan: CodexRuntimeEvidenceActionPlanItem[],
    concepts: Set<TargetCapabilityConcept>,
): CodexRuntimeEvidenceActionPlanItem[] {
    return actionPlan
        .map((item) => {
            const filteredConcepts = item.concepts.filter((concept) => concepts.has(concept));
            return {
                ...item,
                concepts: filteredConcepts,
                conceptDetails: item.conceptDetails.filter((detail) =>
                    concepts.has(detail.concept),
                ),
                message:
                    filteredConcepts.length === item.concepts.length
                        ? item.message
                        : `${filteredConcepts.length} selected runtime-only concept(s) are covered by partial evidence but need stronger harness-native proof before the Codex target can be treated as runtime-complete.`,
            };
        })
        .filter((item) => item.concepts.length > 0 || item.conceptDetails.length > 0);
}

function getCodexRuntimeEvidenceReviewQueueAdvisoryKind(
    queue: CodexRuntimeEvidenceReviewQueueId,
): string | undefined {
    if (queue === 'partial') {
        return 'review-partial-runtime-evidence';
    }
    if (queue === 'waived') {
        return 'review-waived-runtime-evidence';
    }
    if (queue === 'expired-evidence') {
        return 'review-expired-runtime-evidence';
    }
    if (queue === 'stale-adapter-version') {
        return 'review-stale-adapter-runtime-evidence';
    }
    return undefined;
}

export function buildCodexRuntimeEvidenceReviewQueueDocument(
    supportBoundariesDocument: CodexSupportBoundariesDocument,
    queue: CodexRuntimeEvidenceReviewQueueId = 'all',
    options?: { generatedBy?: string },
): CodexRuntimeEvidenceReviewQueueDocument {
    const generatedBy =
        options?.generatedBy ?? 'metaflow codex-support-boundaries --runtime-evidence-review-queue';
    const gateConditions: CodexRuntimeEvidenceGateCondition[] =
        queue === 'all'
            ? ['missing-evidence', 'diagnostics', 'error-diagnostics', 'failed', 'not-run']
            : queue === 'release-ready'
              ? supportBoundariesDocument.runtimeEvidenceReadinessSummary.checkedConditions
              : queue === 'runtime-complete'
                ? [
                      ...supportBoundariesDocument.runtimeEvidenceReadinessSummary
                          .checkedConditions,
                      'partial',
                  ]
              : isCodexCompletionReadinessReviewQueue(queue)
                ? []
              : queue === 'partial'
                ? []
              : queue === 'waived'
                ? []
                : queue === 'expired-evidence'
                  ? []
                  : queue === 'stale-adapter-version'
                    ? []
                : [queue as CodexRuntimeEvidenceGateCondition];
    const queueConcepts =
        queue === 'all'
            ? supportBoundariesDocument.runtimeEvidenceChecklist.map((item) => item.concept)
            : queue === 'release-ready'
              ? supportBoundariesDocument.runtimeEvidenceReadinessSummary.blockingConditions.flatMap(
                    (condition) =>
                        supportBoundariesDocument.runtimeEvidenceGateSummary[condition]
                            ?.concepts ?? [],
                )
              : queue === 'runtime-complete'
                ? [
                      ...supportBoundariesDocument.runtimeEvidenceReadinessSummary
                          .blockingConditions.flatMap(
                              (condition) =>
                                  supportBoundariesDocument.runtimeEvidenceGateSummary[condition]
                                      ?.concepts ?? [],
                          ),
                      ...supportBoundariesDocument.runtimeEvidenceGateSummary.partial.concepts,
                  ]
              : queue === 'completion-readiness'
                ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.items.map(
                      (item) => item.concept,
                  )
              : queue === 'completion-readiness-current-environment'
                ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary
                      .currentEnvironmentCandidateConcepts
              : queue === 'completion-readiness-external-authority'
                ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary
                      .externalAuthorityBoundConceptsList
              : queue === 'completion-readiness-hosted-network'
                ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary
                      .hostedOrNetworkBoundConceptsList
              : queue === 'completion-readiness-app-platform'
                ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary
                      .appOrPlatformBoundConceptsList
              : queue === 'partial'
                ? supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsByStatus.partial
              : queue === 'waived'
                ? supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsByStatus.waived
                : queue === 'expired-evidence'
                  ? supportBoundariesDocument.runtimeEvidenceCoverageSummary
                        .conceptsWithExpiredEvidenceRecords
                  : queue === 'stale-adapter-version'
                    ? supportBoundariesDocument.runtimeEvidenceCoverageSummary
                          .conceptsWithStaleAdapterVersionRecords
                : supportBoundariesDocument.runtimeEvidenceGateSummary[queue]?.concepts ?? [];
    const concepts = uniqueCodexRuntimeEvidenceReviewQueueConcepts(queueConcepts);
    const conceptSet = new Set(concepts);
    const completionReadinessItems = isCodexCompletionReadinessReviewQueue(queue)
        ? supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.items.filter(
              (item) => conceptSet.has(item.concept),
          )
        : undefined;
    const actionPlan = supportBoundariesDocument.runtimeEvidenceActionPlan.filter(
        (item) =>
            queue === 'all' ||
            (queue === 'release-ready' &&
                supportBoundariesDocument.runtimeEvidenceReadinessSummary.blockingConditions.includes(
                    item.condition,
                )) ||
            (queue === 'runtime-complete' &&
                supportBoundariesDocument.runtimeEvidenceReadinessSummary.blockingConditions.includes(
                    item.condition,
                )) ||
            (queue !== 'partial' &&
                queue !== 'waived' &&
                queue !== 'expired-evidence' &&
                queue !== 'stale-adapter-version' &&
                !isCodexCompletionReadinessReviewQueue(queue) &&
                queue !== 'runtime-complete' &&
                item.condition === queue),
    );
    const completionActionPlan = isCodexCompletionReadinessReviewQueue(queue)
        ? filterCodexRuntimeEvidenceActionPlanByConcepts(
              supportBoundariesDocument.runtimeEvidenceCompletionActionPlan,
              conceptSet,
          )
        : supportBoundariesDocument.runtimeEvidenceCompletionActionPlan;
    const queueActionPlan =
        queue === 'runtime-complete' || isCodexCompletionReadinessReviewQueue(queue)
            ? [...actionPlan, ...completionActionPlan]
            : actionPlan;
    const checklist =
        queue === 'all'
            ? supportBoundariesDocument.runtimeEvidenceChecklist
            : supportBoundariesDocument.runtimeEvidenceChecklist.filter((item) =>
                  conceptSet.has(item.concept),
              );
    const lines = [
        '# Codex Runtime Evidence Review Queue',
        '',
        `Generated by \`${generatedBy}\`.`,
        `Generated at \`${supportBoundariesDocument.generatedAt}\`.`,
        `Codex adapter version \`${supportBoundariesDocument.adapterVersion}\`.`,
        `Queue \`${queue}\`.`,
        '',
        'This review document is derived from the current Codex support-boundary report. It organizes runtime-only Codex concepts that need operator evidence, diagnostic review, reruns, waiver review, release-ready confirmation, or runtime-complete completion. It does not create runtime proof.',
        '',
        '## Readiness',
        '',
        `Release-ready preset: ${supportBoundariesDocument.runtimeEvidenceReadinessSummary.ready ? 'ready' : 'blocked'}.`,
        `Blocking gates: ${supportBoundariesDocument.runtimeEvidenceReadinessSummary.blockingConditions.length > 0 ? supportBoundariesDocument.runtimeEvidenceReadinessSummary.blockingConditions.join(', ') : 'none'}.`,
        '',
        '## Queue Summary',
        '',
        '| Gate | Triggered | Count | Concepts |',
        '| --- | --- | --- | --- |',
        ...gateConditions.map((condition) => {
            const gate = supportBoundariesDocument.runtimeEvidenceGateSummary[condition];
            return `| ${condition} | ${gate.triggered ? 'yes' : 'no'} | ${gate.count} | ${formatCodexRuntimeEvidenceReviewQueueConcepts(gate.concepts)} |`;
        }),
        '',
        '## Coverage Queues',
        '',
        `- Missing evidence: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsByStatus.missing)}`,
        `- Evidence without diagnostics: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnosticRecords)}`,
        `- Evidence with diagnostics: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnosticRecords)}`,
        `- Evidence with error diagnostics: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsWithErrorRecords)}`,
        `- Partial evidence: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsByStatus.partial)}`,
        `- Expired evidence: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsWithExpiredEvidenceRecords)}`,
        `- Stale adapter version evidence: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsWithStaleAdapterVersionRecords)}`,
        `- Waived evidence: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCoverageSummary.conceptsByStatus.waived)}`,
        '',
        '## Completion Readiness Queues',
        '',
        `- Current-environment candidates: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.currentEnvironmentCandidateConcepts)}`,
        `- External-authority bound: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.externalAuthorityBoundConceptsList)}`,
        `- Hosted/network bound: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.hostedOrNetworkBoundConceptsList)}`,
        `- App/platform bound: ${formatCodexRuntimeEvidenceReviewQueueConcepts(supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary.appOrPlatformBoundConceptsList)}`,
        '',
        '## Action Items',
        '',
    ];

    if (queueActionPlan.length === 0) {
        const advisoryKind = getCodexRuntimeEvidenceReviewQueueAdvisoryKind(queue);
        if (advisoryKind && checklist.length > 0) {
            for (const item of checklist) {
                const records =
                    item.runtimeEvidenceRecords.length > 0
                        ? item.runtimeEvidenceRecords
                              .map((record) => `${record.id} (${record.status})`)
                              .join(', ')
                        : 'none recorded';
                lines.push(
                    `- ${advisoryKind} (advisory): Review ${item.concept} ${item.coverageStatus} evidence records: ${records}. Expected proof: ${item.runtimeEvidenceExpected}`,
                );
            }
        } else {
            lines.push('- No runtime evidence actions match this queue.');
        }
    } else {
        for (const action of queueActionPlan) {
            lines.push(
                `- ${action.kind} (${action.condition}, ${action.blockingReadiness ? 'blocking' : 'advisory'}): ${action.message}`,
                `  Concepts: ${formatCodexRuntimeEvidenceReviewQueueConcepts(action.concepts)}`,
            );
            for (const detail of action.conceptDetails) {
                lines.push(
                    `  - ${detail.concept}: ${detail.coverageStatus}; native surfaces: ${detail.nativeSurfaces.join(', ')}; expected proof: ${detail.runtimeEvidenceExpected}; evidence records: ${detail.runtimeEvidenceRecordIds.length > 0 ? detail.runtimeEvidenceRecordIds.join(', ') : 'none'}`,
                );
                if (detail.runtimeEvidenceLimitations.length > 0) {
                    lines.push(
                        ...detail.runtimeEvidenceLimitations.map(
                            (limitation) => `    - limitation: ${limitation}`,
                        ),
                    );
                }
            }
        }
    }

    lines.push(
        '',
        '## Concept Checklist',
        '',
        '| Concept | Coverage | Evidence records | Expected proof |',
        '| --- | --- | --- | --- |',
    );
    if (checklist.length === 0) {
        lines.push('| none | none | none | none |');
    } else {
        for (const item of checklist) {
            const records =
                item.runtimeEvidenceRecords.length > 0
                    ? item.runtimeEvidenceRecords
                          .map((record) => `${record.id} (${record.status})`)
                          .join('<br>')
                    : 'none recorded';
            lines.push(
                `| ${item.concept} | ${item.coverageStatus} | ${records} | ${item.runtimeEvidenceExpected} |`,
            );
        }
    }
    lines.push('');

    const document: CodexRuntimeEvidenceReviewQueueDocument = {
        schemaVersion: 'metaflow.runtimeEvidenceReviewQueue/v1',
        generatedBy,
        generatedAt: supportBoundariesDocument.generatedAt,
        adapterVersion: supportBoundariesDocument.adapterVersion,
        target: 'codex',
        queue,
        concepts,
        content: `${lines.join('\n')}\n`,
    };
    if (isCodexCompletionReadinessReviewQueue(queue)) {
        document.runtimeEvidenceCompletionReadinessSummary =
            supportBoundariesDocument.runtimeEvidenceCompletionReadinessSummary;
        document.completionReadinessItems = completionReadinessItems;
    }
    return document;
}

export function buildCodexSupportBoundariesDocument(options?: {
    generatedBy?: string;
    generatedAt?: string;
    runtimeEvidenceRecords?: RuntimeEvidenceMetadata[];
}): CodexSupportBoundariesDocument {
    const generatedBy = options?.generatedBy ?? 'metaflow codex-support-boundaries';
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const runtimeEvidenceRecords = options?.runtimeEvidenceRecords ?? [];
    const codexRows = getTargetCapabilityMatrix(['codex']).sort((left, right) =>
        left.concept.localeCompare(right.concept, undefined, { sensitivity: 'base' }),
    );
    const runtimeOnlyRows = codexRows.filter((entry) => entry.support === 'runtime-only');
    const supportedRows = codexRows.filter((entry) => entry.support !== 'runtime-only');
    const runtimeEvidenceChecklist = runtimeOnlyRows.map((row) => {
        const matchingRuntimeEvidence = runtimeEvidenceRecords.filter(
            (record) => record.target === 'codex' && record.concepts.includes(row.concept),
        );
        const coverageStatus = classifyRuntimeEvidenceCoverageStatus(matchingRuntimeEvidence);
        return {
            concept: row.concept,
            nativeSurfaces: row.nativeSurfaces,
            notAchievableByRepositoryProjection: row.notes.join(' '),
            runtimeEvidenceExpected: [
                `Runtime evidence for ${row.concept} must name the active Codex surface, runtime configuration, authority posture, representative operation, result artifacts, and known limitations.`,
                `Review native surfaces: ${row.nativeSurfaces.join(', ')}.`,
            ].join(' '),
            authorityImplications: row.authorityImplications,
            evidence: row.evidence,
            runtimeEvidenceRecords: matchingRuntimeEvidence,
            coverageStatus,
        };
    });
    const runtimeEvidenceCoverageSummary = emptyRuntimeEvidenceCoverageSummary(
        runtimeOnlyRows.length,
    );
    const codexRuntimeEvidenceRecords = runtimeEvidenceRecords.filter(
        (record) => record.target === 'codex',
    );
    runtimeEvidenceCoverageSummary.records = codexRuntimeEvidenceRecords.length;
    runtimeEvidenceCoverageSummary.recordsWithWarnings = codexRuntimeEvidenceRecords.filter(
        (record) => record.warnings.length > 0,
    ).length;
    for (const severity of ['error', 'warning', 'info'] as const) {
        runtimeEvidenceCoverageSummary.diagnosticRecordsBySeverity[severity] =
            codexRuntimeEvidenceRecords.filter((record) =>
                hasRuntimeEvidenceDiagnosticSeverity(record, severity),
            ).length;
    }
    runtimeEvidenceCoverageSummary.recordsWithExpiredEvidence =
        codexRuntimeEvidenceRecords.filter(hasExpiredRuntimeEvidenceDiagnostic).length;
    runtimeEvidenceCoverageSummary.recordsWithStaleAdapterVersion =
        codexRuntimeEvidenceRecords.filter(
            hasStaleAdapterVersionRuntimeEvidenceDiagnostic,
        ).length;
    for (const item of runtimeEvidenceChecklist) {
        runtimeEvidenceCoverageSummary.byStatus[item.coverageStatus] += 1;
        runtimeEvidenceCoverageSummary.conceptsByStatus[item.coverageStatus].push(item.concept);
        const hasDiagnostics = item.runtimeEvidenceRecords.some(
            (record) => record.warnings.length > 0,
        );
        const hasExpiredEvidence = item.runtimeEvidenceRecords.some(
            hasExpiredRuntimeEvidenceDiagnostic,
        );
        const hasStaleAdapterVersionEvidence = item.runtimeEvidenceRecords.some(
            hasStaleAdapterVersionRuntimeEvidenceDiagnostic,
        );
        if (hasDiagnostics) {
            runtimeEvidenceCoverageSummary.conceptsWithWarnings += 1;
            runtimeEvidenceCoverageSummary.conceptsWithWarningRecords.push(item.concept);
        }
        if (hasExpiredEvidence) {
            runtimeEvidenceCoverageSummary.conceptsWithExpiredEvidence += 1;
            runtimeEvidenceCoverageSummary.conceptsWithExpiredEvidenceRecords.push(item.concept);
        }
        if (hasStaleAdapterVersionEvidence) {
            runtimeEvidenceCoverageSummary.conceptsWithStaleAdapterVersion += 1;
            runtimeEvidenceCoverageSummary.conceptsWithStaleAdapterVersionRecords.push(
                item.concept,
            );
        }
        for (const severity of ['error', 'warning', 'info'] as const) {
            if (
                item.runtimeEvidenceRecords.some((record) =>
                    hasRuntimeEvidenceDiagnosticSeverity(record, severity),
                )
            ) {
                runtimeEvidenceCoverageSummary.diagnosticConceptsBySeverity[severity] += 1;
                if (severity === 'error') {
                    runtimeEvidenceCoverageSummary.conceptsWithErrorRecords.push(item.concept);
                }
            }
        }
        if (item.coverageStatus === 'missing') {
            continue;
        }
        runtimeEvidenceCoverageSummary.conceptsWithEvidence += 1;
        if (hasDiagnostics) {
            runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnostics += 1;
            runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnosticRecords.push(
                item.concept,
            );
        } else {
            runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnostics += 1;
            runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnosticRecords.push(
                item.concept,
            );
        }
    }
    runtimeEvidenceCoverageSummary.conceptsWithoutEvidence =
        runtimeEvidenceCoverageSummary.byStatus.missing;
    const runtimeEvidenceGateSummary = buildRuntimeEvidenceGateSummary(
        runtimeEvidenceCoverageSummary,
    );
    const runtimeEvidenceReadinessSummary = buildRuntimeEvidenceReadinessSummary(
        runtimeEvidenceGateSummary,
    );
    const runtimeEvidenceActionPlan = buildRuntimeEvidenceActionPlan(
        runtimeEvidenceGateSummary,
        runtimeEvidenceReadinessSummary,
        runtimeEvidenceChecklist,
    );
    const runtimeEvidenceCompletionActionPlan = buildRuntimeEvidenceCompletionActionPlan(
        runtimeEvidenceGateSummary,
        runtimeEvidenceChecklist,
    );

    const relatedGuides = [
        'docs/CODEX-SUPPORT.md',
        'docs/CODEX-OPERATOR-WALKTHROUGH.md',
        'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
        'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
    ];
    const notAchievableByRepositoryProjection = [
        'Creating or approving ChatGPT workspace connectors.',
        'Installing Slack, Linear, GitHub, or other Codex-connected apps in a workspace.',
        'Installing, approving, connecting, or proving Slack, Linear, GitHub, ChatGPT workspace, GitHub Copilot, or Agent HQ app connectors from repository metadata alone.',
        'Spawning subagents, selecting custom agents at runtime, managing active agent threads, satisfying interactive approvals, or proving custom-agent execution from repository metadata alone.',
        'Creating or updating scheduled automations, keeping the Codex app or host runtime available, selecting automation worktrees, managing automation inbox or archive state, or proving scheduled background execution from repository metadata alone.',
        'Signing in users, creating or storing API keys or access tokens, connecting GitHub or workspace accounts, satisfying organization SSO or admin policy, or proving authenticated runtime behavior from repository metadata alone.',
        'Granting runtime permissions, approving boundary-crossing actions, selecting effective managed requirements, running auto-review decisions, enforcing OS sandboxing, or proving permission behavior from repository metadata alone.',
        'Assigning enterprise roles, applying cloud-managed requirements, writing device-level policy, selecting effective governance layers, changing organization policy, approving marketplace sources, enforcing feature pins, or proving enterprise policy behavior from repository metadata alone.',
        'Creating Codex-managed worktrees, copying ignored files into them, copying source symlinks, overwriting existing files, or proving `.worktreeinclude` copy behavior from repository metadata alone.',
        'Opening Codex review panes, running /review, enabling GitHub code review settings, triggering @codex review, posting pull request reviews, reading pull request feedback, or proving review-feedback handling from repository metadata alone.',
        'Pairing remote devices, keeping hosts awake or online, configuring SSH hosts, installing or authenticating remote Codex, exposing host tools or plugins, approving remote actions, or proving remote task behavior from repository metadata alone.',
        'Creating Codex Cloud environments or setting cloud task secrets.',
        'Creating, selecting, configuring, or proving Codex Cloud or GitHub-hosted agent environments from repository metadata alone.',
        'Authenticating GitHub CLI, Codex, Slack, Linear, MCP OAuth, or marketplace plugin installs.',
        'Enabling Codex Memories, generating memory files, authorizing per-thread memory use, or proving memory recall behavior.',
        'Enabling Chronicle, granting macOS Screen Recording or Accessibility permissions, capturing screen context, processing Chronicle screenshot frames or OCR text, creating Chronicle memories, pausing or resuming Chronicle, or proving Chronicle recall behavior from repository metadata alone.',
        'Creating Appshots, selecting or capturing the frontmost window, granting macOS Screen & System Audio Recording or Accessibility permissions, attaching appshots to the intended Codex thread, or proving appshot-thread behavior from repository metadata alone.',
        'Recording UI actions or window content, generating or refining Record & Replay skills, enabling Computer Use, or proving replay behavior from repository metadata alone.',
        'Launching the Codex import flow, selecting external agent sources or items, importing user settings, projects, or sessions, authorizing imported plugins or connections, or proving imported setup behavior from repository metadata alone.',
        'Selecting active Codex model providers, writing user-global provider config or credential files, configuring AWS IAM or Bedrock API keys, choosing AWS Regions, granting model access, restarting apps or extensions, or proving provider routing from repository metadata alone.',
        'Invoking `codex exec`, selecting live non-interactive credentials, choosing sandbox or approval posture, streaming JSONL, writing schema-constrained output, resuming sessions, satisfying repository trust checks, or proving scripted Codex execution from repository metadata alone.',
        'Installing Codex SDK packages, provisioning Node.js or Python runtimes, starting app-server processes, initializing SDK clients, selecting credentials, creating or resuming SDK threads, choosing live sandbox presets, deploying embedding applications, capturing traces, or proving SDK behavior from repository metadata alone.',
        'Starting Codex app-server processes, selecting stdio, WebSocket, Unix socket, or disabled transports, authenticating WebSocket listeners, initializing JSON-RPC clients, creating or resuming threads, starting or steering turns, handling event streams, managing overload retries, generating version-matched schemas, or proving app-server behavior from repository metadata alone.',
        'Installing or launching the Codex IDE extension, opening or focusing sidebars, selecting active workspaces or editors, choosing open files or selected text, invoking IDE commands, adding editor selections to threads, tagging files in prompts, selecting IDE models, reloading extensions, configuring WSL execution in VS Code settings, authenticating editor sessions, previewing cloud changes, continuing local threads, or proving IDE extension behavior from repository metadata alone.',
        'Selecting native Windows sandbox implementation, performing administrator-approved sandbox setup, changing enterprise requirements, granting session sandbox read directories, moving repositories into WSL2, verifying Windows version prerequisites, or proving Windows sandbox enforcement from repository metadata alone.',
        'Installing bubblewrap, loading AppArmor profiles, enabling Linux user namespaces, choosing active WSL distributions, granting runtime writable roots, moving repositories into Linux-native paths, configuring package repositories, or proving Linux sandbox enforcement from repository metadata alone.',
        'Granting macOS Screen Recording or Accessibility permissions, installing the Codex app, opening workspaces in the app, configuring MDM managed preferences, running local environment actions, changing active macOS privacy settings, or proving Seatbelt sandbox enforcement from repository metadata alone.',
        'Opening the Codex app settings pane, selecting project local environments, creating or updating app-local environment state, running setup scripts in new worktrees, starting integrated-terminal actions, installing dependencies, satisfying platform prerequisites, or proving local action behavior from repository metadata alone.',
        'Granting shell, browser, network, credential, memory, or external-service authority from package metadata alone.',
        'Installing, enabling, sharing, authenticating, or invoking Codex or GitHub Copilot plugins from repository metadata alone.',
        'Installing or enabling Browser, Chrome, Computer Use, or Sites plugins and their app, website, OS, hosting, or workspace permissions.',
        'Executing harness-native evaluations, benchmark tasks, reviewer-agent scoring, hosted traces, or runtime scoring workflows.',
        'Proving hosted Codex Cloud, channel delegation, GitHub review, PR feedback, remote MCP reachability, OAuth MCP login, side-effecting MCP behavior, browser interaction, Chrome profile operation, desktop automation, Sites deployment, or harness-native evaluation execution without a harness-native run.',
    ];
    const runtimeEvidenceWaiverSummary = buildRuntimeEvidenceWaiverSummary(
        runtimeEvidenceChecklist,
        notAchievableByRepositoryProjection,
    );
    const technicalImpossibilitySummary = buildCodexTechnicalImpossibilitySummary(
        notAchievableByRepositoryProjection,
    );
    const runtimeEvidenceCompletenessSummary = buildRuntimeEvidenceCompletenessSummary(
        runtimeEvidenceCoverageSummary,
        runtimeEvidenceReadinessSummary,
        runtimeEvidenceWaiverSummary,
        runtimeEvidenceCompletionActionPlan,
    );
    const runtimeEvidenceCompletionBlockerSummary =
        buildRuntimeEvidenceCompletionBlockerSummary(runtimeEvidenceCompletionActionPlan);
    const runtimeEvidenceCompletionReadinessSummary =
        buildRuntimeEvidenceCompletionReadinessSummary(runtimeEvidenceCompletionActionPlan);
    const runtimeEvidenceExpected = [
        'Local file discovery: Codex CLI, IDE extension, or app smoke evidence against the generated workspace.',
        'Cloud or channel delegation: hosted task or connector evidence showing environment, repository, result, and limitations.',
        'App connector runtime: installed connector or app identity, workspace or organization approval, linked user account, connected repository or channel, posting and data-sharing policy, representative connector task, result, and known limitations.',
        'Agent runtime: selected subagent or custom agent, spawned thread identity, inherited sandbox and approval posture, runtime overrides, tool activity, result, token/cost posture, and known limitations.',
        'Automation runtime: automation identity, schedule, target project or thread, local versus worktree execution mode, sandbox and approval posture, plugins or skills used, run status, findings or archive result, token/cost posture, and known limitations.',
        'Authentication runtime: authenticated user or service identity, workspace or organization context, auth method, token or credential storage posture, connected account state, entitlement or policy posture, representative authenticated operation, audit or billing posture, and known limitations.',
        'Permission runtime: active permission profile or sandbox mode, approval policy, reviewer mode, managed requirements source, effective writable roots, network posture, command or tool approval result, side-effecting app or MCP approval behavior, protected path behavior, and known limitations.',
        'Enterprise policy runtime: effective managed configuration or organization policy source, assigned role or group, policy precedence layer, managed requirements or host policy identifier, constrained approval and sandbox posture, web search and network posture, MCP allowlist, plugin marketplace policy, feature pins, command-rule restrictions, audit posture, fleet-version compatibility, representative policy enforcement result, and known limitations.',
        'Worktree include behavior: Codex app version, project Git state, selected branch, `.gitignore` and `.worktreeinclude` content, created managed worktree path, copied ignored file inventory, skipped symlink or overwrite behavior, automatic `AGENTS.override.md` copy posture, and known limitations.',
        'Review runtime: selected review surface, Git repository state, diff scope, PR branch and base, GitHub CLI or connector authentication, code-review setting state, review trigger, inline or PR comments loaded, posted findings or fixes, and known limitations.',
        'Remote connection runtime: connected host identity, controlling device identity, pairing and workspace authorization, host availability, SSH host configuration where applicable, remote project path, host-provided files/tools/plugins/MCP/browser/Computer Use posture, approval behavior, representative remote task, result, and known limitations.',
        'Chronicle runtime: Codex app and macOS host identity, ChatGPT plan eligibility, Memories setting state, Chronicle opt-in and consent state, Screen Recording and Accessibility permission posture, pause or resume state, temporary screen-capture storage posture, Chronicle memory artifact review, representative recall behavior, prompt-injection risk controls, and known limitations.',
        'Appshots runtime: Codex app and macOS host identity, Appshots hotkey or trigger path, frontmost app and window scope, Screen & System Audio Recording and Accessibility permission posture, captured image and available text review, thread destination behavior, sensitive-content review, and known limitations.',
        'Record & Replay runtime: Codex app version, macOS and region eligibility, Computer Use availability and policy, recorded workflow scope, generated skill artifact, replay environment, representative replay result, sensitive-data review, and known limitations.',
        'Import runtime: Codex app version, imported source agents and items, project and user setup inventory, generated Codex destinations, plugin or connector follow-up setup, reviewed permissions, tool restrictions, hooks, MCP auth, prompts, subagents, representative imported project or thread behavior, and known limitations.',
        'Model provider runtime: active provider from Codex status, provider config source, selected model, AWS Region or provider endpoint, credential source, identity and permission posture, local app or extension environment inheritance, representative request behavior, unavailable hosted features, and known limitations.',
        'Non-interactive runtime: Codex CLI version, command invocation, working directory and Git repository state, authentication method and credential scope, sandbox and approval settings, JSON or output-schema configuration, stdin and output handling, session resume posture, representative command/tool activity, produced artifacts, exit status, audit or billing posture, and known limitations.',
        'SDK runtime: SDK package and version, language runtime, embedding application identity, Codex CLI or app-server runtime source, authentication method and credential scope, thread start or resume behavior, sandbox preset or turn override, representative SDK call, command or tool activity, trace or log posture, deployment environment, exit or error handling, and known limitations.',
        'App-server runtime: Codex CLI version, app-server command invocation, selected transport, listener binding and authentication posture, client identity, initialize/initialized handshake, thread start or resume behavior, turn start or steering behavior, event-stream handling, schema version, overload or retry handling, sandbox and approval posture, representative command or tool activity, exit or error handling, and known limitations.',
        'IDE extension runtime: editor host and version, Codex extension version, active workspace and project trust, sign-in method and credential scope, shared config source, selected model, sandbox and approval posture, open file list, selected text range, command entry point, Add to Codex Thread or file tagging behavior, MCP, plugin, and skill discovery posture, cloud preview or continue-local behavior, WSL or native execution setting where applicable, representative IDE task, result, and known limitations.',
        'Windows platform runtime: Codex surface, Windows version, native or WSL2 execution mode, selected sandbox implementation, private desktop setting, administrator setup posture, enterprise requirement constraints, session read-directory grants, repository location, representative sandboxed command behavior, and known limitations.',
        'Linux platform runtime: Codex surface, Linux distribution or WSL2 identity, bubblewrap availability, user namespace and AppArmor posture, writable root policy, repository location, package-manager prerequisite state, representative sandboxed command behavior, and known limitations.',
        'macOS platform runtime: Codex surface, Codex app availability, Seatbelt sandbox behavior, macOS Privacy & Security permission posture, writable root policy, local environment action behavior, managed preference state, representative sandboxed command behavior, and known limitations.',
        'Local environment runtime: Codex app version, selected project directory, checked-in `.codex` environment file posture, setup script content, platform-specific script selection, created worktree path, dependency and cache state, action identity, integrated-terminal execution result, host credential exposure posture, representative setup/action behavior, and known limitations.',
        'Cloud environment runtime: selected hosted environment, repository checkout, setup script result, dependency/cache state, secret and environment-variable posture, internet-access setting, sandbox policy, representative hosted task, result, cost/audit limits, and known limitations.',
        'MCP runtime: startup, remote endpoint reachability, login where applicable, tool listing, tool approval behavior, and one target tool call in the intended environment.',
        'Package marketplace readiness: reviewable candidate output, policy grants, runtime validation records, and operator acceptance.',
        'Plugin runtime: installed plugin identity and version, enabled state, marketplace source, app or MCP authentication state, restart/discovery evidence, representative invocation, result, and known limitations.',
        'Memory runtime: enabled Codex memory setting, thread-level memory controls, generated memory artifact review, recall evidence, and known retention or sharing limits.',
        'Browser, Chrome, Computer Use, and Sites runtime: installed plugin or app state, approval scope, target site/app/project identity, representative operation, result, and known limitations.',
        'Evaluation runtime: selected harness, repository checkout, model or agent identity, sandbox and tool policy, validation command, benchmark or scoring result, artifacts, traces where available, cost/data limits, and known limitations.',
    ];
    const lines: string[] = [
        '# Codex Support Boundaries',
        '',
        `Generated by \`${generatedBy}\`.`,
        `Generated at \`${generatedAt}\`.`,
        `Codex adapter version \`${CODEX_ADAPTER_VERSION}\`.`,
        '',
        'MetaFlow projects file-backed Codex surfaces and reports harness-owned runtime surfaces. Repository metadata does not create hosted environments, connect external accounts, grant credentials, or prove side-effecting tool behavior.',
        '',
        '## File-Backed and Reviewable Surfaces',
        '',
        '| Concept | Support | Native surfaces |',
        '| --- | --- | --- |',
    ];

    for (const row of supportedRows) {
        lines.push(
            `| ${row.concept} | ${row.support} | ${row.nativeSurfaces.join('<br>')} |`,
        );
    }

    lines.push(
        '',
        '## Runtime-Only Codex Surfaces',
        '',
        '| Concept | Native surfaces | Boundary |',
        '| --- | --- | --- |',
    );

    for (const row of runtimeOnlyRows) {
        lines.push(
            `| ${row.concept} | ${row.nativeSurfaces.join('<br>')} | ${row.notes.join(' ')} |`,
        );
    }

    lines.push(
        '',
        '## Runtime Evidence Coverage Summary',
        '',
        '| Runtime-only concepts | With evidence | Evidence without diagnostics | Evidence with diagnostics | Missing evidence | Records | Records with diagnostics | Records with error diagnostics | Records with expired evidence | Records with stale adapter version | Concepts with diagnostics | Concepts with error diagnostics | Concepts with expired evidence | Concepts with stale adapter version | Passed | Partial | Failed | Not run | Waived |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        `| ${runtimeEvidenceCoverageSummary.totalRuntimeOnlyConcepts} | ${runtimeEvidenceCoverageSummary.conceptsWithEvidence} | ${runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnostics} | ${runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnostics} | ${runtimeEvidenceCoverageSummary.conceptsWithoutEvidence} | ${runtimeEvidenceCoverageSummary.records} | ${runtimeEvidenceCoverageSummary.recordsWithWarnings} | ${runtimeEvidenceCoverageSummary.diagnosticRecordsBySeverity.error} | ${runtimeEvidenceCoverageSummary.recordsWithExpiredEvidence} | ${runtimeEvidenceCoverageSummary.recordsWithStaleAdapterVersion} | ${runtimeEvidenceCoverageSummary.conceptsWithWarnings} | ${runtimeEvidenceCoverageSummary.diagnosticConceptsBySeverity.error} | ${runtimeEvidenceCoverageSummary.conceptsWithExpiredEvidence} | ${runtimeEvidenceCoverageSummary.conceptsWithStaleAdapterVersion} | ${runtimeEvidenceCoverageSummary.byStatus.passed} | ${runtimeEvidenceCoverageSummary.byStatus.partial} | ${runtimeEvidenceCoverageSummary.byStatus.failed} | ${runtimeEvidenceCoverageSummary.byStatus['not-run']} | ${runtimeEvidenceCoverageSummary.byStatus.waived} |`,
        '',
        'Waived runtime evidence is explicit reviewed evidence that a native Codex surface is unavailable, unauthorized, or intentionally out of scope for the current release posture; it does not claim the surface passed runtime validation.',
        '',
        '## Runtime Evidence Waiver Summary',
        '',
        '| Waived concepts | Waived records | Repository-projection impossible items | Concepts |',
        '| --- | --- | --- | --- |',
        `| ${runtimeEvidenceWaiverSummary.waivedConcepts} | ${runtimeEvidenceWaiverSummary.waivedRecords} | ${runtimeEvidenceWaiverSummary.notAchievableByRepositoryProjectionItems} | ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceWaiverSummary.concepts)} |`,
        '',
        'Waived and impossible items require operator review. They document boundaries that repository metadata cannot satisfy by itself, such as external account authorization, hosted execution, OS permissions, app installation, connector approval, or side-effecting tool authority.',
        '',
        '## Technical Impossibility Summary',
        '',
        '| Repository-projection impossible items | External-authority items | Hosted/network items | App/platform items | Runtime-native proof items |',
        '| --- | --- | --- | --- | --- |',
        `| ${technicalImpossibilitySummary.repositoryProjectionImpossibleItems} | ${technicalImpossibilitySummary.externalAuthorityItems} | ${technicalImpossibilitySummary.hostedOrNetworkItems} | ${technicalImpossibilitySummary.appOrPlatformItems} | ${technicalImpossibilitySummary.runtimeNativeProofItems} |`,
        '',
        'These items are not generated as repository files because they require harness-native state, account authority, hosted execution, app or OS permissions, side-effect approval, or runtime proof outside the repository metadata layer.',
        '',
        '## Runtime Evidence Completeness Summary',
        '',
        '| Release-ready | Runtime-complete | Runtime-only concepts | Passed | Partial | Waived | Missing | Failed | Not run | Diagnostics | Expired evidence | Stale adapter evidence | Remaining completion actions | Repository-projection impossible items |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        `| ${runtimeEvidenceCompletenessSummary.releaseReady ? 'yes' : 'no'} | ${runtimeEvidenceCompletenessSummary.runtimeComplete ? 'yes' : 'no'} | ${runtimeEvidenceCompletenessSummary.runtimeOnlyConcepts} | ${runtimeEvidenceCompletenessSummary.passedConcepts} | ${runtimeEvidenceCompletenessSummary.partialConcepts} | ${runtimeEvidenceCompletenessSummary.waivedConcepts} | ${runtimeEvidenceCompletenessSummary.missingConcepts} | ${runtimeEvidenceCompletenessSummary.failedConcepts} | ${runtimeEvidenceCompletenessSummary.notRunConcepts} | ${runtimeEvidenceCompletenessSummary.diagnosticConcepts} | ${runtimeEvidenceCompletenessSummary.expiredEvidenceConcepts} | ${runtimeEvidenceCompletenessSummary.staleAdapterVersionConcepts} | ${runtimeEvidenceCompletenessSummary.remainingCompletionActionItems} | ${runtimeEvidenceCompletenessSummary.repositoryProjectionImpossibleItems} |`,
        '',
        `Partial concepts: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletenessSummary.partialConceptList)}.`,
        `Waived concepts: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletenessSummary.waivedConceptList)}.`,
        `Release-ready blocking conditions: ${runtimeEvidenceCompletenessSummary.blockingConditions.length > 0 ? runtimeEvidenceCompletenessSummary.blockingConditions.join(', ') : 'none'}.`,
        'Runtime-complete is true only when the release-ready preset is ready and no runtime-only concept remains partial.',
        '',
        '## Runtime Evidence Completion Blocker Summary',
        '',
        '| Partial concepts | Partial records | Limitation items | Authority implication items | Native surface items | Concepts |',
        '| --- | --- | --- | --- | --- | --- |',
        `| ${runtimeEvidenceCompletionBlockerSummary.partialConcepts} | ${runtimeEvidenceCompletionBlockerSummary.partialRecords} | ${runtimeEvidenceCompletionBlockerSummary.limitationItems} | ${runtimeEvidenceCompletionBlockerSummary.authorityImplicationItems} | ${runtimeEvidenceCompletionBlockerSummary.nativeSurfaceItems} | ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletionBlockerSummary.concepts)} |`,
        '',
        'Completion blockers are partial runtime concepts that need stronger harness-native proof before runtime-complete can pass. Each blocker keeps the current record IDs, limitations, native surfaces, authority implications, and expected proof in JSON output.',
        '',
        '## Runtime Evidence Completion Readiness Summary',
        '',
        '| Partial concepts | Current-environment candidates | External-authority bound | Hosted/network bound | App/platform bound |',
        '| --- | --- | --- | --- | --- |',
        `| ${runtimeEvidenceCompletionReadinessSummary.partialConcepts} | ${runtimeEvidenceCompletionReadinessSummary.currentEnvironmentCandidates} | ${runtimeEvidenceCompletionReadinessSummary.externalAuthorityBoundConcepts} | ${runtimeEvidenceCompletionReadinessSummary.hostedOrNetworkBoundConcepts} | ${runtimeEvidenceCompletionReadinessSummary.appOrPlatformBoundConcepts} |`,
        '',
        `Current-environment candidates: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletionReadinessSummary.currentEnvironmentCandidateConcepts)}.`,
        `External-authority bound: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletionReadinessSummary.externalAuthorityBoundConceptsList)}.`,
        `Hosted/network bound: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletionReadinessSummary.hostedOrNetworkBoundConceptsList)}.`,
        `App/platform bound: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCompletionReadinessSummary.appOrPlatformBoundConceptsList)}.`,
        'A concept can appear in more than one readiness category. Current-environment candidates still require reviewed runtime evidence before they can be promoted from partial to passed.',
        '',
        '## Runtime Evidence Review Queues',
        '',
        `- Missing evidence: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsByStatus.missing)}`,
        `- Evidence without diagnostics: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnosticRecords)}`,
        `- Evidence with diagnostics: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnosticRecords)}`,
        `- Evidence with error diagnostics: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsWithErrorRecords)}`,
        `- Partial evidence: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsByStatus.partial)}`,
        `- Expired evidence: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsWithExpiredEvidenceRecords)}`,
        `- Stale adapter version evidence: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsWithStaleAdapterVersionRecords)}`,
        `- Waived evidence: ${formatRuntimeEvidenceConceptQueue(runtimeEvidenceCoverageSummary.conceptsByStatus.waived)}`,
        '',
        '## Runtime Evidence Readiness Summary',
        '',
        `Release-ready preset: ${runtimeEvidenceReadinessSummary.ready ? 'ready' : 'blocked'}.`,
        `Checked gates: ${runtimeEvidenceReadinessSummary.checkedConditions.join(', ')}.`,
        `Blocking gates: ${runtimeEvidenceReadinessSummary.blockingConditions.length > 0 ? runtimeEvidenceReadinessSummary.blockingConditions.join(', ') : 'none'}.`,
        'Release-ready means the configured gates have no blockers. It may still include partial or waived evidence, so reviewers must inspect the coverage summary before treating runtime support as fully proven.',
        '',
        '## Runtime Evidence Action Plan',
        '',
        ...formatRuntimeEvidenceActionPlan(runtimeEvidenceActionPlan),
        '',
        '## Runtime Evidence Completion Action Plan',
        '',
        'Runtime-complete adds partial evidence to the release-ready gates. These actions identify partial runtime-only concepts that need stronger harness-native proof before `--fail-on runtime-complete` can pass.',
        '',
        ...formatRuntimeEvidenceActionPlan(runtimeEvidenceCompletionActionPlan),
        '',
        '## Runtime Evidence Gate Summary',
        '',
        '| Gate | Triggered | Count | Concepts |',
        '| --- | --- | --- | --- |',
        ...Object.values(runtimeEvidenceGateSummary).map(
            (gate) =>
                `| ${gate.condition} | ${gate.triggered ? 'yes' : 'no'} | ${gate.count} | ${formatRuntimeEvidenceConceptQueue(gate.concepts)} |`,
        ),
        '',
        '## Runtime Evidence Checklist By Concept',
        '',
        '| Concept | Coverage | Runtime evidence expected | Authority implications | Evidence records |',
        '| --- | --- | --- | --- | --- |',
    );

    for (const item of runtimeEvidenceChecklist) {
        const records =
            item.runtimeEvidenceRecords.length > 0
                ? item.runtimeEvidenceRecords
                      .map((record) => `${record.id} (${record.status})`)
                      .join('<br>')
                : 'none recorded';
        lines.push(
            `| ${item.concept} | ${item.coverageStatus} | ${item.runtimeEvidenceExpected} | ${item.authorityImplications.join(' ')} | ${records} |`,
        );
    }

    lines.push(
        '',
        '## Not Achievable By Repository Projection Alone',
        '',
        ...notAchievableByRepositoryProjection.map((item) => `- ${item}`),
        '',
        '## Runtime Evidence Expected',
        '',
        ...runtimeEvidenceExpected.map((item) => `- ${item}`),
        '',
        '## Related Operator Guides',
        '',
        ...relatedGuides.map((guide) => `- ${guide}`),
        '',
    );

    return {
        generatedBy,
        generatedAt,
        adapterVersion: CODEX_ADAPTER_VERSION,
        runtimeOnlyCount: runtimeOnlyRows.length,
        fileBackedRows: supportedRows,
        runtimeOnlyRows,
        runtimeEvidenceCoverageSummary,
        runtimeEvidenceWaiverSummary,
        runtimeEvidenceCompletenessSummary,
        runtimeEvidenceCompletionBlockerSummary,
        runtimeEvidenceCompletionReadinessSummary,
        runtimeEvidenceGateSummary,
        runtimeEvidenceReadinessSummary,
        runtimeEvidenceActionPlan,
        runtimeEvidenceCompletionActionPlan,
        runtimeEvidenceChecklist,
        technicalImpossibilitySummary,
        notAchievableByRepositoryProjection,
        runtimeEvidenceExpected,
        relatedGuides,
        content: `${lines.join('\n')}\n`,
    };
}

export function buildCodexProjectionBoundaryDocument(
    supportBoundariesDocument: CodexSupportBoundariesDocument,
    options?: {
        generatedBy?: string;
        generatedAt?: string;
    },
): CodexProjectionBoundaryDocument {
    const generatedBy =
        options?.generatedBy ?? 'metaflow codex-support-boundaries --projection-boundary-review';
    const generatedAt = options?.generatedAt ?? supportBoundariesDocument.generatedAt;
    const fileBackedSurfaces = supportBoundariesDocument.fileBackedRows.map((row) => ({
        concept: row.concept,
        support: row.support,
        nativeSurfaces: row.nativeSurfaces,
        notes: row.notes,
        evidence: row.evidence,
    }));
    const unsupportedSurfaces = fileBackedSurfaces.filter(
        (row) => row.support === 'unsupported',
    );
    const runtimeOnlySurfaces = supportBoundariesDocument.runtimeOnlyRows.map((row) => ({
        concept: row.concept,
        nativeSurfaces: row.nativeSurfaces,
        boundary: row.notes.join(' '),
        authorityImplications: row.authorityImplications,
        evidence: row.evidence,
    }));
    const summary: CodexProjectionBoundarySummary = {
        fileBackedRows: fileBackedSurfaces.length,
        runtimeOnlyRows: runtimeOnlySurfaces.length,
        unsupportedRows: unsupportedSurfaces.length,
        notAchievableItems:
            supportBoundariesDocument.notAchievableByRepositoryProjection.length,
        authoritySensitiveRuntimeOnlyRows: runtimeOnlySurfaces.filter(
            (row) => row.authorityImplications.length > 0,
        ).length,
        runtimeEvidenceExpectedItems:
            supportBoundariesDocument.runtimeEvidenceExpected.length,
    };
    const lines: string[] = [
        '# Codex Repository Projection Boundary Review',
        '',
        `Generated by \`${generatedBy}\`.`,
        `Generated at \`${generatedAt}\`.`,
        `Codex adapter version \`${supportBoundariesDocument.adapterVersion}\`.`,
        '',
        'MetaFlow separates file-backed Codex metadata from harness-owned runtime behavior. Repository projection can create and maintain supported files, but it cannot grant authority, connect accounts, select live runtime state, or prove side-effecting behavior.',
        '',
        '## Summary',
        '',
        '| File-backed rows | Runtime-only rows | Unsupported rows | Not achievable items | Authority-sensitive runtime rows | Runtime evidence expectation items |',
        '| --- | --- | --- | --- | --- | --- |',
        `| ${summary.fileBackedRows} | ${summary.runtimeOnlyRows} | ${summary.unsupportedRows} | ${summary.notAchievableItems} | ${summary.authoritySensitiveRuntimeOnlyRows} | ${summary.runtimeEvidenceExpectedItems} |`,
        '',
        '## Technical Impossibility Summary',
        '',
        '| Repository-projection impossible items | External-authority items | Hosted/network items | App/platform items | Runtime-native proof items |',
        '| --- | --- | --- | --- | --- |',
        `| ${supportBoundariesDocument.technicalImpossibilitySummary.repositoryProjectionImpossibleItems} | ${supportBoundariesDocument.technicalImpossibilitySummary.externalAuthorityItems} | ${supportBoundariesDocument.technicalImpossibilitySummary.hostedOrNetworkItems} | ${supportBoundariesDocument.technicalImpossibilitySummary.appOrPlatformItems} | ${supportBoundariesDocument.technicalImpossibilitySummary.runtimeNativeProofItems} |`,
        '',
        '## File-Backed and Reviewable Surfaces',
        '',
        '| Concept | Support | Native surfaces | Notes | Evidence |',
        '| --- | --- | --- | --- | --- |',
    ];
    for (const row of fileBackedSurfaces) {
        lines.push(
            `| ${row.concept} | ${row.support} | ${row.nativeSurfaces.join('<br>')} | ${row.notes.join(' ')} | ${row.evidence.length > 0 ? row.evidence.join(', ') : 'none'} |`,
        );
    }
    lines.push(
        '',
        '## Runtime-Only Surfaces',
        '',
        '| Concept | Native surfaces | Boundary | Authority implications | Evidence |',
        '| --- | --- | --- | --- | --- |',
    );
    for (const row of runtimeOnlySurfaces) {
        lines.push(
            `| ${row.concept} | ${row.nativeSurfaces.join('<br>')} | ${row.boundary} | ${row.authorityImplications.join(' ')} | ${row.evidence.length > 0 ? row.evidence.join(', ') : 'none'} |`,
        );
    }
    lines.push(
        '',
        '## Unsupported Surfaces',
        '',
        ...(unsupportedSurfaces.length > 0
            ? [
                  '| Concept | Native surfaces | Notes |',
                  '| --- | --- | --- |',
                  ...unsupportedSurfaces.map(
                      (row) =>
                          `| ${row.concept} | ${row.nativeSurfaces.join('<br>')} | ${row.notes.join(' ')} |`,
                  ),
              ]
            : ['None for the current Codex adapter matrix.']),
        '',
        '## Not Achievable By Repository Projection Alone',
        '',
        ...supportBoundariesDocument.notAchievableByRepositoryProjection.map(
            (item) => `- ${item}`,
        ),
        '',
        '## Runtime Evidence Expected',
        '',
        ...supportBoundariesDocument.runtimeEvidenceExpected.map((item) => `- ${item}`),
        '',
        '## Related Operator Guides',
        '',
        ...supportBoundariesDocument.relatedGuides.map((guide) => `- ${guide}`),
        '',
    );
    return {
        schemaVersion: 'metaflow.codexProjectionBoundary/v1',
        generatedBy,
        generatedAt,
        adapterVersion: supportBoundariesDocument.adapterVersion,
        target: 'codex',
        summary,
        fileBackedSurfaces,
        runtimeOnlySurfaces,
        unsupportedSurfaces,
        technicalImpossibilitySummary: supportBoundariesDocument.technicalImpossibilitySummary,
        notAchievableByRepositoryProjection:
            supportBoundariesDocument.notAchievableByRepositoryProjection,
        runtimeEvidenceExpected: supportBoundariesDocument.runtimeEvidenceExpected,
        relatedGuides: supportBoundariesDocument.relatedGuides,
        content: `${lines.join('\n')}\n`,
    };
}
