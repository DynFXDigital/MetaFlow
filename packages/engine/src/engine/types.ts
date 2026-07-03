/**
 * Overlay engine type definitions.
 *
 * Pure TypeScript — no VS Code imports.
 */

// ── Layer content model ────────────────────────────────────────────

/** A single file within a layer. */
export interface LayerFile {
    /** Relative path within the layer (e.g., `instructions/coding.md`). */
    relativePath: string;
    /** Original relative source path when the file is projected from canonical metadata. */
    sourceRelativePath?: string;
    /** Absolute path to the source file on disk. */
    absolutePath: string;
    /** Optional projected content used when a target output is rendered from canonical metadata. */
    projectedContent?: string;
}

/** Resolved content of a single layer. */
export interface LayerContent {
    /** Layer identifier (e.g., `company/core`). */
    layerId: string;
    /** Repo ID (for multi-repo; undefined for single-repo). */
    repoId?: string;
    /** Files discovered in this layer. */
    files: LayerFile[];
    /** Optional capability metadata loaded from a capability manifest at layer root. */
    capability?: CapabilityMetadata;
    /** Policy grants loaded from canonical MetaFlow policy manifests. */
    policyGrants?: PolicyGrantMetadata[];
    /** MCP servers loaded from canonical MetaFlow MCP manifests. */
    mcpServers?: McpServerMetadata[];
    /** Hooks loaded from canonical MetaFlow hook manifests. */
    hooks?: HookMetadata[];
    /** Execution profiles loaded from canonical MetaFlow execution manifests. */
    executionProfiles?: ExecutionProfileMetadata[];
    /** Memory scopes loaded from canonical MetaFlow memory manifests. */
    memoryScopes?: MemoryScopeMetadata[];
    /** Evaluation profiles loaded from canonical MetaFlow evaluation manifests. */
    evaluationProfiles?: EvaluationProfileMetadata[];
    /** Agent profiles loaded from canonical MetaFlow agent manifests. */
    agentProfiles?: AgentProfileMetadata[];
    /** Codex project configurations loaded from canonical MetaFlow project-config manifests. */
    codexProjectConfigs?: CodexProjectConfigMetadata[];
    /** Target adapter preferences loaded from canonical MetaFlow target manifests. */
    targetAdapters?: TargetAdapterMetadata[];
}

/** Warning emitted while parsing/validating capability metadata. */
export type CapabilityDiagnosticSeverity = 'error' | 'warning' | 'info';

/** Warning emitted while parsing/validating capability metadata. */
export interface CapabilityWarning {
    /** Stable warning code for testability and diagnostics routing. */
    code: string;
    /** Human-readable warning message. */
    message: string;
    /** Optional file path associated with the warning. */
    filePath?: string;
    /** Severity used for diagnostics routing. */
    severity?: CapabilityDiagnosticSeverity;
}

/** Capability-local agent-plugin manifest metadata loaded from plugin.json. */
export interface CapabilityAgentPluginManifest {
    /** Absolute path to the plugin.json file. */
    pluginJsonPath: string;
    /** Plugin manifest name. */
    name?: string;
    /** Plugin manifest version. */
    version?: string;
    /** Plugin manifest description. */
    description?: string;
    /** Optional discovery keywords. */
    keywords: string[];
    /** Optional target plugin hosts. */
    pluginHosts: string[];
    /** Optional minimum MetaFlow version range. */
    minimumMetaflowVersion?: string;
}

/** Canonical component references declared by .metaflow/capability.json. */
export type CapabilityComponentReferences = Record<string, string[]>;

/** Canonical target support declaration from .metaflow/capability.json. */
export interface CapabilityTargetDeclaration {
    /** Whether this target is enabled for the capability. */
    enabled?: boolean;
}

/** Canonical target declarations keyed by target id. */
export type CapabilityTargetDeclarations = Record<string, CapabilityTargetDeclaration>;

/** A normalized agent-plugin catalog entry derived from a capability layer. */
export interface CapabilityPluginCatalogEntry {
    /** Stable plugin identity used by agent-plugin consumers. */
    pluginName: string;
    /** Published plugin package version. */
    version: string;
    /** User-facing title for marketplace and catalog displays. */
    displayName: string;
    /** Optional user-facing description. */
    description?: string;
    /** Capability identifier backing this plugin package. */
    capabilityId: string;
    /** Layer identifier backing this plugin package. */
    layerId: string;
    /** Repo identifier backing this plugin package. */
    repoId?: string;
    /** Capability manifest path. */
    manifestPath: string;
    /** plugin.json path. */
    pluginJsonPath: string;
    /** Declared plugin hosts. */
    pluginHosts: string[];
    /** Optional minimum MetaFlow version range. */
    minimumMetaflowVersion?: string;
    /** Optional SPDX identifier/expression or fallback token. */
    license?: string;
    /** Whether the capability is marked experimental. */
    experimental?: boolean;
}

/** Parsed capability metadata associated with a layer. */
export interface CapabilityMetadata {
    /** Canonical capability schema version when supplied by .metaflow/capability.json. */
    schemaVersion?: string;
    /** Internal capability identifier (currently derived from folder name). */
    id: string;
    /** Immutable generated capability identity used to survive path/id reorganizations. */
    uid?: string;
    /** Historical human-readable ids that can be used for migration/reconciliation. */
    previousIds?: string[];
    /** Historical repo-relative paths that can be used for migration/reconciliation. */
    previousPaths?: string[];
    /** Absolute path to the manifest that supplied capability metadata. */
    manifestPath: string;
    /** User-facing capability name. */
    name?: string;
    /** Optional canonical capability domain. */
    domain?: string;
    /** Optional canonical capability kind. */
    kind?: string;
    /** Optional canonical lifecycle status. */
    lifecycle?: string;
    /** Optional canonical owner identifiers. */
    owners?: string[];
    /** Optional canonical component references by component kind. */
    components?: CapabilityComponentReferences;
    /** Optional canonical target support declarations by target id. */
    targets?: CapabilityTargetDeclarations;
    /** Optional canonical package declarations by package id. */
    packages?: string[];
    /** User-facing capability description. */
    description?: string;
    /** Optional SPDX identifier/expression or fallback token. */
    license?: string;
    /** Whether the capability is explicitly marked experimental. */
    experimental?: boolean;
    /** Whether this capability opts into agent-plugin packaging validation. */
    agentPlugin?: boolean;
    /** Optional validated plugin manifest metadata for agent-plugin-compatible capabilities. */
    agentPluginManifest?: CapabilityAgentPluginManifest;
    /** Markdown content after frontmatter. */
    body?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Authority category derived from a canonical policy grant authority string. */
export type PolicyGrantAuthorityCategory =
    | 'shell'
    | 'browser'
    | 'mcp'
    | 'github'
    | 'cloudTask'
    | 'memory'
    | 'notification'
    | 'other';

/** Approval posture declared by a canonical policy grant. */
export type PolicyGrantApproval = 'auto' | 'on-request' | 'manual' | 'forbidden';

/** Canonical MetaFlow policy grant metadata associated with a layer. */
export interface PolicyGrantMetadata {
    /** Stable policy grant identifier. */
    id: string;
    /** Absolute path to the manifest that supplied policy grant metadata. */
    manifestPath: string;
    /** Harness-neutral authority string such as github.pullRequest.read. */
    authority: string;
    /** Authority category derived from the authority prefix. */
    category: PolicyGrantAuthorityCategory;
    /** Approval posture required for this authority. */
    approval: PolicyGrantApproval;
    /** Optional structured authority scope. */
    scope?: Record<string, unknown>;
    /** Whether this authority requires audit evidence. */
    audit: boolean;
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Transport family declared by a canonical MCP server manifest. */
export type McpServerTransport = 'stdio' | 'http' | 'sse' | 'streamable-http';

/** Environment variable source declared for a forwarded MCP environment variable. */
export type McpServerEnvironmentSource = 'local' | 'remote';

/** Forwarded environment variable declaration for an MCP server runtime. */
export interface McpServerForwardedEnvVar {
    /** Environment variable name forwarded into the MCP server runtime. */
    name: string;
    /** Optional source boundary for the forwarded variable. */
    source?: McpServerEnvironmentSource;
}

/** Codex MCP tool approval mode represented by MetaFlow. */
export type McpServerToolApprovalMode = 'auto' | 'prompt' | 'approve';

/** Local process invocation declared by a canonical MCP server manifest. */
export interface McpServerInvocation {
    /** Executable command or package runner. */
    command: string;
    /** Optional command arguments. */
    args: string[];
    /** Optional literal environment variables passed to the local MCP process. */
    env?: Record<string, string>;
    /** Optional working directory for the local MCP process. */
    cwd?: string;
    /** Optional environment variable forwarding declarations. */
    envVars?: McpServerForwardedEnvVar[];
}

/** Canonical MetaFlow MCP server metadata associated with a layer. */
export interface McpServerMetadata {
    /** Stable MCP server identifier. */
    id: string;
    /** Absolute path to the manifest that supplied MCP server metadata. */
    manifestPath: string;
    /** Transport used by the MCP server. */
    transport: McpServerTransport;
    /** Optional local invocation for stdio-style MCP servers. */
    invocation?: McpServerInvocation;
    /** Optional endpoint reference for network MCP transports. */
    endpoint?: string;
    /** Required secret names referenced by the server. */
    requiredSecrets: string[];
    /** Optional bearer token environment variable for network transports. */
    bearerTokenEnvVar?: string;
    /** Optional literal HTTP headers for network transports. */
    httpHeaders?: Record<string, string>;
    /** Optional HTTP headers whose values are read from environment variables. */
    envHttpHeaders?: Record<string, string>;
    /** Optional OAuth scopes requested by network transports. */
    oauthScopes?: string[];
    /** Optional OAuth resource identifier requested by network transports. */
    oauthResource?: string;
    /** Optional startup timeout in seconds. */
    startupTimeoutSeconds?: number;
    /** Optional tool call timeout in seconds. */
    toolTimeoutSeconds?: number;
    /** Optional target-runtime enablement flag. */
    enabled?: boolean;
    /** Optional target-runtime required-server flag. */
    required?: boolean;
    /** Optional allow-list of tools exposed by the server. */
    enabledTools?: string[];
    /** Optional deny-list of tools exposed by the server. */
    disabledTools?: string[];
    /** Optional default approval mode for server tools. */
    defaultToolsApprovalMode?: McpServerToolApprovalMode;
    /** Optional per-tool approval mode overrides. */
    toolApprovalModes?: Record<string, McpServerToolApprovalMode>;
    /** Capability category exposed by the server. */
    capabilityCategory?: string;
    /** Policy grants required before the server is used. */
    policyGrants: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Trigger phase declared by a canonical hook manifest. */
export type HookTriggerPhase =
    | 'preToolUse'
    | 'postToolUse'
    | 'preApply'
    | 'postApply'
    | 'preCommit'
    | 'custom';

/** Invocation type declared by a canonical hook manifest. */
export type HookInvocationType = 'command' | 'http' | 'llm';

/** Failure behavior declared by a canonical hook manifest. */
export type HookFailureBehavior = 'block' | 'warn' | 'continue';

/** Canonical MetaFlow hook metadata associated with a layer. */
export interface HookMetadata {
    /** Stable hook identifier. */
    id: string;
    /** Absolute path to the manifest that supplied hook metadata. */
    manifestPath: string;
    /** Lifecycle or tool phase that triggers this hook. */
    triggerPhase: HookTriggerPhase;
    /** Invocation type used by this hook. */
    invocationType: HookInvocationType;
    /** Optional command for command hooks. */
    command?: string;
    /** Optional command arguments for command hooks. */
    args: string[];
    /** Optional endpoint for HTTP hooks. */
    endpoint?: string;
    /** Affected scope such as repository, workspace, or pull-request. */
    scope?: string;
    /** Behavior when the hook reports failure. */
    failureBehavior: HookFailureBehavior;
    /** Policy grants required before the hook is used. */
    policyGrants: string[];
    /** Target harnesses or adapters this hook applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Execution surface declared by a canonical execution profile. */
export type ExecutionSurface =
    | 'localWorkstation'
    | 'devContainer'
    | 'cloudSandbox'
    | 'ciRunner'
    | 'longRunningVm';

/** Isolation boundary declared by a canonical execution profile. */
export type ExecutionIsolation =
    | 'none'
    | 'workspace-write'
    | 'container'
    | 'vm'
    | 'cloud-sandbox';

/** Canonical MetaFlow execution profile metadata associated with a layer. */
export interface ExecutionProfileMetadata {
    /** Stable execution profile identifier. */
    id: string;
    /** Absolute path to the manifest that supplied execution profile metadata. */
    manifestPath: string;
    /** Execution surface family for this profile. */
    surface: ExecutionSurface;
    /** Isolation boundary required by this profile. */
    isolation: ExecutionIsolation;
    /** Optional harness, runner, image, workflow, or environment reference. */
    runner?: string;
    /** Optional working directory used by the execution surface. */
    workingDirectory?: string;
    /** Optional positive timeout in seconds. */
    timeoutSeconds?: number;
    /** Required secret names referenced by this execution profile. */
    requiredSecrets: string[];
    /** Optional environment variables or symbolic environment references. */
    environment?: Record<string, string>;
    /** Policy grants required before this execution profile is used. */
    policyGrants: string[];
    /** Target harnesses or adapters this execution profile applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Memory boundary declared by a canonical memory scope manifest. */
export type MemoryScopeType =
    | 'repository'
    | 'user'
    | 'organization'
    | 'task'
    | 'decisionHistory';

/** Storage durability declared by a canonical memory scope manifest. */
export type MemoryScopeStorage = 'ephemeral' | 'session' | 'persistent' | 'external';

/** Canonical MetaFlow memory scope metadata associated with a layer. */
export interface MemoryScopeMetadata {
    /** Stable memory scope identifier. */
    id: string;
    /** Absolute path to the manifest that supplied memory scope metadata. */
    manifestPath: string;
    /** Boundary for memory access and retention. */
    scopeType: MemoryScopeType;
    /** Storage durability model for this memory scope. */
    storage: MemoryScopeStorage;
    /** Optional retention expression or policy reference. */
    retention?: string;
    /** Optional sharing boundary expression or policy reference. */
    sharing?: string;
    /** Optional read policy reference. */
    readPolicy?: string;
    /** Optional write policy reference. */
    writePolicy?: string;
    /** Policy grants required before this memory scope is used. */
    policyGrants: string[];
    /** Target harnesses or adapters this memory scope applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Evaluation type declared by a canonical evaluation profile manifest. */
export type EvaluationType =
    | 'build'
    | 'test'
    | 'lint'
    | 'semantic'
    | 'benchmark'
    | 'regressionGate'
    | 'reviewerAgent';

/** Canonical MetaFlow evaluation profile metadata associated with a layer. */
export interface EvaluationProfileMetadata {
    /** Stable evaluation profile identifier. */
    id: string;
    /** Absolute path to the manifest that supplied evaluation profile metadata. */
    manifestPath: string;
    /** Evaluation family for this profile. */
    evaluationType: EvaluationType;
    /** Optional command for command-backed evaluations. */
    command?: string;
    /** Optional command arguments. */
    args: string[];
    /** Required success criteria or evidence expectation. */
    successCriteria: string;
    /** Artifact paths, globs, or evidence references produced by this evaluation. */
    artifacts: string[];
    /** Policy grants required before this evaluation is used. */
    policyGrants: string[];
    /** Target harnesses or adapters this evaluation profile applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Canonical MetaFlow agent profile metadata associated with a layer. */
export interface AgentProfileMetadata {
    /** Stable agent profile identifier. */
    id: string;
    /** Absolute path to the manifest that supplied agent profile metadata. */
    manifestPath: string;
    /** Agent name used by the target harness. */
    name: string;
    /** Human-facing guidance for when the agent is used. */
    description: string;
    /** Core developer instructions that define agent behavior. */
    developerInstructions: string;
    /** Optional display nickname candidates for spawned agents. */
    nicknameCandidates: string[];
    /** Optional target model override. */
    model?: string;
    /** Optional target model reasoning effort override. */
    modelReasoningEffort?: string;
    /** Optional target sandbox mode override. */
    sandboxMode?: string;
    /** Optional target tool allow-list for agent harnesses that expose tool filters. */
    tools: string[];
    /** Optional canonical MCP server ids attached to this agent profile. */
    mcpServers: string[];
    /** Policy grants required before the agent profile is treated as operational. */
    policyGrants: string[];
    /** Target harnesses or adapters this agent profile applies to. */
    targets: string[];
    /** Optional user-facing notes about target support or projection constraints. */
    notes: string[];
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Safe subset of Codex project configuration settings represented by MetaFlow. */
export interface CodexProjectConfigSettings {
    /** Optional default model for the project. */
    model?: string;
    /** Optional model reasoning effort for the project. */
    modelReasoningEffort?: string;
    /** Optional model reasoning summary setting for the project. */
    modelReasoningSummary?: string;
    /** Optional model verbosity setting for the project. */
    modelVerbosity?: string;
    /** Optional project approval policy. */
    approvalPolicy?: string;
    /** Optional approval reviewer. */
    approvalsReviewer?: string;
    /** Optional sandbox mode. */
    sandboxMode?: string;
    /** Optional web search mode. */
    webSearch?: string;
    /** Optional personality setting. */
    personality?: string;
    /** Optional model instruction file path, resolved by Codex relative to `.codex/`. */
    modelInstructionsFile?: string;
    /** Optional project root markers. */
    projectRootMarkers?: string[];
    /** Optional feature flags. */
    features?: Record<string, boolean>;
    /** Optional workspace-write sandbox controls. */
    sandboxWorkspaceWrite?: {
        writableRoots?: string[];
        networkAccess?: boolean;
        excludeTmpdirEnvVar?: boolean;
        excludeSlashTmp?: boolean;
    };
    /** Optional shell environment forwarding policy. */
    shellEnvironmentPolicy?: {
        inherit?: string;
        includeOnly?: string[];
        exclude?: string[];
        set?: Record<string, string>;
        ignoreDefaultExcludes?: boolean;
    };
}

/** Canonical MetaFlow Codex project config metadata associated with a layer. */
export interface CodexProjectConfigMetadata {
    /** Stable project config identifier. */
    id: string;
    /** Absolute path to the manifest that supplied project config metadata. */
    manifestPath: string;
    /** Safe Codex project settings represented by the manifest. */
    settings: CodexProjectConfigSettings;
    /** Policy grants required before the project config is treated as operational. */
    policyGrants: string[];
    /** Target harnesses or adapters this project config applies to. */
    targets: string[];
    /** Optional user-facing notes about target support or projection constraints. */
    notes: string[];
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Materialization preference declared by a canonical target adapter manifest. */
export type TargetAdapterMaterializationMode =
    | 'managed'
    | 'candidate'
    | 'report-only'
    | 'disabled';

/** Validation status declared by a canonical target adapter manifest. */
export type TargetAdapterValidationStatus =
    | 'unverified'
    | 'staticVerified'
    | 'runtimeVerified'
    | 'manualWaived';

/** Canonical MetaFlow target adapter metadata associated with a layer. */
export interface TargetAdapterMetadata {
    /** Target adapter manifest identifier. */
    id: string;
    /** Absolute path to the manifest that supplied target adapter metadata. */
    manifestPath: string;
    /** Target harness family controlled by this manifest. */
    target: ProjectionTarget;
    /** Whether projections for this target are enabled for the owning capability. */
    enabled: boolean;
    /** Optional target adapter contract version expected by this capability. */
    adapterVersion?: string;
    /** Default materialization mode for target outputs. */
    materializationMode: TargetAdapterMaterializationMode;
    /** Optional per-canonical-concept materialization modes. */
    concepts: Partial<Record<TargetCapabilityConcept, TargetAdapterMaterializationMode>>;
    /** Required policy grants before target projections are treated as operational. */
    requiredPolicyGrants: string[];
    /** Declared target validation status. */
    validationStatus: TargetAdapterValidationStatus;
    /** Optional evidence identifiers or references for target validation. */
    validationEvidence: string[];
    /** Optional user-facing notes about target support or projection constraints. */
    notes: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Parsed METAFLOW.md metadata associated with a repository root. */
export interface RepoMetadata {
    /** Absolute path to METAFLOW.md. */
    manifestPath: string;
    /** User-facing repository name. */
    name?: string;
    /** User-facing repository description. */
    description?: string;
    /** Markdown content after frontmatter. */
    body?: string;
}

// ── Effective file model ───────────────────────────────────────────

/** Classification of an artifact: settings-injected, plugin-activated, or synchronized. */
export type ArtifactClassification = 'settings' | 'plugin' | 'synchronized';

/** Agent harness or metadata format associated with a projected artifact. */
export type ProjectionTarget = 'metaflow' | 'github-copilot' | 'codex' | 'generic';

/** Projection support fidelity for a target artifact. */
export type ProjectionLossiness = 'none' | 'lossy' | 'unsupported';

/** Target and support metadata for an effective or synchronized artifact. */
export interface ProjectionMetadata {
    /** Metadata format or harness family of the authored source artifact. */
    sourceFormat: ProjectionTarget;
    /** Metadata format or harness family of the projected output artifact. */
    target: ProjectionTarget;
    /** Whether the projected target path differs from the authored source path. */
    pathTransformed: boolean;
    /** Whether the projection preserves the source semantics for the target. */
    lossiness: ProjectionLossiness;
    /** Human-readable support notes for preview and diagnostics. */
    notes: string[];
    /** Canonical concept associated with the projected target path. */
    targetAdapterConcept?: TargetCapabilityConcept;
    /** Target adapter manifest that applies to this projection. */
    targetAdapterId?: string;
    /** Adapter contract version declared by the target adapter manifest. */
    targetAdapterVersion?: string;
    /** Materialization mode selected for this projected target artifact. */
    targetAdapterMaterializationMode?: TargetAdapterMaterializationMode;
    /** Validation status declared by the selected target adapter manifest. */
    targetAdapterValidationStatus?: TargetAdapterValidationStatus;
    /** Evidence identifiers declared by the selected target adapter manifest. */
    targetAdapterValidationEvidence?: string[];
    /** Policy grants required by the selected target adapter manifest. */
    targetAdapterRequiredPolicyGrants?: string[];
}

/** Canonical concept covered by a target adapter capability matrix. */
export type TargetCapabilityConcept =
    | 'instructions'
    | 'skills'
    | 'agents'
    | 'projectConfig'
    | 'mcpServers'
    | 'hooks'
    | 'packageManifests'
    | 'policyGrants'
    | 'executionSurfaces'
    | 'memoryScopes'
    | 'localCloudHandoff'
    | 'issuePrOperation'
    | 'evaluationSupport';

/** Support state for one canonical concept on one target adapter. */
export type TargetCapabilitySupportStatus =
    | 'supported'
    | 'partial'
    | 'unsupported'
    | 'runtime-only'
    | 'requires-policy-grant'
    | 'generated-substitute';

/** Capability matrix row describing one canonical concept on one target adapter. */
export interface TargetCapabilityMatrixEntry {
    /** Target adapter family. */
    target: ProjectionTarget;
    /** Adapter contract version used by MetaFlow for this target. */
    adapterVersion: string;
    /** Canonical concept covered by this row. */
    concept: TargetCapabilityConcept;
    /** Current projection support state. */
    support: TargetCapabilitySupportStatus;
    /** Harness-native paths or surfaces associated with this concept. */
    nativeSurfaces: string[];
    /** Support, lossiness, or validation notes. */
    notes: string[];
    /** Authority, sandbox, or policy implications reported during preview. */
    authorityImplications: string[];
    /** Evidence identifiers supporting the current matrix row. */
    evidence: string[];
}

/** Count of canonical metadata records considered by a target adapter report. */
export interface AdapterReadinessMetadataCounts {
    /** Canonical agent profiles considered for adapter readiness. */
    agentProfiles: number;
    /** Canonical Codex project configurations considered for adapter readiness. */
    codexProjectConfigs: number;
    /** Canonical policy grants considered for adapter readiness. */
    policyGrants: number;
    /** Canonical MCP server manifests considered for adapter readiness. */
    mcpServers: number;
    /** Canonical hook manifests considered for adapter readiness. */
    hooks: number;
    /** Canonical execution profiles considered for adapter readiness. */
    executionProfiles: number;
    /** Canonical memory scopes considered for adapter readiness. */
    memoryScopes: number;
    /** Canonical evaluation profiles considered for adapter readiness. */
    evaluationProfiles: number;
}

/** Adapter readiness action severity. */
export type AdapterReadinessSeverity = 'info' | 'warning';

/** One target-specific adapter action item derived from canonical metadata. */
export interface AdapterReadinessAction {
    /** Canonical concept that produced this action. */
    concept: TargetCapabilityConcept;
    /** Metadata identifier associated with this action. */
    metadataId: string;
    /** Action severity. */
    severity: AdapterReadinessSeverity;
    /** Human-readable adapter action. */
    message: string;
    /** Evidence identifiers supporting this adapter finding. */
    evidence: string[];
}

/** Target-specific readiness report for canonical metadata adapter work. */
export interface AdapterReadinessReport {
    /** Target adapter family. */
    target: ProjectionTarget;
    /** Adapter contract version used by MetaFlow for this target. */
    adapterVersion: string;
    /** Canonical metadata counts considered by this target. */
    managedMetadata: AdapterReadinessMetadataCounts;
    /** Action items required to make metadata operational for the target harness. */
    actionItems: AdapterReadinessAction[];
    /** Authority, runtime, or compatibility warnings that apply to the report. */
    warnings: string[];
    /** Evidence identifiers supporting the report. */
    evidence: string[];
}

/** An effective file after overlay resolution. */
export interface EffectiveFile {
    /** Relative path in the output (e.g., `instructions/coding.md`). */
    relativePath: string;
    /** Original relative source path when different from the projected output path. */
    sourceRelativePath?: string;
    /** Absolute path to the source file. */
    sourcePath: string;
    /** Which layer contributed this file (later wins). */
    sourceLayer: string;
    /** Which repo contributed this file (for multi-repo). */
    sourceRepo?: string;
    /** Internal capability identifier associated with the source layer. */
    sourceCapabilityId?: string;
    /** User-facing capability name associated with the source layer. */
    sourceCapabilityName?: string;
    /** Capability description associated with the source layer. */
    sourceCapabilityDescription?: string;
    /** Capability license associated with the source layer. */
    sourceCapabilityLicense?: string;
    /** Whether the source capability is explicitly marked experimental. */
    sourceCapabilityExperimental?: boolean;
    /** Target adapter preferences associated with the source capability layer. */
    sourceTargetAdapters?: TargetAdapterMetadata[];
    /** Optional projected content used when a target output is rendered from canonical metadata. */
    projectedContent?: string;
    /** Classification for realization strategy. */
    classification: ArtifactClassification;
}

/** A single candidate source participating in a surfaced-file conflict. */
export interface SurfacedFileConflictSource {
    /** Relative path in the output. */
    relativePath: string;
    /** Absolute path to the source file. */
    sourcePath: string;
    /** Which layer contributed this file. */
    sourceLayer: string;
    /** Which repo contributed this file. */
    sourceRepo?: string;
    /** Internal capability identifier associated with the source layer. */
    sourceCapabilityId?: string;
    /** User-facing capability name associated with the source layer. */
    sourceCapabilityName?: string;
}

/** A non-blocking conflict where multiple enabled capabilities surface the same file path. */
export interface SurfacedFileConflict {
    /** Relative output path that collides. */
    relativePath: string;
    /** Deterministic winner currently selected by overlay resolution. */
    winner: SurfacedFileConflictSource;
    /** Sources overridden by the winner. */
    overridden: SurfacedFileConflictSource[];
    /** All contenders in overlay order. */
    contenders: SurfacedFileConflictSource[];
}

// ── Overlay result ─────────────────────────────────────────────────

/** The complete result of overlay resolution. */
export interface OverlayResult {
    /** All effective files after resolution, filtering, and profile activation. */
    effectiveFiles: EffectiveFile[];
    /** Active profile name (if any). */
    activeProfile?: string;
    /** Total layers processed. */
    layerCount: number;
    /** Layers that were resolved. */
    resolvedLayers: string[];
}

// ── Pending change model (for preview) ─────────────────────────────

/** Type of pending change for a file. */
export type PendingAction = 'add' | 'update' | 'skip' | 'remove';

/** A pending change for preview display. */
export interface PendingChange {
    /** Relative path of the file. */
    relativePath: string;
    /** What action would be taken. */
    action: PendingAction;
    /** Reason for skip (e.g., "drifted"). */
    reason?: string;
    /** Classification. */
    classification: ArtifactClassification;
    /** Source layer. */
    sourceLayer: string;
    /** Source repo. */
    sourceRepo?: string;
    /** Original relative source path when different from the projected output path. */
    sourceRelativePath?: string;
    /** Target and support metadata for this pending output. */
    projection: ProjectionMetadata;
}
