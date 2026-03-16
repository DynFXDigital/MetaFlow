/**
 * Config path discovery and resolution utilities.
 *
 * Discovers `.metaflow/config.jsonc` at workspace root.
 * Resolves relative paths against the workspace root.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as path from 'path';
import * as fs from 'fs';

/** Config file names in discovery order. */
const CONFIG_FILENAMES = [path.join('.metaflow', 'config.jsonc')];

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
 * Normalize path separators from any platform style to forward slashes.
 *
 * Config and state files may be authored on Windows (backslash separators)
 * then used on Linux/macOS — or vice versa. Normalizing to forward slashes
 * before any Node.js path operation ensures cross-platform correctness because:
 * - `path.join`/`path.resolve` on Windows already accepts `/` (converts to `\`).
 * - `path.join`/`path.resolve` on Linux/macOS treats `\` as a literal character,
 *   not a separator, so Windows-style paths would be mishandled without this step.
 *
 * @param p Raw path string (may use `\` or `/` separators).
 * @returns Path with backslashes replaced by forward slashes.
 */
export function normalizeInputPath(p: string): string {
    return p.replace(/\\/g, '/');
}

/**
 * Resolve a potentially relative path against the workspace root.
 *
 * Accepts paths authored on any platform (Windows `\`, Unix/macOS `/`).
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @param targetPath Path to resolve (absolute returned as-is).
 * @returns Absolute resolved path.
 */
export function resolvePathFromWorkspace(workspaceRoot: string, targetPath: string): string {
    const normalized = normalizeInputPath(targetPath);
    if (path.isAbsolute(normalized)) {
        return path.normalize(normalized);
    }
    return path.normalize(path.join(workspaceRoot, normalized));
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
    return (
        normalizedPath.startsWith(normalizedBoundary + path.sep) ||
        normalizedPath === normalizedBoundary
    );
}
