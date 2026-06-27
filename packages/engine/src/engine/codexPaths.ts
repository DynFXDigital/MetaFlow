/** Codex repository metadata paths supported by MetaFlow. */

const CODEX_REPOSITORY_SKILLS_ROOT = '.agents/skills';

export function normalizeArtifactPath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

export function isCodexRepositorySkillPath(relativePath: string): boolean {
    const normalized = normalizeArtifactPath(relativePath).replace(/\/+$/, '');
    return (
        normalized === CODEX_REPOSITORY_SKILLS_ROOT ||
        normalized.startsWith(`${CODEX_REPOSITORY_SKILLS_ROOT}/`)
    );
}
