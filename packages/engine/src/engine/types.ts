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

/** Local process invocation declared by a canonical MCP server manifest. */
export interface McpServerInvocation {
    /** Executable command or package runner. */
    command: string;
    /** Optional command arguments. */
    args: string[];
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
    /** Capability category exposed by the server. */
    capabilityCategory?: string;
    /** Policy grants required before the server is used. */
    policyGrants: string[];
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
}

/** Canonical concept covered by a target adapter capability matrix. */
export type TargetCapabilityConcept =
    | 'instructions'
    | 'skills'
    | 'agents'
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
