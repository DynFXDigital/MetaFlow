/** Codex repository metadata paths supported by MetaFlow. */

const CODEX_REPOSITORY_SKILLS_ROOT = '.agents/skills';
const CODEX_PROJECT_INSTRUCTION_FILES = new Set(['AGENTS.md', 'AGENTS.override.md']);

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

export function isCodexProjectInstructionPath(relativePath: string): boolean {
    return CODEX_PROJECT_INSTRUCTION_FILES.has(normalizeArtifactPath(relativePath));
}

export function isCodexRootRelativeSynchronizedPath(relativePath: string): boolean {
    return isCodexRepositorySkillPath(relativePath) || isCodexProjectInstructionPath(relativePath);
}
