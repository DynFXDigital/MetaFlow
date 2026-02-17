/**
 * MetaFlow configuration schema interfaces.
 *
 * These types model the `.metaflow.json` configuration file defined by
 * the MetaFlow Reference Architecture.
 *
 * Pure TypeScript — no VS Code imports.
 */

// ── Metadata repository configuration ──────────────────────────────

/** A single metadata repository reference. */
export interface MetadataRepo {
    /** Optional display name for this metadata source (used in UI). */
    name?: string;
    /** Git remote URL (informational; clone expected to exist). */
    url?: string;
    /** Local path to the repo clone (absolute or relative to workspace). */
    localPath: string;
    /** Pinned commit SHA for determinism. */
    commit?: string;
}

/** A named metadata repository used in multi-repo configs. */
export interface NamedMetadataRepo extends MetadataRepo {
    /** Unique identifier for this repo. */
    id: string;
    /** Whether this repo source is enabled (default: true). */
    enabled?: boolean;
}

// ── Layer configuration ────────────────────────────────────────────

/** A layer source entry for multi-repo configurations. */
export interface LayerSource {
    /** References a repo `id` from `metadataRepos`. */
    repoId: string;
    /** Path within the repo (e.g., `company/core`). */
    path: string;
    /** Whether this layer is enabled (default: true). */
    enabled?: boolean;
}

// ── Filters ────────────────────────────────────────────────────────

/** Path-based include/exclude filter configuration. */
export interface FilterConfig {
    /** Glob patterns for files to include. */
    include?: string[];
    /** Glob patterns for files to exclude (wins over include). */
    exclude?: string[];
}

// ── Profiles ───────────────────────────────────────────────────────

/** A named activation profile controlling which files are active. */
export interface ProfileConfig {
    /** Glob patterns for files to enable. */
    enable?: string[];
    /** Glob patterns for files to disable (wins over enable). */
    disable?: string[];
}

// ── Injection modes ────────────────────────────────────────────────

/** Per-artifact-type injection mode. */
export type InjectionMode = 'settings' | 'materialize';

/** Injection configuration for each artifact type. */
export interface InjectionConfig {
    instructions?: InjectionMode;
    prompts?: InjectionMode;
    skills?: InjectionMode;
    agents?: InjectionMode;
    hooks?: InjectionMode;
    chatmodes?: InjectionMode;
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Hook file path configuration. */
export interface HooksConfig {
    preApply?: string;
    postApply?: string;
}

// ── Top-level config ───────────────────────────────────────────────

/**
 * The full `.metaflow.json` configuration.
 *
 * Supports both single-repo (`metadataRepo` + `layers`) and
 * multi-repo (`metadataRepos` + `layerSources`) modes.
 */
export interface MetaFlowConfig {
    // ── Single-repo mode ───────────────────────────────────────────
    /** Primary metadata repository (single-repo mode). */
    metadataRepo?: MetadataRepo;
    /** Ordered layer paths within the single repo (low → high specificity). */
    layers?: string[];

    // ── Multi-repo mode ────────────────────────────────────────────
    /** Named metadata repositories. */
    metadataRepos?: NamedMetadataRepo[];
    /** Ordered layer sources referencing repos by id. */
    layerSources?: LayerSource[];

    // ── Filtering & profiles ───────────────────────────────────────
    /** Path-based include/exclude filters. */
    filters?: FilterConfig;
    /** Named activation profiles. */
    profiles?: Record<string, ProfileConfig>;
    /** Currently active profile name. */
    activeProfile?: string;

    // ── Injection & hooks ──────────────────────────────────────────
    /** Per-artifact-type injection mode overrides. */
    injection?: InjectionConfig;
    /** Hook file paths. */
    hooks?: HooksConfig;
}

// ── Validation result ──────────────────────────────────────────────

/** A config validation error with optional location. */
export interface ConfigError {
    message: string;
    /** 0-based line in the config file (if available). */
    line?: number;
    /** 0-based column in the config file (if available). */
    column?: number;
}

/** Result of config loading: either a valid config or errors. */
export type ConfigLoadResult =
    | { ok: true; config: MetaFlowConfig; configPath: string }
    | { ok: false; errors: ConfigError[]; configPath?: string };