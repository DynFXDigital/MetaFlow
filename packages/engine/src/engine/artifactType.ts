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
    | 'agents'
    | 'skills'
    | 'claude-rules'
    | 'claude-agents'
    | 'claude-skills'
    | 'claude-settings'
    | 'other';

const KNOWN_TYPES = new Set<string>(['instructions', 'prompts', 'agents', 'skills']);
const CLAUDE_TYPES: Record<string, ArtifactType> = {
    rules: 'claude-rules',
    agents: 'claude-agents',
    skills: 'claude-skills',
    settings: 'claude-settings',
};

export const KNOWN_CLAUDE_SUBDIRS = new Set<string>(Object.keys(CLAUDE_TYPES));

function normalizeRelativePath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

function getClaudeArtifactType(posixPath: string): ArtifactType {
    if (!posixPath.startsWith('.claude/')) {
        return 'other';
    }

    const secondSegment = posixPath.split('/')[1] ?? '';
    if (secondSegment === 'settings.json' || secondSegment === 'settings.local.json') {
        return 'claude-settings';
    }

    return CLAUDE_TYPES[secondSegment] ?? 'other';
}

export function isClaudeArtifactPath(relativePath: string): boolean {
    return getClaudeArtifactType(normalizeRelativePath(relativePath)) !== 'other';
}

/**
 * Classify a relative file path into an artifact-type bucket.
 *
 * Strips a leading `.github/` segment before examining the first path component,
 * so both `instructions/foo.md` and `.github/instructions/foo.md` map to
 * `'instructions'`.  Unrecognised prefixes return `'other'`.
 */
export function getArtifactType(relativePath: string): ArtifactType {
    const posix = normalizeRelativePath(relativePath);
    const claudeType = getClaudeArtifactType(posix);
    if (claudeType !== 'other') {
        return claudeType;
    }

    const githubRelative = posix.replace(/^\.github\//, '');
    const firstSegment = githubRelative.split('/')[0] ?? '';
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
