/**
 * Profile engine.
 *
 * Applies the active profile's enable/disable patterns to the effective file set.
 * Disable wins over enable when a file matches both.
 *
 * Pure TypeScript — no VS Code imports.
 */

import { ProfileConfig } from '../config/configSchema';
import { EffectiveFile } from './types';
import { matchesAnyGlob } from './globMatcher';

/**
 * Apply a profile's enable/disable patterns to the effective file set.
 *
 * @param files Array of effective files (post-filtering).
 * @param profile The active profile config, or undefined (all enabled).
 * @returns Filtered array of effective files after profile application.
 */
export function applyProfile(
    files: EffectiveFile[],
    profile: ProfileConfig | undefined,
): EffectiveFile[] {
    // No profile or empty profile = all files enabled
    if (!profile) {
        return files;
    }

    // A *defined* enable list is an active allowlist, even when empty: `enable: []`
    // means "enable nothing" (match-nothing), not "no filter". Only an absent
    // enable key falls through to all-pass. This keeps an empty-profile switch
    // (enable: []) observably clearing the effective set.
    const hasEnable = profile.enable !== undefined;
    const hasDisable = profile.disable !== undefined && profile.disable.length > 0;

    if (!hasEnable && !hasDisable) {
        return files;
    }

    return files.filter((file) => {
        const relPath = file.relativePath;

        // Disable wins over enable
        if (hasDisable && matchesAnyGlob(relPath, profile.disable!)) {
            return false;
        }

        // If enable patterns exist, file must match at least one
        if (hasEnable) {
            return matchesAnyGlob(relPath, profile.enable!);
        }

        // No enable patterns = all pass (unless disabled above)
        return true;
    });
}
