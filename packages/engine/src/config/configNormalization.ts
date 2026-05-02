import {
    CapabilitySource,
    ExcludableArtifactType,
    FilterConfig,
    HooksConfig,
    InjectionConfig,
    LayerSource,
    MetaFlowConfig,
    NamedMetadataRepo,
    ProfileConfig,
    ProfileLayerOverride,
    RepoDiscoveryConfig,
    SyncFileNamingStrategy,
} from './configSchema';
import { normalizeInputPath } from './configPathUtils';

export interface NormalizedConfigShape {
    config: MetaFlowConfig;
    authoredConfig: MetaFlowConfig;
    migrated: boolean;
    migrationMessages: string[];
}

export const CURRENT_CONFIG_COMPATIBILITY_VERSION = 2;
const IMPLICIT_RELEASED_CONFIG_COMPATIBILITY_VERSION = 1;

function cloneJson<T>(value: T): T {
    if (value === undefined) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

const EXCLUDED_TYPE_ORDER: readonly ExcludableArtifactType[] = [
    'instructions',
    'prompts',
    'agents',
    'skills',
];

const INJECTION_KEY_ORDER: readonly (keyof InjectionConfig)[] = [
    'instructions',
    'prompts',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
    'claude-rules',
    'claude-agents',
    'claude-skills',
    'claude-settings',
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

function sortExcludedTypes(
    excludedTypes: ExcludableArtifactType[] | undefined,
): ExcludableArtifactType[] | undefined {
    if (excludedTypes === undefined) {
        return undefined;
    }

    const rank = new Map(EXCLUDED_TYPE_ORDER.map((value, index) => [value, index]));
    return [...excludedTypes].sort(
        (left, right) =>
            (rank.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(right) ?? Number.MAX_SAFE_INTEGER),
    );
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

function orderFilterConfig(config: FilterConfig | undefined): FilterConfig | undefined {
    if (config === undefined) {
        return undefined;
    }

    return {
        ...(config.include !== undefined ? { include: cloneJson(config.include) } : {}),
        ...(config.exclude !== undefined ? { exclude: cloneJson(config.exclude) } : {}),
    };
}

function orderProfileLayerOverride(override: ProfileLayerOverride): ProfileLayerOverride {
    return {
        repoId: override.repoId,
        path: normalizeInputPath(override.path),
        ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
        ...(override.excludedTypes !== undefined
            ? { excludedTypes: sortExcludedTypes(override.excludedTypes) }
            : {}),
    };
}

function orderProfileConfig(config: ProfileConfig): ProfileConfig {
    return {
        ...(config.displayName !== undefined ? { displayName: config.displayName } : {}),
        ...(config.enable !== undefined ? { enable: cloneJson(config.enable) } : {}),
        ...(config.disable !== undefined ? { disable: cloneJson(config.disable) } : {}),
        ...(config.layerOverrides !== undefined
            ? { layerOverrides: config.layerOverrides.map(orderProfileLayerOverride) }
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

function cloneCapabilitySource(source: CapabilitySource): CapabilitySource {
    return {
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: sortExcludedTypes(source.excludedTypes) }
            : {}),
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
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: sortExcludedTypes(source.excludedTypes) }
            : {}),
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
    capabilities: CapabilitySource[],
): NamedMetadataRepo {
    return {
        id: repo.id,
        ...(repo.name !== undefined ? { name: repo.name } : {}),
        ...(repo.url !== undefined ? { url: repo.url } : {}),
        localPath: repo.localPath,
        ...(repo.commit !== undefined ? { commit: repo.commit } : {}),
        ...(repo.enabled !== undefined ? { enabled: repo.enabled } : {}),
        ...(repo.discover !== undefined
            ? { discover: orderRepoDiscoveryConfig(repo.discover) }
            : {}),
        ...(repo.injection !== undefined
            ? { injection: orderInjectionConfig(repo.injection) }
            : {}),
        ...(repo.fileNamingStrategy !== undefined
            ? { fileNamingStrategy: repo.fileNamingStrategy }
            : {}),
        capabilities,
    };
}

function layerSourceToCapabilitySource(source: LayerSource): CapabilitySource {
    return {
        path: normalizeLayerPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(source.excludedTypes) }
            : {}),
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
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(source.excludedTypes) }
            : {}),
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
        ...(fallback.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(fallback.excludedTypes) }
            : capability.excludedTypes !== undefined
              ? { excludedTypes: cloneJson(capability.excludedTypes) }
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
        ...(override.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(override.excludedTypes) }
            : base.excludedTypes !== undefined
              ? { excludedTypes: cloneJson(base.excludedTypes) }
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

function resolveCompatibilityVersion(config: MetaFlowConfig): {
    compatibilityVersion: number;
    migrationMessage?: string;
} {
    if (config.compatibilityVersion === undefined) {
        return {
            compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
            migrationMessage:
                `Migrated released config compatibilityVersion from implicit v${IMPLICIT_RELEASED_CONFIG_COMPATIBILITY_VERSION} to v${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
        };
    }

    if (config.compatibilityVersion < CURRENT_CONFIG_COMPATIBILITY_VERSION) {
        return {
            compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
            migrationMessage:
                `Migrated config compatibilityVersion from v${config.compatibilityVersion} to v${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
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

    return canonical;
}

function buildRestOfConfig(
    config: MetaFlowConfig,
): Omit<MetaFlowConfig, 'metadataRepo' | 'layers' | 'metadataRepos' | 'layerSources'> {
    const fileNamingStrategy = config.fileNamingStrategy as SyncFileNamingStrategy | undefined;
    const compatibility = resolveCompatibilityVersion(config);

    return {
        compatibilityVersion: compatibility.compatibilityVersion,
        ...(config.filters !== undefined ? { filters: orderFilterConfig(config.filters) } : {}),
        ...(config.profiles !== undefined ? { profiles: orderProfiles(config.profiles) } : {}),
        ...(config.activeProfile !== undefined ? { activeProfile: config.activeProfile } : {}),
        ...(config.injection !== undefined
            ? { injection: orderInjectionConfig(config.injection) }
            : {}),
        ...(fileNamingStrategy !== undefined ? { fileNamingStrategy } : {}),
        ...(config.settingsInjectionTarget !== undefined
            ? { settingsInjectionTarget: config.settingsInjectionTarget }
            : {}),
        ...(config.hooks !== undefined ? { hooks: orderHooksConfig(config.hooks) } : {}),
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
    const rest = buildRestOfConfig(config);

    if (config.metadataRepos && config.metadataRepos.length > 0) {
        const layerSourcesByRepoId = new Map<string, LayerSource[]>();
        for (const source of config.layerSources ?? []) {
            const list = layerSourcesByRepoId.get(source.repoId) ?? [];
            list.push(cloneLayerSource(source));
            layerSourcesByRepoId.set(source.repoId, list);
        }

        return canonicalizeAuthoredConfig({
            metadataRepos: config.metadataRepos.map((repo) =>
                cloneNamedRepo(repo, buildCapabilitiesForRepo(repo, layerSourcesByRepoId)),
            ),
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
            enabled: true,
            capabilities: (config.layers ?? []).map((layerPath) => ({
                path: layerPath,
                enabled: true,
            })),
        };

        return canonicalizeAuthoredConfig({
            metadataRepos: [primaryRepo],
            ...rest,
        });
    }

    return canonicalizeAuthoredConfig({
        ...rest,
    });
}

export function normalizeConfigShape(config: MetaFlowConfig): NormalizedConfigShape {
    const authoredConfig = toAuthoredConfig(config);
    const runtimeConfig: MetaFlowConfig = {
        ...cloneJson(authoredConfig),
        ...(config.layerSources !== undefined
            ? { layerSources: config.layerSources.map(cloneLayerSource) }
            : { layerSources: flattenCapabilities(authoredConfig.metadataRepos) }),
    };

    const migrationMessages: string[] = [];
    const compatibility = resolveCompatibilityVersion(config);
    if (compatibility.migrationMessage) {
        migrationMessages.push(compatibility.migrationMessage);
    }
    if (config.metadataRepo !== undefined || config.layers !== undefined) {
        migrationMessages.push(
            'Migrated legacy metadataRepo/layers config to metadataRepos[*].capabilities.',
        );
    }
    if (config.layerSources !== undefined) {
        migrationMessages.push(
            'Migrated legacy layerSources entries to metadataRepos[*].capabilities.',
        );
    }
    if (
        config.metadataRepos !== undefined &&
        config.metadataRepos.some((repo) => repo.capabilities === undefined) &&
        config.layerSources === undefined
    ) {
        migrationMessages.push(
            'Canonicalized metadataRepos entries to include explicit capabilities arrays.',
        );
    }

    return {
        config: runtimeConfig,
        authoredConfig,
        migrated: migrationMessages.length > 0,
        migrationMessages,
    };
}
