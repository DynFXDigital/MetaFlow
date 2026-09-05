/**
 * Artifact-type classification utility.
 *
 * Shared by the overlay engine (for per-layer exclusion filtering) and the
 * VS Code extension tree views (for grouping effective files by type).
 *
 * Pure TypeScript — no VS Code imports.
 */

export type ArtifactType =
    'instructions' | 'prompts' | 'commands' | 'agents' | 'skills' | 'hooks' | 'other';

const KNOWN_TYPES = new Set<string>([
    'instructions',
    'prompts',
    'commands',
    'agents',
    'skills',
    'hooks',
]);
const COPILOT_AGENT_PLUGIN_EXTENSION_PREFIX = 'com.github.copilot/';

/**
 * Classify a relative file path into an artifact-type bucket.
 *
 * Strips a leading `.github/` segment before examining the first path component,
 * so both `instructions/foo.md` and `.github/instructions/foo.md` map to
 * `'instructions'`.  Unrecognised prefixes return `'other'`.
 */
export function getArtifactType(relativePath: string): ArtifactType {
    const posix = relativePath.replace(/\\/g, '/').replace(/^\.github\//, '');
    const clientExtensionPath = posix.startsWith(COPILOT_AGENT_PLUGIN_EXTENSION_PREFIX)
        ? posix.slice(COPILOT_AGENT_PLUGIN_EXTENSION_PREFIX.length)
        : posix;
    const clientExtensionType = clientExtensionPath.split('/')[0] ?? '';
    if (clientExtensionType === 'rules') {
        return 'instructions';
    }
    if (KNOWN_TYPES.has(clientExtensionType)) {
        return clientExtensionType as ArtifactType;
    }
    const segments = clientExtensionPath.split('/').filter((segment) => segment.length > 0);
    const commandSegmentIndex = segments.findIndex(
        (segment, index) =>
            segment === 'commands' &&
            (index === 0 || ['.github', '.claude', '.codex'].includes(segments[index - 1])),
    );
    if (commandSegmentIndex !== -1) {
        return 'commands';
    }

    if (clientExtensionPath === 'copilot-instructions.md') {
        return 'instructions';
    }

    const firstSegment = clientExtensionPath.split('/')[0] ?? '';
    if (firstSegment === 'rules') {
        return 'instructions';
    }
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
