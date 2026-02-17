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
import {
    MetaFlowConfig,
    MetadataRepo,
    NamedMetadataRepo,
    LayerSource,
} from '../config/configSchema';
import { resolvePathFromWorkspace, isWithinBoundary } from '../config/configPathUtils';
import { LayerContent, LayerFile, EffectiveFile } from './types';

const KNOWN_ARTIFACT_ROOTS = new Set([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
]);

/**
 * Resolve all layers from a config and return an ordered array of LayerContent.
 *
 * @param config Validated MetaFlowConfig.
 * @param workspaceRoot Absolute workspace root path.
 * @returns Array of resolved layer contents in precedence order.
 */
export function resolveLayers(
    config: MetaFlowConfig,
    workspaceRoot: string
): LayerContent[] {
    if (config.metadataRepos && config.layerSources) {
        return resolveMultiRepoLayers(config.metadataRepos, config.layerSources, workspaceRoot);
    }
    if (config.metadataRepo && config.layers) {
        return resolveSingleRepoLayers(config.metadataRepo, config.layers, workspaceRoot);
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
export function buildEffectiveFileMap(
    layers: LayerContent[]
): Map<string, EffectiveFile> {
    const fileMap = new Map<string, EffectiveFile>();

    for (const layer of layers) {
        for (const file of layer.files) {
            const normalizedPath = file.relativePath.replace(/\\/g, '/');
            fileMap.set(normalizedPath, {
                relativePath: normalizedPath,
                sourcePath: file.absolutePath,
                sourceLayer: layer.layerId,
                sourceRepo: layer.repoId,
                classification: 'materialized', // placeholder — set by classifier
            });
        }
    }

    return fileMap;
}

// ── Internal helpers ───────────────────────────────────────────────

function resolveSingleRepoLayers(
    repo: MetadataRepo,
    layers: string[],
    workspaceRoot: string
): LayerContent[] {
    const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
    const result: LayerContent[] = [];

    for (const layerPath of layers) {
        const layerAbsPath = path.join(repoRoot, layerPath);

        // Validate path traversal
        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue; // skip layer silently — diagnostics handle this elsewhere
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push({
            layerId: layerPath,
            files,
        });
    }

    return result;
}

function resolveMultiRepoLayers(
    repos: NamedMetadataRepo[],
    layerSources: LayerSource[],
    workspaceRoot: string
): LayerContent[] {
    const repoMap = new Map<string, string>();
    for (const repo of repos) {
        if (repo.enabled === false) {
            continue;
        }
        repoMap.set(repo.id, resolvePathFromWorkspace(workspaceRoot, repo.localPath));
    }

    const result: LayerContent[] = [];

    for (const ls of layerSources) {
        if (ls.enabled === false) {
            continue;
        }

        const repoRoot = repoMap.get(ls.repoId);
        if (!repoRoot) {
            continue; // invalid repoId — diagnostics handle this
        }

        const layerAbsPath = path.join(repoRoot, ls.path);

        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue;
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push({
            layerId: `${ls.repoId}/${ls.path}`,
            repoId: ls.repoId,
            files,
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

function isKnownArtifactPath(relativePath: string): boolean {
    const topDir = relativePath.split('/')[0];
    return KNOWN_ARTIFACT_ROOTS.has(topDir);
}