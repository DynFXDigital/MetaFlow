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
export interface CapabilityWarning {
    /** Stable warning code for testability and diagnostics routing. */
    code: string;
    /** Human-readable warning message. */
    message: string;
    /** Optional file path associated with the warning. */
    filePath?: string;
}

/** Parsed CAPABILITY.md metadata associated with a layer. */
export interface CapabilityMetadata {
    /** Internal capability identifier (derived from folder name). */
    id: string;
    /** Absolute path to CAPABILITY.md. */
    manifestPath: string;
    /** User-facing capability name. */
    name?: string;
    /** User-facing capability description. */
    description?: string;
    /** Optional SPDX identifier/expression or fallback token. */
    license?: string;
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

/** Classification of an artifact: settings-injected or Synchronized. */
export type ArtifactClassification = 'settings' | 'synchronized';

/** An effective file after overlay resolution. */
export interface EffectiveFile {
    /** Relative path in the output (e.g., `instructions/coding.md`). */
    relativePath: string;
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
