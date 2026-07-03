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
    /** Instruction metadata loaded from canonical MetaFlow instruction manifests. */
    instructions?: ContentMetadata[];
    /** Prompt metadata loaded from canonical MetaFlow prompt manifests. */
    prompts?: ContentMetadata[];
    /** Skills loaded from canonical MetaFlow skill manifests. */
    skills?: SkillMetadata[];
    /** Codex project configurations loaded from canonical MetaFlow project-config manifests. */
    codexProjectConfigs?: CodexProjectConfigMetadata[];
    /** Target adapter preferences loaded from canonical MetaFlow target manifests. */
    targetAdapters?: TargetAdapterMetadata[];
    /** Package manifests loaded from canonical MetaFlow package manifests. */
    packageManifests?: PackageManifestMetadata[];
    /** Tool manifests loaded from canonical MetaFlow tool manifests. */
    tools?: ToolMetadata[];
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
    /** Capability-level support posture for this target. */
    support?: TargetCapabilitySupportStatus;
    /** Policy grants required before this target claim is operational. */
    requiredPolicyGrants: string[];
    /** Evidence references supporting this target claim. */
    validationEvidence: string[];
    /** Support, lossiness, or operational notes for this target claim. */
    notes: string[];
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
    | 'longRunningVm'
    | 'issuePrNative'
    | 'alwaysOnWorkflow'
    | 'githubAction'
    | 'appServer'
    | 'sdkEmbedded';

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

/** Evidence boundary declared by a canonical evaluation profile. */
export type EvaluationEvidenceKind = 'staticProjection' | 'harnessRuntime';

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
    /** Whether this profile validates static projection correctness or harness runtime behavior. */
    evidenceKind?: EvaluationEvidenceKind;
    /** Human-readable harness or surface tested, such as Codex CLI. */
    harness?: string;
    /** Adapter version or contract used during validation. */
    adapterVersion?: string;
    /** Scenario validated by the evaluation profile. */
    scenario?: string;
    /** Optional command or procedure used to validate the scenario. */
    validationCommand?: string;
    /** Evidence identifiers, paths, or external references. */
    evidence?: string[];
    /** Known limitations observed or expected during validation. */
    limitations?: string[];
    /** Policy grants required before this evaluation is used. */
    policyGrants: string[];
    /** Target harnesses or adapters this evaluation profile applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Markdown-first content metadata type. */
export type ContentType = 'instruction' | 'prompt';

/** Risk posture declared by canonical content metadata. */
export type ContentRisk = 'standard' | 'governed' | 'experimental';

/** Canonical MetaFlow instruction or prompt metadata associated with a layer. */
export interface ContentMetadata {
    /** Stable content identifier. */
    id: string;
    /** Absolute path to the manifest that supplied content metadata. */
    manifestPath: string;
    /** Absolute path to the containing canonical content directory. */
    contentDirectory: string;
    /** Content family described by this manifest. */
    contentType: ContentType;
    /** Markdown entrypoint rendered for target adapters. */
    entrypoint: string;
    /** Optional user-facing content name. */
    name?: string;
    /** Optional routing, workflow, or topic tags. */
    appliesTo: string[];
    /** Optional content risk posture. */
    risk?: ContentRisk;
    /** Target harnesses or adapters this content applies to. */
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

/** Risk posture declared by a canonical skill manifest. */
export type SkillRisk = 'standard' | 'governed' | 'experimental';

/** Canonical MetaFlow skill metadata associated with a layer. */
export interface SkillMetadata {
    /** Stable skill identifier. */
    id: string;
    /** Absolute path to the manifest that supplied skill metadata. */
    manifestPath: string;
    /** Absolute path to the skill directory containing skill.json and SKILL.md. */
    skillDirectory: string;
    /** Optional user-facing skill name. */
    name?: string;
    /** Markdown entrypoint for target skill projection. */
    entrypoint: string;
    /** Optional authoring or routing tags. */
    appliesTo: string[];
    /** Optional risk posture for review and packaging. */
    risk?: SkillRisk;
    /** Target harnesses or adapters this skill applies to. */
    targets: string[];
    /** Optional user-facing description. */
    description?: string;
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

/** Canonical MetaFlow package metadata associated with a layer. */
export interface PackageManifestMetadata {
    /** Stable package manifest identifier. */
    id: string;
    /** Absolute path to the manifest that supplied package metadata. */
    manifestPath: string;
    /** User-facing package name. */
    name: string;
    /** Package kind such as agent-plugin. */
    kind: string;
    /** Canonical agent profile ids included in this package. */
    agents: string[];
    /** Canonical skill ids included in this package. */
    skills: string[];
    /** Canonical instruction ids included in this package. */
    instructions: string[];
    /** Canonical prompt ids included in this package. */
    prompts: string[];
    /** Canonical MCP server ids included in this package. */
    mcpServers: string[];
    /** Canonical tool ids included in this package. */
    tools: string[];
    /** Canonical hook ids included in this package. */
    hooks: string[];
    /** Policy grants required before this package is treated as operational. */
    policyGrants: string[];
    /** Target harness package declarations keyed by target id. */
    targets: Record<string, { pluginName?: string; enabled?: boolean }>;
    /** Optional target marketplace/catalog display entries. */
    marketplaceEntries: PackageMarketplaceEntryMetadata[];
    /** Optional validation evidence identifiers or references. */
    validationEvidence: string[];
    /** Optional structured runtime validation records for target harness claims. */
    runtimeValidation: PackageRuntimeValidationMetadata[];
    /** Optional user-facing description. */
    description?: string;
    /** Warnings emitted while parsing/validating this manifest. */
    warnings: CapabilityWarning[];
}

/** Canonical package marketplace/catalog display intent. */
export interface PackageMarketplaceEntryMetadata {
    /** Target marketplace or catalog family, such as codex or github-copilot. */
    target: string;
    /** Optional target-specific marketplace package name. */
    packageName?: string;
    /** Optional user-facing title for marketplace displays. */
    title?: string;
    /** Optional short summary for marketplace displays. */
    summary?: string;
    /** Optional publisher or owner label for marketplace displays. */
    publisher?: string;
    /** Optional marketplace category labels. */
    categories: string[];
    /** Optional marketplace keyword labels. */
    keywords: string[];
    /** Optional documentation, homepage, or repository URL. */
    url?: string;
}

/** Structured runtime validation evidence for a package target claim. */
export interface PackageRuntimeValidationMetadata {
    /** Target harness family validated by this record. */
    target: string;
    /** Target capability matrix concepts validated or bounded by this record. */
    concepts?: TargetCapabilityConcept[];
    /** Human-readable harness or surface tested, such as Codex CLI. */
    harness: string;
    /** Adapter version or contract used during validation. */
    adapterVersion: string;
    /** Scenario validated by the evidence. */
    scenario: string;
    /** Validation status for the scenario. */
    status: 'passed' | 'partial' | 'failed' | 'not-run';
    /** Optional command or procedure used to validate the scenario. */
    command?: string;
    /** Evidence identifiers, paths, or external references. */
    evidence: string[];
    /** Known limitations observed during validation. */
    limitations: string[];
}

/** Invocation family declared by a canonical tool manifest. */
export type ToolKind = 'command' | 'mcp' | 'http' | 'manual';

/** Canonical MetaFlow tool metadata associated with a layer. */
export interface ToolMetadata {
    /** Stable tool identifier. */
    id: string;
    /** Absolute path to the manifest that supplied tool metadata. */
    manifestPath: string;
    /** Harness-neutral tool family. */
    kind: ToolKind;
    /** Optional local command for command-backed tools. */
    command?: string;
    /** Optional command arguments. */
    args: string[];
    /** Optional MCP server id used by MCP-backed tools. */
    mcpServer?: string;
    /** Optional MCP tool name exposed by the MCP server. */
    mcpTool?: string;
    /** Optional HTTP endpoint reference for HTTP-backed tools. */
    endpoint?: string;
    /** Policy grants required before this tool is treated as operational. */
    policyGrants: string[];
    /** Target harnesses or adapters this tool applies to. */
    targets: string[];
    /** Execution profiles this tool can run under. */
    executionProfiles: string[];
    /** Optional JSON-schema-like input schema for adapter reporting. */
    inputSchema?: Record<string, unknown>;
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
    | 'prompts'
    | 'skills'
    | 'agents'
    | 'projectConfig'
    | 'commandRules'
    | 'worktreeInclude'
    | 'mcpServers'
    | 'tools'
    | 'hooks'
    | 'packageManifests'
    | 'pluginRuntime'
    | 'agentRuntime'
    | 'automationRuntime'
    | 'authenticationRuntime'
    | 'permissionRuntime'
    | 'enterprisePolicyRuntime'
    | 'policyGrants'
    | 'executionSurfaces'
    | 'memoryScopes'
    | 'chronicleRuntime'
    | 'appshotsRuntime'
    | 'recordReplayRuntime'
    | 'importRuntime'
    | 'modelProviderRuntime'
    | 'windowsPlatformRuntime'
    | 'linuxPlatformRuntime'
    | 'macosPlatformRuntime'
    | 'cloudEnvironmentRuntime'
    | 'appConnectorRuntime'
    | 'localCloudHandoff'
    | 'issuePrOperation'
    | 'reviewRuntime'
    | 'remoteConnectionRuntime'
    | 'remoteMcpRuntime'
    | 'oauthMcpRuntime'
    | 'sideEffectMcpRuntime'
    | 'memoryRuntime'
    | 'browserRuntime'
    | 'chromeRuntime'
    | 'computerUseRuntime'
    | 'sitesRuntime'
    | 'evaluationSupport'
    | 'evaluationRuntime';

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
    /** Operator documentation path for interpreting this target support row. */
    documentation: string;
    /** Support, lossiness, or validation notes. */
    notes: string[];
    /** Authority, sandbox, or policy implications reported during preview. */
    authorityImplications: string[];
    /** Evidence identifiers supporting the current matrix row. */
    evidence: string[];
}

/** Runtime-only support reference summarized from target capability matrix rows. */
export interface TargetCapabilitySupportReference {
    /** Total runtime-only matrix rows in the selected scope. */
    runtimeOnlyCount: number;
    /** Per-target runtime-only counts and operator documentation paths. */
    targets: Array<{ target: string; runtimeOnlyCount: number; documentation: string }>;
}

/** Count of canonical metadata records considered by a target adapter report. */
export interface AdapterReadinessMetadataCounts {
    /** Canonical instruction manifests considered for adapter readiness. */
    instructions: number;
    /** Canonical prompt manifests considered for adapter readiness. */
    prompts: number;
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
    /** Canonical package manifests considered for adapter readiness. */
    packageManifests: number;
    /** Canonical tool manifests considered for adapter readiness. */
    tools: number;
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

/** Runtime-only target support boundary associated with an adapter report. */
export interface AdapterReadinessSupportBoundary {
    /** Canonical concept that remains runtime-only for this target. */
    concept: TargetCapabilityConcept;
    /** Human-readable boundary explanation. */
    message: string;
    /** Documentation path describing support boundaries for operators. */
    documentation: string;
    /** Evidence identifiers supporting the boundary classification. */
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
    /** Runtime-only target boundaries that require operator or harness evidence. */
    supportBoundaries: AdapterReadinessSupportBoundary[];
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
