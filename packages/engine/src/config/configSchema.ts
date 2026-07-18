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
    /** @deprecated Repository activation is controlled by profile capability selections. */
    enabled?: boolean;
    /** Optional runtime layer discovery settings. */
    discover?: RepoDiscoveryConfig;
    /** @deprecated Legacy authored capability entries accepted only during migration. */
    capabilities?: CapabilitySource[];
    /** Repo-scoped injection mode defaults (overrides top-level). */
    injection?: InjectionConfig;
    /** Repo-scoped synchronized output naming defaults (overrides top-level). */
    fileNamingStrategy?: SyncFileNamingStrategy;
}

/** Runtime layer discovery settings for a metadata repository. */
export interface RepoDiscoveryConfig {
    /** Whether discovery is enabled for this repo (default: false). */
    enabled?: boolean;
    /** Glob patterns to exclude from discovered layer paths. */
    exclude?: string[];
}

// ── Layer configuration ────────────────────────────────────────────

/** A public capability entry grouped under a metadata repository. */
export interface CapabilitySource {
    /** Path within the repo (e.g., `company/core`). */
    path: string;
    /** @deprecated Capability activation is represented by profile membership. */
    enabled?: boolean;
    /** Capability-scoped injection mode overrides (overrides repo and top-level). */
    injection?: InjectionConfig;
    /** Capability-scoped synchronized output naming override (overrides repo and top-level). */
    fileNamingStrategy?: SyncFileNamingStrategy;
}

/** A layer source entry for multi-repo configurations. */
export interface LayerSource {
    /** References a repo `id` from `metadataRepos`. */
    repoId: string;
    /** Path within the repo (e.g., `company/core`). */
    path: string;
    /** Whether this layer is enabled (default: true). */
    enabled?: boolean;
    /** Layer-scoped injection mode overrides (flattened from capability injection during normalization). */
    injection?: InjectionConfig;
    /** Layer-scoped synchronized output naming override (flattened from capability/repo config during normalization). */
    fileNamingStrategy?: SyncFileNamingStrategy;
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
    /** Complete repo-qualified capability references selected by this profile. */
    enabledCapabilities?: string[];
    /** @deprecated Legacy file-pattern activation accepted only during migration. */
    enable?: string[];
    /** @deprecated Legacy file-pattern activation accepted only during migration. */
    disable?: string[];
    /** @deprecated Legacy per-layer activation accepted only during migration. */
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
}

// ── Injection modes ────────────────────────────────────────────────

/** Per-artifact-type injection mode. */
export type InjectionMode = 'settings' | 'synchronize' | 'plugin';

/** Target VS Code configuration scope for settings-backed injection. */
export type SettingsInjectionTarget = 'user' | 'workspace' | 'workspaceFolder';

/** Strategy for naming synchronized output files. */
export type SyncFileNamingStrategy = 'prefixed' | 'original-unless-conflict';

/** Injection configuration for each artifact type. */
export interface InjectionConfig {
    instructions?: InjectionMode;
    prompts?: InjectionMode;
    skills?: InjectionMode;
    agents?: InjectionMode;
    hooks?: InjectionMode;
    chatmodes?: InjectionMode;
}

/** Sparse capability-specific settings keyed by a repo-qualified capability reference. */
export interface CapabilityOverride {
    injection?: InjectionConfig;
    fileNamingStrategy?: SyncFileNamingStrategy;
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
 * Canonical authoring uses repository descriptors plus profile-owned
 * `enabledCapabilities` arrays. Pre-release compatibility also accepts legacy
 * single-repo (`metadataRepo` + `layers`) and repo-grouped capability objects.
 */
export interface MetaFlowConfig {
    /** Authored config compatibility version used for release-aware migration. */
    compatibilityVersion?: number;

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

    /** Sparse capability settings keyed by `repoId:path`; omitted when unused. */
    capabilityOverrides?: Record<string, CapabilityOverride>;

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
    /** Strategy for naming synchronized output files. */
    fileNamingStrategy?: SyncFileNamingStrategy;
    /** Repository default VS Code scope for settings-backed injection. */
    settingsInjectionTarget?: SettingsInjectionTarget;
    /** Hook file paths. */
    hooks?: HooksConfig;
}

// ── Validation result ──────────────────────────────────────────────

/** A config validation error with optional location. */
export interface ConfigError {
    message: string;
    /** Stable machine-readable diagnostic identifier. */
    code?: string;
    /** Diagnostic severity for downstream consumers. */
    severity?: 'error' | 'warning';
    /** 0-based line in the config file (if available). */
    line?: number;
    /** 0-based column in the config file (if available). */
    column?: number;
}

/** Result of config loading: a usable config may still have recoverable warnings. */
export type ConfigLoadResult =
    | {
          ok: true;
          config: MetaFlowConfig;
          configPath: string;
          warnings?: ConfigError[];
          migrated?: boolean;
          migrationMessages?: string[];
      }
    | { ok: false; errors: ConfigError[]; warnings?: ConfigError[]; configPath?: string };
