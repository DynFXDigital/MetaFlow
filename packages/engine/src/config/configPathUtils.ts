/**
 * Config path discovery and resolution utilities.
 *
 * Discovers `.ai-sync.json` at workspace root or `.ai/.ai-sync.json` fallback.
 * Resolves relative paths against the workspace root.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as path from 'path';
import * as fs from 'fs';

/** Config file names in discovery order. */
const CONFIG_FILENAMES = [
    '.ai-sync.json',
    path.join('.ai', '.ai-sync.json'),
];

/**
 * Discover the config file path in the given workspace root.
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns Absolute path to the config file, or `undefined` if not found.
 */
export function discoverConfigPath(workspaceRoot: string): string | undefined {
    for (const relName of CONFIG_FILENAMES) {
        const candidate = path.join(workspaceRoot, relName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Resolve a potentially relative path against the workspace root.
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @param targetPath Path to resolve (absolute returned as-is).
 * @returns Absolute resolved path.
 */
export function resolvePathFromWorkspace(workspaceRoot: string, targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
        return path.normalize(targetPath);
    }
    return path.normalize(path.join(workspaceRoot, targetPath));
}

/**
 * Validate that a resolved path stays within the given boundary root.
 * Prevents path-traversal attacks.
 *
 * @param resolvedPath The absolute resolved path to validate.
 * @param boundaryRoot The absolute root that the path must stay within.
 * @returns `true` if the path is within the boundary.
 */
export function isWithinBoundary(resolvedPath: string, boundaryRoot: string): boolean {
    const normalizedPath = path.normalize(resolvedPath);
    const normalizedBoundary = path.normalize(boundaryRoot);
    return normalizedPath.startsWith(normalizedBoundary + path.sep) || normalizedPath === normalizedBoundary;
}