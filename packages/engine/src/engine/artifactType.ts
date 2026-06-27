/**
 * Artifact-type classification utility.
 *
 * Shared by the overlay engine (for per-layer exclusion filtering) and the
 * VS Code extension tree views (for grouping effective files by type).
 *
 * Pure TypeScript — no VS Code imports.
 */

import { isCodexRepositorySkillPath } from './codexPaths';

export type ArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills' | 'hooks' | 'other';

const KNOWN_TYPES = new Set<string>(['instructions', 'prompts', 'agents', 'skills', 'hooks']);

/**
 * Classify a relative file path into an artifact-type bucket.
 *
 * Strips a leading `.github/` segment before examining the first path component,
 * so both `instructions/foo.md` and `.github/instructions/foo.md` map to
 * `'instructions'`.  Unrecognised prefixes return `'other'`.
 */
export function getArtifactType(relativePath: string): ArtifactType {
    const posix = relativePath.replace(/\\/g, '/').replace(/^\.github\//, '');
    if (posix === 'copilot-instructions.md') {
        return 'instructions';
    }
    if (isCodexRepositorySkillPath(posix)) {
        return 'skills';
    }

    const firstSegment = posix.split('/')[0] ?? '';
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
