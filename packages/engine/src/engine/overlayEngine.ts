/**
 * Layer resolution engine.
 *
 * Resolves layers in precedence order and builds the effective file map.
 * Later layers override earlier layers for same-path files.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as path from 'path';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import {
    MetaFlowConfig,
    MetadataRepo,
    NamedMetadataRepo,
    LayerSource,
} from '../config/configSchema';
import {
    resolvePathFromWorkspace,
    isWithinBoundary,
    normalizeInputPath,
} from '../config/configPathUtils';
import { LayerContent, LayerFile, EffectiveFile } from './types';
import { loadCapabilityManifestForLayer } from './capabilityManifest';

const KNOWN_ARTIFACT_ROOTS = new Set([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
]);

export interface ResolveLayersOptions {
    /** Enables runtime layer discovery for repos with discover.enabled=true. */
    enableDiscovery?: boolean;
    /** Force runtime discovery for specific repo IDs even when discover.enabled is not set. */
    forceDiscoveryRepoIds?: string[];
}

/**
 * Resolve all layers from a config and return an ordered array of LayerContent.
 *
 * @param config Validated MetaFlowConfig.
 * @param workspaceRoot Absolute workspace root path.
 * @returns Array of resolved layer contents in precedence order.
 */
export function resolveLayers(
    config: MetaFlowConfig,
    workspaceRoot: string,
    options?: ResolveLayersOptions,
): LayerContent[] {
    const resolveOptions: ResolveLayersOptions = {
        enableDiscovery: options?.enableDiscovery ?? true,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
    };

    if (config.metadataRepos && config.layerSources) {
        return resolveMultiRepoLayers(
            config.metadataRepos,
            config.layerSources,
            workspaceRoot,
            resolveOptions,
        );
    }
    if (config.metadataRepo && config.layers) {
        return resolveSingleRepoLayers(
            config.metadataRepo,
            config.layers,
            workspaceRoot,
            resolveOptions,
        );
    }
    return [];
}

/**
 * Build the effective file map from resolved layers.
 * Later layers override earlier layers for the same relative path.
 *
 * @param layers Ordered array of LayerContent (low → high specificity).
 * @returns Map of relativePath → EffectiveFile (without classification set).
 */
export function buildEffectiveFileMap(layers: LayerContent[]): Map<string, EffectiveFile> {
    const fileMap = new Map<string, EffectiveFile>();

    for (const layer of layers) {
        for (const file of layer.files) {
            const normalizedPath = file.relativePath.replace(/\\/g, '/');
            fileMap.set(normalizedPath, {
                relativePath: normalizedPath,
                sourcePath: file.absolutePath,
                sourceLayer: layer.layerId,
                sourceRepo: layer.repoId,
                sourceCapabilityId: layer.capability?.id,
                sourceCapabilityName: layer.capability?.name,
                sourceCapabilityDescription: layer.capability?.description,
                sourceCapabilityLicense: layer.capability?.license,
                classification: 'synchronized', // placeholder — set by classifier
            });
        }
    }

    return fileMap;
}

// ── Internal helpers ───────────────────────────────────────────────

function resolveSingleRepoLayers(
    repo: MetadataRepo,
    layers: string[],
    workspaceRoot: string,
    options: ResolveLayersOptions,
): LayerContent[] {
    const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
    const result: LayerContent[] = [];
    const explicitLayers = new Set(layers);

    for (const layerPath of layers) {
        const normalizedLayerPath = normalizeInputPath(layerPath);
        const layerAbsPath = path.join(repoRoot, normalizedLayerPath);
        const capabilityId = deriveCapabilityId(normalizedLayerPath, repoRoot);

        // Validate path traversal
        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue; // skip layer silently — diagnostics handle this elsewhere
        }

        if (!fs.existsSync(layerAbsPath)) {
            continue; // directory was removed — omit this layer from results
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push({
            layerId: normalizedLayerPath,
            files,
            capability: loadCapabilityManifestForLayer(layerAbsPath, capabilityId),
        });
    }

    const shouldForceSingleRepoDiscovery =
        options.forceDiscoveryRepoIds?.includes('primary') === true;
    if (options.enableDiscovery && shouldForceSingleRepoDiscovery) {
        const discoveredLayers = discoverLayersInRepo(repoRoot).filter(
            (layerPath) => !explicitLayers.has(layerPath),
        );

        for (const layerPath of discoveredLayers) {
            const layerAbsPath = path.join(repoRoot, layerPath);
            const capabilityId = deriveCapabilityId(layerPath, repoRoot);
            if (!isWithinBoundary(layerAbsPath, repoRoot)) {
                continue;
            }

            const files = walkDirectory(layerAbsPath, layerAbsPath);
            result.push({
                layerId: layerPath,
                files,
                capability: loadCapabilityManifestForLayer(layerAbsPath, capabilityId),
            });
        }
    }

    return result;
}

function resolveMultiRepoLayers(
    repos: NamedMetadataRepo[],
    layerSources: LayerSource[],
    workspaceRoot: string,
    options: ResolveLayersOptions,
): LayerContent[] {
    const repoMap = new Map<string, string>();
    const discoveredLayerSources: LayerSource[] = [];
    const explicitLayerKeys = new Set(layerSources.map((ls) => `${ls.repoId}:${ls.path}`));

    for (const repo of repos) {
        if (repo.enabled === false) {
            continue;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        repoMap.set(repo.id, repoRoot);

        const shouldDiscoverRepo =
            options.enableDiscovery &&
            (repo.discover?.enabled === true ||
                options.forceDiscoveryRepoIds?.includes(repo.id) === true);

        if (shouldDiscoverRepo) {
            const discoveredPaths = discoverLayersInRepo(repoRoot, repo.discover?.exclude);
            for (const discoveredPath of discoveredPaths) {
                const layerKey = `${repo.id}:${discoveredPath}`;
                if (explicitLayerKeys.has(layerKey)) {
                    continue;
                }
                discoveredLayerSources.push({
                    repoId: repo.id,
                    path: discoveredPath,
                    enabled: true,
                });
            }
        }
    }

    const allLayerSources = [
        ...layerSources,
        ...discoveredLayerSources.sort((a, b) =>
            `${a.repoId}:${a.path}`.localeCompare(`${b.repoId}:${b.path}`),
        ),
    ];

    const result: LayerContent[] = [];

    for (const ls of allLayerSources) {
        if (ls.enabled === false) {
            continue;
        }

        const repoRoot = repoMap.get(ls.repoId);
        if (!repoRoot) {
            continue; // invalid repoId — diagnostics handle this
        }

        const normalizedLayerPath = normalizeInputPath(ls.path);
        const layerAbsPath = path.join(repoRoot, normalizedLayerPath);
        const capabilityId = deriveCapabilityId(normalizedLayerPath, repoRoot);

        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue;
        }

        if (!fs.existsSync(layerAbsPath)) {
            continue; // directory was removed — omit this layer from results
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push({
            layerId: `${ls.repoId}/${normalizedLayerPath}`,
            repoId: ls.repoId,
            files,
            capability: loadCapabilityManifestForLayer(layerAbsPath, capabilityId),
        });
    }

    return result;
}

/**
 * Recursively walk a directory and collect all files (relative to layerRoot).
 */
function walkDirectory(dirPath: string, layerRoot: string): LayerFile[] {
    const files: LayerFile[] = [];

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return files;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkDirectory(fullPath, layerRoot));
        } else if (entry.isFile()) {
            const relativePath = normalizeLayerRelativePath(path.relative(layerRoot, fullPath));
            if (!isKnownArtifactPath(relativePath)) {
                continue;
            }
            files.push({
                relativePath,
                absolutePath: fullPath,
            });
        }
    }

    return files;
}

/**
 * Normalize layer-relative paths into artifact-relative paths.
 *
 * Metadata packs commonly nest artifacts under `.github/`.
 * The overlay/classifier pipeline expects paths rooted at artifact dirs
 * (e.g., `instructions/**`, `skills/**`), so we strip an optional leading
 * `.github/` prefix here.
 */
function normalizeLayerRelativePath(relativePath: string): string {
    const posixPath = relativePath.replace(/\\/g, '/');
    if (posixPath.startsWith('.github/')) {
        return posixPath.slice('.github/'.length);
    }
    return posixPath;
}

function deriveCapabilityId(layerPath: string, repoRoot: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

function isKnownArtifactPath(relativePath: string): boolean {
    const topDir = relativePath.split('/')[0];
    return KNOWN_ARTIFACT_ROOTS.has(topDir);
}

/**
 * Discover layer directories in a repository by finding directories
 * that directly contain known artifact roots.
 */
export function discoverLayersInRepo(repoRoot: string, excludePatterns: string[] = []): string[] {
    const discovered = new Set<string>();

    if (!fs.existsSync(repoRoot)) {
        return [];
    }

    let repoStats: fs.Stats;
    try {
        repoStats = fs.statSync(repoRoot);
    } catch {
        return [];
    }

    if (!repoStats.isDirectory()) {
        return [];
    }

    const walk = (currentDir: string): void => {
        const currentBase = path.basename(currentDir);
        if (currentBase === '.github') {
            // Parent directory is the layer boundary for .github-based packs.
            return;
        }

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            return;
        }

        const childNames = new Set(entries.map((entry) => entry.name));
        const hasArtifactAtRoot = Array.from(KNOWN_ARTIFACT_ROOTS).some((root) =>
            childNames.has(root),
        );
        const hasGithubArtifacts =
            childNames.has('.github') && hasAnyKnownArtifactDir(path.join(currentDir, '.github'));

        if (hasArtifactAtRoot || hasGithubArtifacts) {
            const rel = path.relative(repoRoot, currentDir).replace(/\\/g, '/');
            const layerPath = normalizeDiscoveredLayerPath(rel === '' ? '.' : rel);
            if (!matchesAnyExclude(layerPath, excludePatterns)) {
                discovered.add(layerPath);
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            if (entry.name === '.git' || entry.name === 'node_modules') {
                continue;
            }
            walk(path.join(currentDir, entry.name));
        }
    };

    walk(repoRoot);
    return Array.from(discovered).sort((a, b) => a.localeCompare(b));
}

function hasAnyKnownArtifactDir(dirPath: string): boolean {
    if (!fs.existsSync(dirPath)) {
        return false;
    }

    for (const root of KNOWN_ARTIFACT_ROOTS) {
        const candidate = path.join(dirPath, root);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                return true;
            }
        } catch {
            continue;
        }
    }

    return false;
}

function matchesAnyExclude(layerPath: string, excludePatterns: string[]): boolean {
    if (excludePatterns.length === 0) {
        return false;
    }

    return excludePatterns.some((pattern) => minimatch(layerPath, pattern, { dot: true }));
}

function normalizeDiscoveredLayerPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}
