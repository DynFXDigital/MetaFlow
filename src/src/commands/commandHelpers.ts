import * as fs from 'fs';
import * as path from 'path';
import { resolvePathFromWorkspace } from '@metaflow/engine';
import type { MetaFlowConfig } from '@metaflow/engine';

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

export type FilesViewMode = 'unified' | 'repoTree';
export type LayersViewMode = 'flat' | 'tree';

function toSlug(value: string): string {
    const trimmed = value.trim().replace(/\/$/, '').toLowerCase();
    return trimmed
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'source';
}

export function isInjectionMode(value: unknown): value is 'settings' | 'materialize' {
    return value === 'settings' || value === 'materialize';
}

export function deriveRepoId(
    sourceLocalPath: string,
    sourceUrl: string | undefined,
    existingRepoIds: Set<string>
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

    if (!config.metadataRepo || !config.layers) {
        throw new Error('Cannot convert config to multi-repo mode: metadataRepo/layers not found.');
    }

    config.metadataRepos = [{
        id: 'primary',
        ...config.metadataRepo,
        enabled: true,
    }];
    config.layerSources = config.layers.map(layerPath => ({
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

export function extractRepoId(arg: unknown): string | undefined {
    if (typeof arg === 'string') {
        return arg;
    }
    if (typeof arg === 'object' && arg !== null && 'repoId' in arg) {
        const repoId = (arg as { repoId?: unknown }).repoId;
        return typeof repoId === 'string' ? repoId : undefined;
    }
    return undefined;
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
        forceDiscoveryRepoId: typeof forceDiscoveryRepoId === 'string' ? forceDiscoveryRepoId : undefined,
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
    return value === 'repoTree' ? 'repoTree' : 'unified';
}

export function normalizeLayersViewMode(value: unknown): LayersViewMode {
    return value === 'tree' ? 'tree' : 'flat';
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

        const kept = config.layerSources.filter(ls => {
            const repoRoot = repoMap.get(ls.repoId);
            if (!repoRoot) { return true; } // unknown repoId — leave for validator
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
        const kept = config.layers.filter(layerPath => {
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
