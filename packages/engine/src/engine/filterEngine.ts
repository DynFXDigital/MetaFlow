/**
 * Filter engine.
 *
 * Evaluates include/exclude glob patterns against the effective file set.
 * Exclude wins over include when a file matches both.
 *
 * Pure TypeScript — no VS Code imports.
 */

import { FilterConfig, LayerSource, ExcludableArtifactType } from '../config/configSchema';
import { EffectiveFile } from './types';
import { matchesAnyGlob } from './globMatcher';
import { getArtifactType } from './artifactType';

/**
 * Apply include/exclude filters to the effective file set.
 *
 * @param files Array of effective files.
 * @param filters Filter configuration (include/exclude globs).
 * @returns Filtered array of effective files.
 */
export function applyFilters(
    files: EffectiveFile[],
    filters: FilterConfig | undefined
): EffectiveFile[] {
    if (!filters) {
        return files; // no filters = all pass
    }

    return files.filter(file => {
        const relPath = file.relativePath;

        // Check exclude first — exclude wins
        if (filters.exclude && filters.exclude.length > 0) {
            if (matchesAnyGlob(relPath, filters.exclude)) {
                return false;
            }
        }

        // Check include — if include patterns exist, file must match at least one
        if (filters.include && filters.include.length > 0) {
            return matchesAnyGlob(relPath, filters.include);
        }

        // No include patterns = all pass
        return true;
    });
}

/**
 * Apply per-layer-source excluded-type filters to the effective file set.
 *
 * Files from a layer whose artifact type appears in that layer's `excludedTypes`
 * array are removed.  Layers without `excludedTypes` (or with an empty array)
 * are unaffected — backward-compatible by design.
 *
 * @param files  Array of effective files (output of buildEffectiveFileMap / applyFilters).
 * @param layerSources  Layer source entries from the multi-repo config.
 * @returns Filtered array.
 */
export function applyExcludedTypeFilters(
    files: EffectiveFile[],
    layerSources: LayerSource[] | undefined
): EffectiveFile[] {
    if (!layerSources || layerSources.length === 0) {
        return files;
    }

    // Build map from layerId (== `${repoId}/${path}`) to its excluded types.
    const excludedMap = new Map<string, ExcludableArtifactType[]>();
    for (const ls of layerSources) {
        if (ls.excludedTypes && ls.excludedTypes.length > 0) {
            excludedMap.set(`${ls.repoId}/${ls.path}`, ls.excludedTypes);
        }
    }

    if (excludedMap.size === 0) {
        return files;
    }

    return files.filter(file => {
        const excluded = excludedMap.get(file.sourceLayer);
        if (!excluded) {
            return true;
        }
        const type = getArtifactType(file.relativePath);
        return !(excluded as string[]).includes(type);
    });
}