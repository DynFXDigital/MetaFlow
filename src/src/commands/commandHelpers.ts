import * as fs from 'fs';
import * as path from 'path';
import { loadManagedState, saveManagedState, resolvePathFromWorkspace } from '@metaflow/engine';
import type {
    ExcludableArtifactType,
    MetaFlowConfig,
    ProfileConfig,
    ProfileLayerOverride,
} from '@metaflow/engine';

export interface RefreshCommandOptions {
    skipAutoApply?: boolean;
    skipRepoSync?: boolean;
    forceDiscovery?: boolean;
    forceDiscoveryRepoId?: string;
}

export interface ApplyCommandOptions {
    skipRefresh?: boolean;
}

export interface RepoScopeOptions {
    repoId?: string;
    allRepos?: boolean;
    silent?: boolean;
}

export type AiMetadataAutoApplyMode = 'off' | 'synchronize' | 'builtinLayer';

export type FilesViewMode = 'unified' | 'repoTree';
export type LayersViewMode = 'flat' | 'tree';

export const DEFAULT_FILES_VIEW_MODE: FilesViewMode = 'unified';
export const DEFAULT_LAYERS_VIEW_MODE: LayersViewMode = 'tree';

export interface ManagedViewsState {
    filesViewMode: FilesViewMode;
    layersViewMode: LayersViewMode;
}

export const DEFAULT_PROFILE_ID = 'default';

function toSlug(value: string): string {
    const trimmed = value.trim().replace(/\/$/, '').toLowerCase();
    return trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

export function isInjectionMode(value: unknown): value is 'settings' | 'synchronize' {
    return value === 'settings' || value === 'synchronize';
}

export function deriveRepoId(
    sourceLocalPath: string,
    sourceUrl: string | undefined,
    existingRepoIds: Set<string>,
): string {
    const urlBase = sourceUrl ? sourceUrl.split('/').pop() : undefined;
    const urlSeed = urlBase ? urlBase.replace(/\.git$/i, '') : undefined;
    const pathSeed = path.basename(sourceLocalPath) || 'source';
    const base = toSlug(urlSeed ?? pathSeed);

    let candidate = base;
    let suffix = 2;
    while (existingRepoIds.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

export function ensureMultiRepoConfig(config: MetaFlowConfig): {
    metadataRepos: NonNullable<MetaFlowConfig['metadataRepos']>;
    layerSources: NonNullable<MetaFlowConfig['layerSources']>;
} {
    if (config.metadataRepos && config.layerSources) {
        return {
            metadataRepos: config.metadataRepos,
            layerSources: config.layerSources,
        };
    }

    if (config.metadataRepos) {
        config.layerSources = config.metadataRepos.flatMap((repo) =>
            (repo.capabilities ?? []).map((capability) => ({
                repoId: repo.id,
                path: capability.path,
                ...(capability.enabled !== undefined ? { enabled: capability.enabled } : {}),
                ...(capability.excludedTypes !== undefined
                    ? { excludedTypes: [...capability.excludedTypes] }
                    : {}),
            })),
        );

        return {
            metadataRepos: config.metadataRepos,
            layerSources: config.layerSources,
        };
    }

    if (!config.metadataRepo || !config.layers) {
        throw new Error('Cannot convert config to multi-repo mode: metadataRepo/layers not found.');
    }

    config.metadataRepos = [
        {
            id: 'primary',
            ...config.metadataRepo,
            enabled: true,
            capabilities: config.layers.map((layerPath) => ({
                path: layerPath,
                enabled: true,
            })),
        },
    ];
    config.layerSources = config.layers.map((layerPath) => ({
        repoId: 'primary',
        path: layerPath,
        enabled: true,
    }));

    delete config.metadataRepo;
    delete config.layers;

    return {
        metadataRepos: config.metadataRepos,
        layerSources: config.layerSources,
    };
}

export function extractLayerIndex(arg: unknown): number | undefined {
    if (typeof arg === 'number') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'layerIndex' in arg) {
        const layerIndex = (arg as { layerIndex?: unknown }).layerIndex;
        return typeof layerIndex === 'number' ? layerIndex : undefined;
    }
    return undefined;
}

export function extractLayerCheckedState(arg: unknown): boolean | undefined {
    if (typeof arg === 'object' && arg !== null && 'checked' in arg) {
        const checked = (arg as { checked?: unknown }).checked;
        return typeof checked === 'boolean' ? checked : undefined;
    }
    return undefined;
}

function parseLayerTreeItemId(arg: unknown): {
    repoId?: string;
    layerPath?: string;
} {
    if (typeof arg !== 'object' || arg === null || !('id' in arg)) {
        return {};
    }

    const id = (arg as { id?: unknown }).id;
    if (typeof id !== 'string') {
        return {};
    }

    const segments = id.split(':');
    if (segments.length < 4) {
        return {};
    }

    const [, kind, repoId, ...rest] = segments;
    if (
        (kind !== 'folder' && kind !== 'layer' && kind !== 'artifact') ||
        typeof repoId !== 'string' ||
        rest.length === 0
    ) {
        return {};
    }

    const layerPathSegments = kind === 'artifact' ? rest.slice(0, -1) : rest;
    const layerPath = layerPathSegments.join(':').trim();

    return {
        repoId: repoId.trim() || undefined,
        layerPath: layerPath || undefined,
    };
}

export function extractLayerPath(arg: unknown): string | undefined {
    if (typeof arg === 'object' && arg !== null && 'layerPath' in arg) {
        const layerPath = (arg as { layerPath?: unknown }).layerPath;
        return typeof layerPath === 'string' ? layerPath : undefined;
    }

    if (typeof arg === 'object' && arg !== null && 'pathKey' in arg) {
        const pathKey = (arg as { pathKey?: unknown }).pathKey;
        if (typeof pathKey === 'string') {
            return pathKey;
        }
    }

    return parseLayerTreeItemId(arg).layerPath;
}

export function extractRepoId(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'repoId' in arg) {
        const repoId = (arg as { repoId?: unknown }).repoId;
        return typeof repoId === 'string' ? repoId : undefined;
    }

    return parseLayerTreeItemId(arg).repoId;
}

export function extractProfileId(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'profileId' in arg) {
        const profileId = (arg as { profileId?: unknown }).profileId;
        return typeof profileId === 'string' ? profileId : undefined;
    }
    return undefined;
}

export function getProfileDisplayName(profileId: string, profile?: ProfileConfig): string {
    const displayName = profile?.displayName?.trim();
    return displayName && displayName.length > 0 ? displayName : profileId;
}

export function buildProfileLayerOverrideKey(repoId: string, layerPath: string): string {
    return `${repoId}:${normalizeLayerPath(layerPath)}`;
}

function cloneProfileLayerOverride(override: ProfileLayerOverride): ProfileLayerOverride {
    return {
        repoId: override.repoId,
        path: normalizeLayerPath(override.path),
        ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
        ...(override.excludedTypes !== undefined
            ? { excludedTypes: [...override.excludedTypes] }
            : {}),
    };
}

export function getProfileLayerOverride(
    profile: ProfileConfig | undefined,
    repoId: string,
    layerPath: string,
): ProfileLayerOverride | undefined {
    const expectedKey = buildProfileLayerOverrideKey(repoId, layerPath);
    return profile?.layerOverrides?.find(
        (override) => buildProfileLayerOverrideKey(override.repoId, override.path) === expectedKey,
    );
}

export function updateProfileLayerOverride(
    profile: ProfileConfig,
    repoId: string,
    layerPath: string,
    mutation: {
        enabled?: boolean;
        excludedTypes?: ExcludableArtifactType[];
    },
): ProfileLayerOverride {
    const normalizedPath = normalizeLayerPath(layerPath);
    const nextOverrides = [...(profile.layerOverrides ?? []).map(cloneProfileLayerOverride)];
    const expectedKey = buildProfileLayerOverrideKey(repoId, normalizedPath);
    const existingIndex = nextOverrides.findIndex(
        (override) => buildProfileLayerOverrideKey(override.repoId, override.path) === expectedKey,
    );
    const current = existingIndex >= 0 ? nextOverrides[existingIndex] : undefined;
    const nextOverride: ProfileLayerOverride = {
        repoId,
        path: normalizedPath,
        ...(current?.enabled !== undefined ? { enabled: current.enabled } : {}),
        ...(current?.excludedTypes !== undefined
            ? { excludedTypes: [...current.excludedTypes] }
            : {}),
        ...(mutation.enabled !== undefined ? { enabled: mutation.enabled } : {}),
        ...(mutation.excludedTypes !== undefined
            ? { excludedTypes: [...mutation.excludedTypes] }
            : {}),
    };

    if (existingIndex >= 0) {
        nextOverrides[existingIndex] = nextOverride;
    } else {
        nextOverrides.push(nextOverride);
    }

    profile.layerOverrides = nextOverrides;
    return nextOverride;
}

export function projectConfigForProfile(
    config: MetaFlowConfig,
    profileId: string | undefined = config.activeProfile,
): MetaFlowConfig {
    const profile = profileId ? config.profiles?.[profileId] : undefined;
    if (!profile?.layerOverrides || profile.layerOverrides.length === 0) {
        return config;
    }

    const overrideByKey = new Map(
        profile.layerOverrides.map((override) => [
            buildProfileLayerOverrideKey(override.repoId, override.path),
            cloneProfileLayerOverride(override),
        ]),
    );

    const metadataRepos = config.metadataRepos?.map((repo) => ({
        ...repo,
        capabilities: repo.capabilities?.map((capability) => {
            const override = overrideByKey.get(
                buildProfileLayerOverrideKey(repo.id, capability.path),
            );
            if (!override) {
                return {
                    ...capability,
                    ...(capability.excludedTypes !== undefined
                        ? { excludedTypes: [...capability.excludedTypes] }
                        : {}),
                    ...(capability.injection !== undefined
                        ? { injection: { ...capability.injection } }
                        : {}),
                };
            }

            return {
                ...capability,
                ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
                ...(override.excludedTypes !== undefined
                    ? { excludedTypes: [...override.excludedTypes] }
                    : capability.excludedTypes !== undefined
                      ? { excludedTypes: [...capability.excludedTypes] }
                      : {}),
                ...(capability.injection !== undefined
                    ? { injection: { ...capability.injection } }
                    : {}),
            };
        }),
        ...(repo.injection !== undefined ? { injection: { ...repo.injection } } : {}),
        ...(repo.discover !== undefined ? { discover: { ...repo.discover } } : {}),
    }));

    const layerSources = config.layerSources?.map((layerSource) => {
        const override = overrideByKey.get(
            buildProfileLayerOverrideKey(layerSource.repoId, layerSource.path),
        );
        if (!override) {
            return {
                ...layerSource,
                ...(layerSource.excludedTypes !== undefined
                    ? { excludedTypes: [...layerSource.excludedTypes] }
                    : {}),
                ...(layerSource.injection !== undefined
                    ? { injection: { ...layerSource.injection } }
                    : {}),
            };
        }

        return {
            ...layerSource,
            ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
            ...(override.excludedTypes !== undefined
                ? { excludedTypes: [...override.excludedTypes] }
                : layerSource.excludedTypes !== undefined
                  ? { excludedTypes: [...layerSource.excludedTypes] }
                  : {}),
            ...(layerSource.injection !== undefined
                ? { injection: { ...layerSource.injection } }
                : {}),
        };
    });

    return {
        ...config,
        ...(metadataRepos !== undefined ? { metadataRepos } : {}),
        ...(layerSources !== undefined ? { layerSources } : {}),
        ...(config.profiles !== undefined ? { profiles: { ...config.profiles } } : {}),
        ...(config.filters !== undefined ? { filters: { ...config.filters } } : {}),
        ...(config.injection !== undefined ? { injection: { ...config.injection } } : {}),
    };
}

export function deriveProfileId(displayName: string, existingProfileIds: Set<string>): string {
    const base =
        displayName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'profile';

    let candidate = base;
    let suffix = 2;
    while (existingProfileIds.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

export function cloneProfileConfig(profile?: ProfileConfig): ProfileConfig {
    if (!profile) {
        return {};
    }

    return {
        ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
        ...(profile.enable !== undefined ? { enable: [...profile.enable] } : {}),
        ...(profile.disable !== undefined ? { disable: [...profile.disable] } : {}),
        ...(profile.layerOverrides !== undefined
            ? {
                  layerOverrides: profile.layerOverrides.map(cloneProfileLayerOverride),
              }
            : {}),
    };
}

export function addProfileToConfig(
    config: Pick<MetaFlowConfig, 'profiles'>,
    displayName: string,
    sourceProfileId?: string,
): { profileId: string; profile: ProfileConfig } {
    const normalizedDisplayName = displayName.trim();
    if (!normalizedDisplayName) {
        throw new Error('Profile name is required.');
    }

    const profiles = config.profiles ?? {};
    const existingDisplayNames = new Set(
        Object.entries(profiles).map(([profileId, profile]) =>
            getProfileDisplayName(profileId, profile),
        ),
    );
    if (existingDisplayNames.has(normalizedDisplayName)) {
        throw new Error(`Profile name "${normalizedDisplayName}" already exists.`);
    }

    const sourceProfile = sourceProfileId ? profiles[sourceProfileId] : undefined;
    if (sourceProfileId && !sourceProfile) {
        throw new Error(`Profile "${sourceProfileId}" was not found.`);
    }

    const profileId = deriveProfileId(normalizedDisplayName, new Set(Object.keys(profiles)));
    const profile = cloneProfileConfig(sourceProfile);
    profile.displayName = normalizedDisplayName;
    config.profiles = {
        ...profiles,
        [profileId]: profile,
    };
    return { profileId, profile };
}

export function deleteProfileFromConfig(
    config: Pick<MetaFlowConfig, 'profiles' | 'activeProfile'>,
    profileId: string,
    fallbackProfileId: string = DEFAULT_PROFILE_ID,
): string | undefined {
    if (profileId === DEFAULT_PROFILE_ID) {
        throw new Error('The default profile cannot be deleted.');
    }

    const profiles = config.profiles ?? {};
    if (!profiles[profileId]) {
        throw new Error(`Profile "${profileId}" was not found.`);
    }

    delete profiles[profileId];
    config.profiles = { ...profiles };

    if (config.activeProfile === profileId) {
        const nextActiveProfile = config.profiles[fallbackProfileId]
            ? fallbackProfileId
            : Object.keys(config.profiles)[0];
        config.activeProfile = nextActiveProfile;
        return nextActiveProfile;
    }

    return config.activeProfile;
}

export function extractRefreshCommandOptions(arg: unknown): RefreshCommandOptions {
    if (typeof arg !== 'object' || arg === null) {
        return {};
    }

    const skipAutoApply = (arg as { skipAutoApply?: unknown }).skipAutoApply;
    const skipRepoSync = (arg as { skipRepoSync?: unknown }).skipRepoSync;
    const forceDiscovery = (arg as { forceDiscovery?: unknown }).forceDiscovery;
    const forceDiscoveryRepoId = (arg as { forceDiscoveryRepoId?: unknown }).forceDiscoveryRepoId;
    return {
        skipAutoApply: typeof skipAutoApply === 'boolean' ? skipAutoApply : undefined,
        skipRepoSync: typeof skipRepoSync === 'boolean' ? skipRepoSync : undefined,
        forceDiscovery: typeof forceDiscovery === 'boolean' ? forceDiscovery : undefined,
        forceDiscoveryRepoId:
            typeof forceDiscoveryRepoId === 'string' ? forceDiscoveryRepoId : undefined,
    };
}

export function extractApplyCommandOptions(arg: unknown): ApplyCommandOptions {
    if (typeof arg !== 'object' || arg === null) {
        return {};
    }

    const skipRefresh = (arg as { skipRefresh?: unknown }).skipRefresh;
    return {
        skipRefresh: typeof skipRefresh === 'boolean' ? skipRefresh : undefined,
    };
}

export function extractRepoScopeOptions(arg: unknown): RepoScopeOptions {
    if (typeof arg === 'string') {
        return {
            repoId: arg,
            allRepos: false,
            silent: false,
        };
    }

    if (typeof arg !== 'object' || arg === null) {
        return {};
    }

    const repoId = (arg as { repoId?: unknown }).repoId;
    const allRepos = (arg as { allRepos?: unknown }).allRepos;
    const silent = (arg as { silent?: unknown }).silent;
    return {
        repoId: typeof repoId === 'string' ? repoId : undefined,
        allRepos: typeof allRepos === 'boolean' ? allRepos : undefined,
        silent: typeof silent === 'boolean' ? silent : undefined,
    };
}

export function normalizeFilesViewMode(value: unknown): FilesViewMode {
    return value === 'repoTree' ? 'repoTree' : DEFAULT_FILES_VIEW_MODE;
}

export function normalizeLayersViewMode(value: unknown): LayersViewMode {
    if (value === 'flat' || value === 'tree') {
        return value;
    }

    return DEFAULT_LAYERS_VIEW_MODE;
}

export function readManagedViewsState(workspaceRoot?: string): ManagedViewsState {
    if (!workspaceRoot) {
        return {
            filesViewMode: DEFAULT_FILES_VIEW_MODE,
            layersViewMode: DEFAULT_LAYERS_VIEW_MODE,
        };
    }

    const managedState = loadManagedState(workspaceRoot);
    return {
        filesViewMode: normalizeFilesViewMode(managedState.views?.filesViewMode),
        layersViewMode: normalizeLayersViewMode(managedState.views?.layersViewMode),
    };
}

export function writeManagedViewsState(
    workspaceRoot: string,
    patch: Partial<Record<keyof ManagedViewsState, unknown>>,
): ManagedViewsState {
    const managedState = loadManagedState(workspaceRoot);
    const nextViews: ManagedViewsState = {
        filesViewMode: normalizeFilesViewMode(
            patch.filesViewMode ?? managedState.views?.filesViewMode,
        ),
        layersViewMode: normalizeLayersViewMode(
            patch.layersViewMode ?? managedState.views?.layersViewMode,
        ),
    };

    managedState.views = nextViews;
    saveManagedState(workspaceRoot, managedState);
    return nextViews;
}

export function normalizeAiMetadataAutoApplyMode(value: unknown): AiMetadataAutoApplyMode {
    if (value === 'synchronize' || value === 'builtinLayer') {
        return value;
    }
    return 'off';
}

/**
 * Remove layerSources / layers entries whose directories no longer exist on disk.
 * Mutates config in-place. Returns the display strings of pruned entries.
 */
export function pruneStaleLayerSources(config: MetaFlowConfig, workspaceRoot: string): string[] {
    const pruned: string[] = [];

    if (config.layerSources && config.metadataRepos) {
        const repoMap = new Map<string, string>();
        for (const repo of config.metadataRepos) {
            if (repo.enabled !== false) {
                repoMap.set(repo.id, resolvePathFromWorkspace(workspaceRoot, repo.localPath));
            }
        }

        const kept = config.layerSources.filter((ls) => {
            const repoRoot = repoMap.get(ls.repoId);
            if (!repoRoot) {
                return true;
            } // unknown repoId — leave for validator
            const absPath = path.join(repoRoot, ls.path);
            if (!fs.existsSync(absPath)) {
                pruned.push(`${ls.repoId}/${ls.path}`);
                return false;
            }
            return true;
        });
        config.layerSources = kept;
    }

    if (config.layers && config.metadataRepo) {
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        const kept = config.layers.filter((layerPath) => {
            const absPath = path.join(repoRoot, layerPath);
            if (!fs.existsSync(absPath)) {
                pruned.push(layerPath);
                return false;
            }
            return true;
        });
        config.layers = kept;
    }

    return pruned;
}

export function normalizeLayerPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}

export function normalizeAndDeduplicateLayerPaths(config: MetaFlowConfig): boolean {
    let changed = false;

    if (config.layerSources) {
        const merged = new Map<string, { repoId: string; path: string; enabled?: boolean }>();
        for (const source of config.layerSources) {
            const normalizedPath = normalizeLayerPath(source.path);
            if (normalizedPath !== source.path) {
                changed = true;
            }

            const key = `${source.repoId}:${normalizedPath}`;
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, { ...source, path: normalizedPath });
                continue;
            }

            const existingEnabled = existing.enabled !== false;
            const currentEnabled = source.enabled !== false;
            if (existingEnabled !== currentEnabled) {
                existing.enabled = existingEnabled || currentEnabled;
                changed = true;
            }
        }

        if (merged.size !== config.layerSources.length) {
            changed = true;
        }
        config.layerSources = Array.from(merged.values());
    }

    if (config.layers) {
        const normalizedLayers: string[] = [];
        const seen = new Set<string>();
        for (const layer of config.layers) {
            const normalized = normalizeLayerPath(layer);
            if (normalized !== layer) {
                changed = true;
            }
            if (!seen.has(normalized)) {
                seen.add(normalized);
                normalizedLayers.push(normalized);
            } else {
                changed = true;
            }
        }
        config.layers = normalizedLayers;
    }

    return changed;
}
