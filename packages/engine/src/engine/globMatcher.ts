/**
 * Glob matching utility.
 *
 * Wraps minimatch for consistent glob evaluation across the engine.
 *
 * Pure TypeScript — no VS Code imports.
 */

import { minimatch } from 'minimatch';

/**
 * Test whether a relative file path matches a glob pattern.
 *
 * @param filePath Relative file path (forward slashes).
 * @param pattern Glob pattern.
 * @returns `true` if the pattern matches.
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
    // Normalize to forward slashes
    const normalized = filePath.replace(/\\/g, '/');
    return minimatch(normalized, pattern, { dot: true, matchBase: false });
}

/**
 * Test whether a file path matches any of the given patterns.
 *
 * @param filePath Relative file path.
 * @param patterns Array of glob patterns.
 * @returns `true` if any pattern matches.
 */
export function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
    return patterns.some(p => matchesGlob(filePath, p));
}