/**
 * MetaFlow configuration schema interfaces.
 *
 * These types model the `.metaflow/config.jsonc` configuration file defined by
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
    /** Optional runtime layer discovery settings. */
    discover?: RepoDiscoveryConfig;
    /** Public authored capability entries for this repository. */
    capabilities?: CapabilitySource[];
    /** Repo-scoped injection mode defaults (overrides top-level). */
    injection?: InjectionConfig;
}

/** Runtime layer discovery settings for a metadata repository. */
export interface RepoDiscoveryConfig {
    /** Whether discovery is enabled for this repo (default: false). */
    enabled?: boolean;
    /** Glob patterns to exclude from discovered layer paths. */
    exclude?: string[];
}

// ── Layer configuration ────────────────────────────────────────────

/**
 * Artifact-type bucket that can be toggled per layer source.
 * Distinct from the full `ArtifactType` (which includes `'other'`) defined in
 * the engine utility; `'other'` cannot be explicitly excluded.
 */
export type ExcludableArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills';

/** A public capability entry grouped under a metadata repository. */
export interface CapabilitySource {
    /** Path within the repo (e.g., `company/core`). */
    path: string;
    /** Whether this capability is enabled (default: true). */
    enabled?: boolean;
    /** Artifact-type directories to exclude for this capability. */
    excludedTypes?: ExcludableArtifactType[];
    /** Capability-scoped injection mode overrides (overrides repo and top-level). */
    injection?: InjectionConfig;
}

/** A layer source entry for multi-repo configurations. */
export interface LayerSource {
    /** References a repo `id` from `metadataRepos`. */
    repoId: string;
    /** Path within the repo (e.g., `company/core`). */
    path: string;
    /** Whether this layer is enabled (default: true). */
    enabled?: boolean;
    /**
     * Artifact-type directories to exclude for this layer source.
     * UI-managed; distinct from `filters.exclude` (which is hand-authored).
     * Absent or empty → all types are included (default behaviour unchanged).
     */
    excludedTypes?: ExcludableArtifactType[];
    /** Layer-scoped injection mode overrides (flattened from capability injection during normalization). */
    injection?: InjectionConfig;
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
    /** Optional user-facing display name shown in UI surfaces. */
    displayName?: string;
    /** Glob patterns for files to enable. */
    enable?: string[];
    /** Glob patterns for files to disable (wins over enable). */
    disable?: string[];
    /** Optional per-layer overrides applied while this profile is active. */
    layerOverrides?: ProfileLayerOverride[];
}

/** Profile-local override for a specific repo/layer identity. */
export interface ProfileLayerOverride {
    /** Repo `id` from `metadataRepos`. */
    repoId: string;
    /** Layer path within the repo. */
    path: string;
    /** Whether this layer is enabled while the profile is active. */
    enabled?: boolean;
    /** Profile-local artifact exclusions for this layer. Empty array means none excluded. */
    excludedTypes?: ExcludableArtifactType[];
}

// ── Injection modes ────────────────────────────────────────────────

/** Per-artifact-type injection mode. */
export type InjectionMode = 'settings' | 'synchronize';

/** Target VS Code configuration scope for settings-backed injection. */
export type SettingsInjectionTarget = 'user' | 'workspace' | 'workspaceFolder';

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
 * The full `.metaflow/config.jsonc` configuration.
 *
 * Public v1 authoring is `metadataRepos[*].capabilities`.
 * Pre-release compatibility also accepts legacy single-repo
 * (`metadataRepo` + `layers`) and legacy multi-repo (`layerSources`) shapes.
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
    /**
     * Legacy/internal ordered layer sources referencing repos by id.
     * Maintained for compatibility and runtime normalization.
     */
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
    /** Repository default VS Code scope for settings-backed injection. */
    settingsInjectionTarget?: SettingsInjectionTarget;
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
    | {
          ok: true;
          config: MetaFlowConfig;
          configPath: string;
          migrated?: boolean;
          migrationMessages?: string[];
      }
    | { ok: false; errors: ConfigError[]; configPath?: string };
