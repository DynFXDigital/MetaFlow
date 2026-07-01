import {
    isCodexProjectConfigPath,
    isCodexProjectInstructionPath,
    isCodexRepositorySkillPath,
    normalizeArtifactPath,
} from './codexPaths';
import { ProjectionLossiness, ProjectionMetadata, ProjectionTarget } from './types';

function inferFormat(relativePath: string): ProjectionTarget {
    const normalized = normalizeArtifactPath(relativePath);
    if (normalized.startsWith('.metaflow/')) {
        return 'metaflow';
    }
    if (
        isCodexRepositorySkillPath(normalized) ||
        isCodexProjectInstructionPath(normalized) ||
        isCodexProjectConfigPath(normalized)
    ) {
        return 'codex';
    }
    if (
        normalized === 'copilot-instructions.md' ||
        normalized.startsWith('.github/') ||
        normalized.startsWith('instructions/') ||
        normalized.startsWith('prompts/') ||
        normalized.startsWith('skills/') ||
        normalized.startsWith('agents/') ||
        normalized.startsWith('hooks/') ||
        normalized.startsWith('chatmodes/')
    ) {
        return 'github-copilot';
    }
    return 'generic';
}

function describeTarget(target: ProjectionTarget): string {
    switch (target) {
        case 'codex':
            return 'Codex';
        case 'github-copilot':
            return 'GitHub Copilot';
        case 'metaflow':
            return 'MetaFlow';
        default:
            return 'generic metadata';
    }
}

function inferLossiness(
    sourceRelativePath: string,
    destinationRelativePath: string,
    sourceFormat: ProjectionTarget,
    target: ProjectionTarget,
): ProjectionLossiness {
    const normalizedSource = normalizeArtifactPath(sourceRelativePath);
    const normalizedDestination = normalizeArtifactPath(destinationRelativePath);
    const canonicalSkill = /^\.metaflow\/skills\/[^/]+\/SKILL\.md$/.test(normalizedSource);
    if (
        canonicalSkill &&
        (target === 'codex' || target === 'github-copilot') &&
        normalizedDestination.endsWith('/SKILL.md')
    ) {
        return 'none';
    }
    if (sourceFormat === target) {
        return 'none';
    }
    if (sourceFormat === 'generic' || target === 'generic') {
        return 'lossy';
    }
    return 'lossy';
}

function buildNotes(
    sourceRelativePath: string,
    destinationRelativePath: string,
    sourceFormat: ProjectionTarget,
    target: ProjectionTarget,
    lossiness: ProjectionLossiness,
): string[] {
    const notes: string[] = [];
    if (sourceFormat !== target) {
        notes.push(`${describeTarget(sourceFormat)} source projected to ${describeTarget(target)}`);
    }
    if (
        normalizeArtifactPath(sourceRelativePath) !== normalizeArtifactPath(destinationRelativePath)
    ) {
        notes.push('target path differs from authored source path');
    }
    if (lossiness === 'none') {
        notes.push('no known semantic loss');
    } else if (lossiness === 'lossy') {
        notes.push('target cannot represent all source semantics');
    } else {
        notes.push('target projection is unsupported');
    }
    return notes;
}

export function describeProjection(
    destinationRelativePath: string,
    sourceRelativePath?: string,
): ProjectionMetadata {
    const sourcePath = sourceRelativePath ?? destinationRelativePath;
    const sourceFormat = inferFormat(sourcePath);
    const target = inferFormat(destinationRelativePath);
    const pathTransformed =
        normalizeArtifactPath(sourcePath) !== normalizeArtifactPath(destinationRelativePath);
    const lossiness = inferLossiness(sourcePath, destinationRelativePath, sourceFormat, target);
    return {
        sourceFormat,
        target,
        pathTransformed,
        lossiness,
        notes: buildNotes(sourcePath, destinationRelativePath, sourceFormat, target, lossiness),
    };
}
