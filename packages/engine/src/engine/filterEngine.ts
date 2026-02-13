/**
 * Filter engine.
 *
 * Evaluates include/exclude glob patterns against the effective file set.
 * Exclude wins over include when a file matches both.
 *
 * Pure TypeScript — no VS Code imports.
 */

import { FilterConfig } from '../config/configSchema';
import { EffectiveFile } from './types';
import { matchesAnyGlob } from './globMatcher';

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