import {
    CapabilitySource,
    HooksConfig,
    InjectionConfig,
    LayerSource,
    MetaFlowConfig,
    MetaFlowTargetsConfig,
    NamedMetadataRepo,
    ProfileConfig,
    ProfileLayerOverride,
    RepoDiscoveryConfig,
    SynchronizationConfig,
    SyncFileNamingStrategy,
} from './configSchema';
import { normalizeInputPath } from './configPathUtils';

export interface NormalizedConfigShape {
    config: MetaFlowConfig;
    authoredConfig: MetaFlowConfig;
    migrated: boolean;
    migrationMessages: string[];
}

export const CURRENT_CONFIG_COMPATIBILITY_VERSION = 5;
const IMPLICIT_RELEASED_CONFIG_COMPATIBILITY_VERSION = 1;

function cloneJson<T>(value: T): T {
    if (value === undefined) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

const INJECTION_KEY_ORDER: readonly (keyof InjectionConfig)[] = [
    'instructions',
    'prompts',
    'commands',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
];

function normalizeLayerPath(pathValue: string): string {
    const normalized = normalizeInputPath(pathValue).replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}

function compareLayerPaths(left: string, right: string): number {
    const leftDepth = left === '.' ? 0 : left.split('/').length;
    const rightDepth = right === '.' ? 0 : right.split('/').length;
    if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
    }

    return left.localeCompare(right);
}

function orderInjectionConfig(config: InjectionConfig | undefined): InjectionConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    const ordered: InjectionConfig = {};
    for (const key of INJECTION_KEY_ORDER) {
        const value = config[key];
        if (value !== undefined) {
            ordered[key] = value;
        }
    }

    return ordered;
}

function orderRepoDiscoveryConfig(
    config: RepoDiscoveryConfig | undefined,
): RepoDiscoveryConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    return {
        ...(config.enabled !== undefined ? { enabled: config.enabled } : {}),
        ...(config.exclude !== undefined ? { exclude: cloneJson(config.exclude) } : {}),
    };
}

function orderProfileLayerOverride(override: ProfileLayerOverride): ProfileLayerOverride {
    return {
        repoId: override.repoId,
        path: normalizeInputPath(override.path),
        ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
    };
}

function orderProfileConfig(config: ProfileConfig): ProfileConfig {
    return {
        ...(config.displayName !== undefined ? { displayName: config.displayName } : {}),
        ...(config.enabledCapabilities !== undefined
            ? { enabledCapabilities: normalizeCapabilityReferences(config.enabledCapabilities) }
            : {}),
    };
}

function orderProfiles(
    profiles: Record<string, ProfileConfig> | undefined,
): Record<string, ProfileConfig> | undefined {
    if (profiles === undefined) {
        return undefined;
    }

    const ordered: Record<string, ProfileConfig> = {};
    for (const profileId of Object.keys(profiles).sort()) {
        ordered[profileId] = orderProfileConfig(profiles[profileId]);
    }

    return ordered;
}

function orderHooksConfig(config: HooksConfig | undefined): HooksConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    return {
        ...(config.preApply !== undefined ? { preApply: config.preApply } : {}),
        ...(config.postApply !== undefined ? { postApply: config.postApply } : {}),
    };
}

function orderTargetsConfig(
    config: MetaFlowTargetsConfig | undefined,
): MetaFlowTargetsConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    return {
        ...(config.pi !== undefined
            ? {
                  pi: {
                      ...(config.pi.enabled !== undefined ? { enabled: config.pi.enabled } : {}),
                  },
              }
            : {}),
    };
}

/** Return true only for an explicitly enabled target persisted at the current contract version. */
export function isPiTargetEnabled(config: MetaFlowConfig): boolean {
    return (
        config.compatibilityVersion === CURRENT_CONFIG_COMPATIBILITY_VERSION &&
        config.targets?.pi?.enabled === true
    );
}

function orderSynchronizationConfig(
    config: SynchronizationConfig | undefined,
): SynchronizationConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    return {
        ...(config.repoWideCopilotInstructions !== undefined
            ? { repoWideCopilotInstructions: config.repoWideCopilotInstructions }
            : {}),
    };
}

function cloneCapabilitySource(source: CapabilitySource): CapabilitySource {
    return {
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.injection !== undefined
            ? { injection: orderInjectionConfig(source.injection) }
            : {}),
        ...(source.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: source.fileNamingStrategy }
            : {}),
    };
}

function cloneLayerSource(source: LayerSource): LayerSource {
    return {
        repoId: source.repoId,
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.injection !== undefined
            ? { injection: orderInjectionConfig(source.injection) }
            : {}),
        ...(source.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: source.fileNamingStrategy }
            : {}),
    };
}

function cloneNamedRepo(
    repo: NamedMetadataRepo,
    _legacyCapabilities?: CapabilitySource[],
): NamedMetadataRepo {
    return {
        id: repo.id,
        ...(repo.name !== undefined ? { name: repo.name } : {}),
        ...(repo.url !== undefined ? { url: repo.url } : {}),
        localPath: repo.localPath,
        ...(repo.commit !== undefined ? { commit: repo.commit } : {}),
        ...(repo.enabled === false ? { enabled: false } : {}),
        ...(repo.discover !== undefined
            ? { discover: orderRepoDiscoveryConfig(repo.discover) }
            : {}),
        ...(repo.injection !== undefined
            ? { injection: orderInjectionConfig(repo.injection) }
            : {}),
        ...(repo.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: repo.fileNamingStrategy }
            : {}),
    };
}

function layerSourceToCapabilitySource(source: LayerSource): CapabilitySource {
    return {
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.injection !== undefined ? { injection: cloneJson(source.injection) } : {}),
        ...(source.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: source.fileNamingStrategy }
            : {}),
    };
}

function capabilitySourceToLayerSource(repoId: string, source: CapabilitySource): LayerSource {
    return {
        repoId,
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.injection !== undefined ? { injection: cloneJson(source.injection) } : {}),
        ...(source.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: source.fileNamingStrategy }
            : {}),
    };
}

function mergeCapabilitySource(
    capability: CapabilitySource,
    fallback?: LayerSource,
): CapabilitySource {
    if (!fallback) {
        return cloneCapabilitySource(capability);
    }

    return {
        path: normalizeLayerPath(fallback.path),
        ...(fallback.enabled !== undefined
            ? { enabled: fallback.enabled }
            : capability.enabled !== undefined
              ? { enabled: capability.enabled }
              : {}),
        ...(fallback.injection !== undefined
            ? { injection: cloneJson(fallback.injection) }
            : capability.injection !== undefined
              ? { injection: cloneJson(capability.injection) }
              : {}),
        ...(fallback.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: fallback.fileNamingStrategy }
            : capability.fileNamingStrategy !== undefined
              ? { fileNamingStrategy: capability.fileNamingStrategy }
              : {}),
    };
}

function canonicalizeCapabilities(
    capabilities: CapabilitySource[] | undefined,
): CapabilitySource[] | undefined {
    if (capabilities === undefined) {
        return undefined;
    }

    return capabilities
        .map(cloneCapabilitySource)
        .sort((left, right) => compareLayerPaths(left.path, right.path));
}

function mergeLayerSource(base: LayerSource, override: LayerSource): LayerSource {
    return {
        repoId: base.repoId,
        path: override.path,
        ...(override.enabled !== undefined
            ? { enabled: override.enabled }
            : base.enabled !== undefined
              ? { enabled: base.enabled }
              : {}),
        ...(override.injection !== undefined
            ? { injection: cloneJson(override.injection) }
            : base.injection !== undefined
              ? { injection: cloneJson(base.injection) }
              : {}),
        ...(override.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: override.fileNamingStrategy }
            : base.fileNamingStrategy !== undefined
              ? { fileNamingStrategy: base.fileNamingStrategy }
              : {}),
    };
}

function canonicalizeLayerSources(
    layerSources: LayerSource[] | undefined,
    authoredRepoIds: readonly string[],
): LayerSource[] | undefined {
    if (layerSources === undefined) {
        return undefined;
    }

    const merged = new Map<string, LayerSource>();
    for (const source of layerSources) {
        const canonical = cloneLayerSource(source);
        const key = `${canonical.repoId}\u0000${canonical.path}`;
        const existing = merged.get(key);
        merged.set(key, existing ? mergeLayerSource(existing, canonical) : canonical);
    }

    const repoOrder = new Map(authoredRepoIds.map((repoId, index) => [repoId, index]));
    return Array.from(merged.values()).sort((left, right) => {
        const leftRank = repoOrder.get(left.repoId);
        const rightRank = repoOrder.get(right.repoId);
        if (leftRank !== undefined || rightRank !== undefined) {
            if (leftRank === undefined) {
                return 1;
            }
            if (rightRank === undefined) {
                return -1;
            }
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
        } else if (left.repoId !== right.repoId) {
            return left.repoId.localeCompare(right.repoId);
        }

        return compareLayerPaths(left.path, right.path);
    });
}

function canonicalizeLegacyLayers(layers: string[] | undefined): string[] | undefined {
    if (layers === undefined) {
        return undefined;
    }

    const unique = new Map<string, string>();
    for (const layer of layers) {
        const normalized = normalizeLayerPath(layer);
        if (!unique.has(normalized)) {
            unique.set(normalized, normalized);
        }
    }

    return Array.from(unique.values()).sort(compareLayerPaths);
}

function capabilityReference(repoId: string, layerPath: string): string {
    return `${repoId}:${normalizeLayerPath(layerPath)}`;
}

function normalizeCapabilityReferences(references: string[]): string[] {
    const unique = new Set<string>();
    for (const reference of references) {
        if (typeof reference !== 'string') {
            continue;
        }

        const separator = reference.indexOf(':');
        if (separator <= 0) {
            continue;
        }

        const repoId = reference.slice(0, separator).trim();
        const layerPath = reference.slice(separator + 1).trim();
        if (repoId && layerPath) {
            unique.add(capabilityReference(repoId, layerPath));
        }
    }

    return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function allLegacyLayerSources(config: MetaFlowConfig): LayerSource[] {
    const sources = (config.layerSources ?? []).map(cloneLayerSource);
    const seen = new Set(sources.map((source) => capabilityReference(source.repoId, source.path)));

    for (const repo of config.metadataRepos ?? []) {
        for (const capability of repo.capabilities ?? []) {
            const reference = capabilityReference(repo.id, capability.path);
            if (!seen.has(reference)) {
                sources.push({
                    repoId: repo.id,
                    path: normalizeLayerPath(capability.path),
                    ...(capability.enabled !== undefined ? { enabled: capability.enabled } : {}),
                    ...(capability.injection !== undefined
                        ? { injection: cloneJson(capability.injection) }
                        : {}),
                    ...(capability.fileNamingStrategy !== undefined
                        ? { fileNamingStrategy: capability.fileNamingStrategy }
                        : {}),
                });
                seen.add(reference);
            }
        }
    }

    if (config.metadataRepo && config.layers) {
        for (const layerPath of config.layers) {
            const reference = capabilityReference('primary', layerPath);
            if (!seen.has(reference)) {
                sources.push({ repoId: 'primary', path: normalizeLayerPath(layerPath) });
                seen.add(reference);
            }
        }
    }

    const repoById = new Map((config.metadataRepos ?? []).map((repo) => [repo.id, repo]));
    return sources.map((source) => {
        const repo = repoById.get(source.repoId);
        const mergedInjection =
            repo?.injection || source.injection
                ? {
                      ...(repo?.injection ?? {}),
                      ...(source.injection ?? {}),
                  }
                : undefined;
        return {
            ...source,
            ...(mergedInjection !== undefined ? { injection: mergedInjection } : {}),
            ...(source.fileNamingStrategy !== undefined || repo?.fileNamingStrategy !== undefined
                ? { fileNamingStrategy: source.fileNamingStrategy ?? repo?.fileNamingStrategy }
                : {}),
        };
    });
}

function legacyBaseReferences(config: MetaFlowConfig, sources: LayerSource[]): string[] {
    const disabledRepoIds = new Set(
        (config.metadataRepos ?? [])
            .filter((repo) => repo.enabled === false)
            .map((repo) => repo.id),
    );

    return normalizeCapabilityReferences(
        sources
            .filter((source) => source.enabled !== false && !disabledRepoIds.has(source.repoId))
            .map((source) => capabilityReference(source.repoId, source.path)),
    );
}

function buildCanonicalProfiles(
    config: MetaFlowConfig,
    sources: LayerSource[],
): Record<string, ProfileConfig> {
    const baseReferences = legacyBaseReferences(config, sources);
    const inputProfiles = config.profiles;
    if (!inputProfiles || Object.keys(inputProfiles).length === 0) {
        return { default: { enabledCapabilities: baseReferences } };
    }

    const profiles: Record<string, ProfileConfig> = {};
    for (const [profileId, profile] of Object.entries(inputProfiles)) {
        let selected = profile.enabledCapabilities;
        if (selected === undefined) {
            selected = profile.enable?.length === 0 ? [] : [...baseReferences];
            const overrides = new Map(
                (profile.layerOverrides ?? []).map((override) => [
                    capabilityReference(override.repoId, override.path),
                    override.enabled,
                ]),
            );
            selected = selected.filter((reference) => overrides.get(reference) !== false);
            for (const [reference, enabled] of overrides) {
                if (enabled === true && !selected.includes(reference)) {
                    selected.push(reference);
                }
            }
        }

        profiles[profileId] = {
            ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
            enabledCapabilities: normalizeCapabilityReferences(selected),
        };
    }

    return profiles;
}

function buildCapabilityOverrides(
    config: MetaFlowConfig,
    sources: LayerSource[],
): Record<string, NonNullable<MetaFlowConfig['capabilityOverrides']>[string]> | undefined {
    const overrides: NonNullable<MetaFlowConfig['capabilityOverrides']> = cloneJson(
        config.capabilityOverrides ?? {},
    );
    const repoById = new Map((config.metadataRepos ?? []).map((repo) => [repo.id, repo]));
    for (const source of sources) {
        const reference = capabilityReference(source.repoId, source.path);
        const repo = repoById.get(source.repoId);
        const repoInjection = repo?.injection;
        const injection = source.injection
            ? Object.fromEntries(
                  Object.entries(source.injection).filter(
                      ([artifactType, mode]) =>
                          repoInjection?.[artifactType as keyof typeof repoInjection] !== mode,
                  ),
              )
            : undefined;
        const override = {
            ...(injection !== undefined && Object.keys(injection).length > 0
                ? { injection: orderInjectionConfig(injection) }
                : {}),
            ...(source.fileNamingStrategy !== undefined &&
            source.fileNamingStrategy !== repo?.fileNamingStrategy
                ? { fileNamingStrategy: source.fileNamingStrategy }
                : {}),
        };
        if (Object.keys(override).length > 0) {
            overrides[reference] = {
                ...(overrides[reference] ?? {}),
                ...override,
            };
        }
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function resolveCompatibilityVersion(config: MetaFlowConfig): {
    compatibilityVersion: number;
    migrationMessage?: string;
} {
    if (config.compatibilityVersion === undefined) {
        return {
            compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
            migrationMessage: `Migrated released config compatibilityVersion from implicit v${IMPLICIT_RELEASED_CONFIG_COMPATIBILITY_VERSION} to v${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
        };
    }

    if (config.compatibilityVersion < CURRENT_CONFIG_COMPATIBILITY_VERSION) {
        return {
            compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
            migrationMessage: `Migrated config compatibilityVersion from v${config.compatibilityVersion} to v${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
        };
    }

    return {
        compatibilityVersion: config.compatibilityVersion,
    };
}

export function canonicalizeAuthoredConfig(config: MetaFlowConfig): MetaFlowConfig {
    const canonical: MetaFlowConfig = { ...config };

    if (config.metadataRepos !== undefined) {
        canonical.metadataRepos = config.metadataRepos.map((repo) =>
            cloneNamedRepo(repo, canonicalizeCapabilities(repo.capabilities) ?? []),
        );
    }

    if (config.layerSources !== undefined) {
        canonical.layerSources = canonicalizeLayerSources(
            config.layerSources,
            config.metadataRepos?.map((repo) => repo.id) ?? [],
        );
    }

    if (config.layers !== undefined) {
        canonical.layers = canonicalizeLegacyLayers(config.layers);
    }

    if (config.targets !== undefined) {
        canonical.targets = orderTargetsConfig(config.targets);
    }

    return canonical;
}

function buildRestOfConfig(
    config: MetaFlowConfig,
    profiles: Record<string, ProfileConfig>,
): Omit<MetaFlowConfig, 'metadataRepo' | 'layers' | 'metadataRepos' | 'layerSources'> {
    const fileNamingStrategy = config.fileNamingStrategy as SyncFileNamingStrategy | undefined;
    const compatibility = resolveCompatibilityVersion(config);

    return {
        compatibilityVersion: compatibility.compatibilityVersion,
        profiles: orderProfiles(profiles) ?? {},
        ...(config.activeProfile !== undefined ? { activeProfile: config.activeProfile } : {}),
        ...(config.targets !== undefined ? { targets: orderTargetsConfig(config.targets) } : {}),
        ...(config.capabilityOverrides !== undefined
            ? { capabilityOverrides: cloneJson(config.capabilityOverrides) }
            : {}),
        ...(config.injection !== undefined
            ? { injection: orderInjectionConfig(config.injection) }
            : {}),
        ...(fileNamingStrategy !== undefined ? { fileNamingStrategy } : {}),
        ...(config.settingsInjectionTarget !== undefined
            ? { settingsInjectionTarget: config.settingsInjectionTarget }
            : {}),
        ...(config.hooks !== undefined ? { hooks: orderHooksConfig(config.hooks) } : {}),
        synchronization: orderSynchronizationConfig(
            config.synchronization ?? { repoWideCopilotInstructions: false },
        ),
    };
}

function buildCapabilitiesForRepo(
    repo: NamedMetadataRepo,
    layerSourcesByRepoId: Map<string, LayerSource[]>,
): CapabilitySource[] {
    const capabilities: CapabilitySource[] = [];
    const indexByPath = new Map<string, number>();

    for (const capability of repo.capabilities ?? []) {
        const cloned = cloneCapabilitySource(capability);
        indexByPath.set(cloned.path, capabilities.push(cloned) - 1);
    }

    for (const source of layerSourcesByRepoId.get(repo.id) ?? []) {
        const normalizedPath = normalizeInputPath(source.path);
        const existingIndex = indexByPath.get(normalizedPath);
        if (existingIndex === undefined) {
            indexByPath.set(
                normalizedPath,
                capabilities.push(layerSourceToCapabilitySource(source)) - 1,
            );
            continue;
        }

        capabilities[existingIndex] = mergeCapabilitySource(capabilities[existingIndex], source);
    }

    return capabilities;
}

function flattenCapabilities(repos: NamedMetadataRepo[] | undefined): LayerSource[] | undefined {
    if (!repos) {
        return undefined;
    }

    const sources: LayerSource[] = [];
    for (const repo of repos) {
        for (const capability of repo.capabilities ?? []) {
            const layer = capabilitySourceToLayerSource(repo.id, capability);
            // Resolve injection hierarchy: capability > repo (sparse merge)
            if (repo.injection || capability.injection) {
                layer.injection = orderInjectionConfig({
                    ...(repo.injection ?? {}),
                    ...(capability.injection ?? {}),
                });
            }
            if (
                capability.fileNamingStrategy !== undefined ||
                repo.fileNamingStrategy !== undefined
            ) {
                layer.fileNamingStrategy = capability.fileNamingStrategy ?? repo.fileNamingStrategy;
            }
            sources.push(layer);
        }
    }

    return sources;
}

export function toAuthoredConfig(config: MetaFlowConfig): MetaFlowConfig {
    const sources = allLegacyLayerSources(config);
    const profiles = buildCanonicalProfiles(config, sources);
    const rest = buildRestOfConfig(
        {
            ...config,
            capabilityOverrides: buildCapabilityOverrides(config, sources),
        },
        profiles,
    );

    if (config.metadataRepos && config.metadataRepos.length > 0) {
        return canonicalizeAuthoredConfig({
            metadataRepos: config.metadataRepos.map((repo) => cloneNamedRepo(repo)),
            ...rest,
        });
    }

    if (config.metadataRepo) {
        const primaryRepo: NamedMetadataRepo = {
            id: 'primary',
            ...(config.metadataRepo.name !== undefined ? { name: config.metadataRepo.name } : {}),
            ...(config.metadataRepo.url !== undefined ? { url: config.metadataRepo.url } : {}),
            localPath: config.metadataRepo.localPath,
            ...(config.metadataRepo.commit !== undefined
                ? { commit: config.metadataRepo.commit }
                : {}),
        };

        return canonicalizeAuthoredConfig({
            metadataRepos: [primaryRepo],
            profiles,
            ...rest,
        });
    }

    return canonicalizeAuthoredConfig({
        ...rest,
    });
}

export function normalizeConfigShape(config: MetaFlowConfig): NormalizedConfigShape {
    const authoredConfig = toAuthoredConfig(config);
    const hasLegacyFilters = Object.prototype.hasOwnProperty.call(config, 'filters');
    const catalogSources = allLegacyLayerSources(config);
    const sourceByReference = new Map(
        catalogSources.map((source) => [capabilityReference(source.repoId, source.path), source]),
    );
    for (const profile of Object.values(authoredConfig.profiles ?? {})) {
        for (const reference of profile.enabledCapabilities ?? []) {
            if (sourceByReference.has(reference)) {
                continue;
            }

            const separator = reference.indexOf(':');
            if (separator <= 0) {
                continue;
            }

            const source: LayerSource = {
                repoId: reference.slice(0, separator),
                path: normalizeLayerPath(reference.slice(separator + 1)),
            };
            catalogSources.push(source);
            sourceByReference.set(reference, source);
        }
    }

    const activeProfileId =
        config.activeProfile ?? (authoredConfig.profiles?.default ? 'default' : undefined);
    const activeProfile = activeProfileId ? authoredConfig.profiles?.[activeProfileId] : undefined;
    const activeSelection = new Set(
        activeProfile?.enabledCapabilities ?? legacyBaseReferences(config, catalogSources),
    );
    const runtimeLayerSources = catalogSources.map((source) => {
        const reference = capabilityReference(source.repoId, source.path);
        const override = authoredConfig.capabilityOverrides?.[reference];
        return {
            ...cloneLayerSource(source),
            ...(override?.injection !== undefined
                ? {
                      injection: orderInjectionConfig({
                          ...(source.injection ?? {}),
                          ...cloneJson(override.injection),
                      }),
                  }
                : {}),
            ...(override?.fileNamingStrategy !== undefined
                ? { fileNamingStrategy: override.fileNamingStrategy }
                : {}),
            enabled: activeSelection.has(reference),
        };
    });
    const runtimeConfig: MetaFlowConfig = {
        ...cloneJson(authoredConfig),
        layerSources: runtimeLayerSources,
    };

    const migrationMessages: string[] = [];
    const compatibility = resolveCompatibilityVersion(config);
    if (compatibility.migrationMessage) {
        migrationMessages.push(compatibility.migrationMessage);
    }
    if (
        config.metadataRepo !== undefined ||
        config.layers !== undefined ||
        ((config.compatibilityVersion ?? 0) < CURRENT_CONFIG_COMPATIBILITY_VERSION &&
            config.layerSources !== undefined) ||
        (config.metadataRepos ?? []).some((repo) => repo.capabilities !== undefined)
    ) {
        migrationMessages.push(
            'Migrated legacy capability entries to profile enabledCapabilities selections.',
        );
    }
    if (
        config.profiles &&
        Object.values(config.profiles).some(
            (profile) =>
                profile.enable !== undefined ||
                profile.disable !== undefined ||
                profile.layerOverrides !== undefined,
        )
    ) {
        migrationMessages.push(
            'Migrated legacy profile activation fields to complete enabledCapabilities selections.',
        );
    }
    if (hasLegacyFilters) {
        migrationMessages.push(
            'Removed unsupported top-level filters; capability selection is controlled by profiles.',
        );
    }

    return {
        config: runtimeConfig,
        authoredConfig,
        migrated: migrationMessages.length > 0,
        migrationMessages,
    };
}
