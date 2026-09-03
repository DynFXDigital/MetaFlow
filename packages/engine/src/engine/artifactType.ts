/**
 * Artifact-type classification utility.
 *
 * Shared by the overlay engine (for per-layer exclusion filtering) and the
 * VS Code extension tree views (for grouping effective files by type).
 *
 * Pure TypeScript — no VS Code imports.
 */

export type ArtifactType =
    | 'instructions'
    | 'prompts'
    | 'commands'
    | 'agents'
    | 'skills'
    | 'hooks'
    | 'other';

const KNOWN_TYPES = new Set<string>([
    'instructions',
    'prompts',
    'commands',
    'agents',
    'skills',
    'hooks',
]);
const COPILOT_AGENT_PLUGIN_HOOKS_PREFIX = 'com.github.copilot/hooks/';

/**
 * Classify a relative file path into an artifact-type bucket.
 *
 * Strips a leading `.github/` segment before examining the first path component,
 * so both `instructions/foo.md` and `.github/instructions/foo.md` map to
 * `'instructions'`.  Unrecognised prefixes return `'other'`.
 */
export function getArtifactType(relativePath: string): ArtifactType {
    const posix = relativePath.replace(/\\/g, '/').replace(/^\.github\//, '');
    if (posix.startsWith(COPILOT_AGENT_PLUGIN_HOOKS_PREFIX)) {
        return 'hooks';
    }
    const segments = posix.split('/').filter((segment) => segment.length > 0);
    const commandSegmentIndex = segments.findIndex(
        (segment, index) =>
            segment === 'commands' &&
            (index === 0 || ['.github', '.claude', '.codex'].includes(segments[index - 1])),
    );
    if (commandSegmentIndex !== -1) {
        return 'commands';
    }

    if (posix === 'copilot-instructions.md') {
        return 'instructions';
    }

    const firstSegment = posix.split('/')[0] ?? '';
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
