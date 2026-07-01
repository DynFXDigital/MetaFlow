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
    /** Optional capability metadata loaded from CAPABILITY.md at layer root. */
    capability?: CapabilityMetadata;
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

/** Parsed CAPABILITY.md metadata associated with a layer. */
export interface CapabilityMetadata {
    /** Internal capability identifier (currently derived from folder name). */
    id: string;
    /** Immutable generated capability identity used to survive path/id reorganizations. */
    uid?: string;
    /** Historical human-readable ids that can be used for migration/reconciliation. */
    previousIds?: string[];
    /** Historical repo-relative paths that can be used for migration/reconciliation. */
    previousPaths?: string[];
    /** Absolute path to CAPABILITY.md. */
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
}
