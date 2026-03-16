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
} from './configSchema';
import { normalizeInputPath } from './configPathUtils';

export interface NormalizedConfigShape {
    config: MetaFlowConfig;
    authoredConfig: MetaFlowConfig;
    migrated: boolean;
    migrationMessages: string[];
}

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
];

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
        path: normalizeInputPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: sortExcludedTypes(source.excludedTypes) }
            : {}),
        ...(source.injection !== undefined
            ? { injection: orderInjectionConfig(source.injection) }
            : {}),
    };
}

function cloneLayerSource(source: LayerSource): LayerSource {
    return {
        repoId: source.repoId,
        path: normalizeInputPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: sortExcludedTypes(source.excludedTypes) }
            : {}),
        ...(source.injection !== undefined
            ? { injection: orderInjectionConfig(source.injection) }
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
        capabilities,
    };
}

function layerSourceToCapabilitySource(source: LayerSource): CapabilitySource {
    return {
        path: normalizeInputPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(source.excludedTypes) }
            : {}),
        ...(source.injection !== undefined ? { injection: cloneJson(source.injection) } : {}),
    };
}

function capabilitySourceToLayerSource(repoId: string, source: CapabilitySource): LayerSource {
    return {
        repoId,
        path: normalizeInputPath(source.path),
        ...(source.enabled !== undefined ? { enabled: source.enabled } : {}),
        ...(source.excludedTypes !== undefined
            ? { excludedTypes: cloneJson(source.excludedTypes) }
            : {}),
        ...(source.injection !== undefined ? { injection: cloneJson(source.injection) } : {}),
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
        path: normalizeInputPath(fallback.path),
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
    };
}

function buildRestOfConfig(
    config: MetaFlowConfig,
): Omit<MetaFlowConfig, 'metadataRepo' | 'layers' | 'metadataRepos' | 'layerSources'> {
    return {
        ...(config.filters !== undefined ? { filters: orderFilterConfig(config.filters) } : {}),
        ...(config.profiles !== undefined ? { profiles: orderProfiles(config.profiles) } : {}),
        ...(config.activeProfile !== undefined ? { activeProfile: config.activeProfile } : {}),
        ...(config.injection !== undefined
            ? { injection: orderInjectionConfig(config.injection) }
            : {}),
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

        return {
            metadataRepos: config.metadataRepos.map((repo) =>
                cloneNamedRepo(repo, buildCapabilitiesForRepo(repo, layerSourcesByRepoId)),
            ),
            ...rest,
        };
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

        return {
            metadataRepos: [primaryRepo],
            ...rest,
        };
    }

    return {
        ...rest,
    };
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
