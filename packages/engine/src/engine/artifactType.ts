/**
 * Artifact-type classification utility.
 *
 * Shared by the overlay engine (for per-layer exclusion filtering) and the
 * VS Code extension tree views (for grouping effective files by type).
 *
 * Pure TypeScript — no VS Code imports.
 */

export type ArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills' | 'other';

const KNOWN_TYPES = new Set<string>(['instructions', 'prompts', 'agents', 'skills']);

/**
 * Classify a relative file path into an artifact-type bucket.
 *
 * Strips a leading `.github/` segment before examining the first path component,
 * so both `instructions/foo.md` and `.github/instructions/foo.md` map to
 * `'instructions'`.  Unrecognised prefixes return `'other'`.
 */
export function getArtifactType(relativePath: string): ArtifactType {
    const posix = relativePath.replace(/\\/g, '/').replace(/^\.github\//, '');
    const firstSegment = posix.split('/')[0] ?? '';
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
