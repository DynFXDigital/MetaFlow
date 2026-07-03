import {
    isCodexProjectConfigPath,
    isCodexProjectInstructionPath,
    isCodexRepositorySkillPath,
    normalizeArtifactPath,
} from './codexPaths';
import {
    ProjectionLossiness,
    ProjectionMetadata,
    ProjectionTarget,
    TargetAdapterMetadata,
    TargetCapabilityConcept,
} from './types';

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

function inferTargetAdapterConcept(
    sourceRelativePath: string,
    destinationRelativePath: string,
): TargetCapabilityConcept | undefined {
    const normalizedSource = normalizeArtifactPath(sourceRelativePath);
    const normalizedDestination = normalizeArtifactPath(destinationRelativePath);
    const paths = [normalizedSource, normalizedDestination];

    if (
        paths.some(
            (path) =>
                /^\.metaflow\/skills\/[^/]+\/SKILL\.md$/.test(path) ||
                isCodexRepositorySkillPath(path) ||
                path.startsWith('skills/'),
        )
    ) {
        return 'skills';
    }

    if (
        paths.some(
            (path) =>
                isCodexProjectInstructionPath(path) ||
                /^\.metaflow\/instructions\/[^/]+\.md$/.test(path) ||
                path === 'copilot-instructions.md' ||
                path.startsWith('instructions/') ||
                path.startsWith('.github/instructions/'),
        )
    ) {
        return 'instructions';
    }

    if (
        paths.some(
            (path) =>
                /^\.metaflow\/prompts\/[^/]+\.md$/.test(path) ||
                path.startsWith('prompts/') ||
                path.startsWith('.github/prompts/'),
        )
    ) {
        return 'prompts';
    }

    if (
        paths.some(
            (path) =>
                /^\.metaflow\/agents\/[^/]+\.json$/.test(path) ||
                /^\.codex\/agents\/[^/]+\.toml$/.test(path) ||
                path.startsWith('agents/') ||
                path.startsWith('.github/agents/'),
        )
    ) {
        return 'agents';
    }

    if (
        paths.some(
            (path) =>
                path === '.metaflow/mcp' ||
                /^\.metaflow\/mcp\/[^/]+\.json$/.test(path),
        )
    ) {
        return 'mcpServers';
    }

    if (
        paths.some(
            (path) =>
                /^\.metaflow\/project-config\/[^/]+\.json$/.test(path) ||
                path === '.codex/config.toml',
        )
    ) {
        return 'projectConfig';
    }

    if (
        paths.some(
            (path) =>
                path === '.metaflow/hooks' ||
                /^\.metaflow\/hooks\/[^/]+\.json$/.test(path) ||
                path === '.codex/hooks.json' ||
                path.startsWith('hooks/') ||
                path.startsWith('.github/hooks/'),
        )
    ) {
        return 'hooks';
    }

    if (paths.some((path) => path === 'plugin.json' || path.endsWith('/plugin.json'))) {
        return 'packageManifests';
    }

    return undefined;
}

function selectTargetAdapter(
    target: ProjectionTarget,
    targetAdapters?: TargetAdapterMetadata[],
): TargetAdapterMetadata | undefined {
    const candidates = (targetAdapters ?? [])
        .filter((adapter) => adapter.target === target)
        .sort(
            (left, right) =>
                Number(right.enabled) - Number(left.enabled) || left.id.localeCompare(right.id),
        );
    return candidates[0];
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
    const canonicalInstruction = /^\.metaflow\/instructions\/[^/]+\.md$/.test(normalizedSource);
    const canonicalPrompt = /^\.metaflow\/prompts\/[^/]+\.md$/.test(normalizedSource);
    const canonicalAgentProfile = /^\.metaflow\/agents\/[^/]+\.json$/.test(normalizedSource);
    const canonicalProjectConfig = /^\.metaflow\/project-config\/[^/]+\.json$/.test(
        normalizedSource,
    );
    const canonicalMcpServers =
        normalizedSource === '.metaflow/mcp' ||
        /^\.metaflow\/mcp\/[^/]+\.json$/.test(normalizedSource);
    const canonicalHooks =
        normalizedSource === '.metaflow/hooks' ||
        /^\.metaflow\/hooks\/[^/]+\.json$/.test(normalizedSource);
    if (
        canonicalInstruction &&
        target === 'github-copilot' &&
        normalizedDestination.startsWith('instructions/')
    ) {
        return 'none';
    }
    if (canonicalPrompt && target === 'github-copilot' && normalizedDestination.startsWith('prompts/')) {
        return 'none';
    }
    if (
        canonicalSkill &&
        (target === 'codex' || target === 'github-copilot') &&
        normalizedDestination.endsWith('/SKILL.md')
    ) {
        return 'none';
    }
    if (
        canonicalAgentProfile &&
        target === 'codex' &&
        /^\.codex\/agents\/[^/]+\.toml$/.test(normalizedDestination)
    ) {
        return 'none';
    }
    if (
        canonicalProjectConfig &&
        target === 'codex' &&
        normalizedDestination === '.codex/config.toml'
    ) {
        return 'none';
    }
    if (
        canonicalMcpServers &&
        target === 'codex' &&
        normalizedDestination === '.codex/config.toml'
    ) {
        return 'lossy';
    }
    if (canonicalHooks && target === 'codex' && normalizedDestination === '.codex/hooks.json') {
        return 'lossy';
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
    return describeProjectionWithTargetAdapters(destinationRelativePath, sourceRelativePath);
}

export function describeProjectionWithTargetAdapters(
    destinationRelativePath: string,
    sourceRelativePath?: string,
    targetAdapters?: TargetAdapterMetadata[],
): ProjectionMetadata {
    const sourcePath = sourceRelativePath ?? destinationRelativePath;
    const sourceFormat = inferFormat(sourcePath);
    const target = inferFormat(destinationRelativePath);
    const pathTransformed =
        normalizeArtifactPath(sourcePath) !== normalizeArtifactPath(destinationRelativePath);
    const lossiness = inferLossiness(sourcePath, destinationRelativePath, sourceFormat, target);
    const concept = inferTargetAdapterConcept(sourcePath, destinationRelativePath);
    const adapter = selectTargetAdapter(target, targetAdapters);
    const normalizedSourcePath = normalizeArtifactPath(sourcePath);
    const requiresExplicitTargetAdapter =
        ((target === 'codex' || target === 'github-copilot') &&
            concept === 'agents' &&
            /^\.metaflow\/agents\/[^/]+\.json$/.test(normalizedSourcePath)) ||
        (target === 'codex' &&
            ((concept === 'projectConfig' &&
                /^\.metaflow\/project-config\/[^/]+\.json$/.test(normalizedSourcePath)) ||
                (concept === 'mcpServers' &&
                    (normalizedSourcePath === '.metaflow/mcp' ||
                        /^\.metaflow\/mcp\/[^/]+\.json$/.test(normalizedSourcePath))) ||
                (concept === 'hooks' &&
                    (normalizedSourcePath === '.metaflow/hooks' ||
                        /^\.metaflow\/hooks\/[^/]+\.json$/.test(normalizedSourcePath)))));
    const materializationMode =
        adapter && !adapter.enabled
            ? 'disabled'
            : requiresExplicitTargetAdapter && !adapter
              ? 'candidate'
            : concept
              ? adapter?.concepts[concept] ?? adapter?.materializationMode
              : adapter?.materializationMode;
    const notes = buildNotes(sourcePath, destinationRelativePath, sourceFormat, target, lossiness);
    if (adapter) {
        notes.push(`target adapter ${adapter.id} selected`);
        if (concept) {
            notes.push(`target adapter concept ${concept}`);
        }
        for (const note of adapter.notes) {
            notes.push(note);
        }
    } else if (requiresExplicitTargetAdapter) {
        if (concept === 'projectConfig') {
            notes.push('target adapter required for managed project config materialization');
        } else if (concept === 'mcpServers') {
            notes.push('target adapter required for managed MCP server materialization');
        } else if (concept === 'hooks') {
            notes.push('target adapter required for managed hook materialization');
        } else {
            notes.push('target adapter required for managed agent materialization');
        }
    }

    return {
        sourceFormat,
        target,
        pathTransformed,
        lossiness,
        notes,
        targetAdapterConcept: concept,
        targetAdapterId: adapter?.id,
        targetAdapterVersion: adapter?.adapterVersion,
        targetAdapterMaterializationMode: materializationMode,
        targetAdapterValidationStatus: adapter?.validationStatus,
        targetAdapterValidationEvidence: adapter?.validationEvidence,
        targetAdapterRequiredPolicyGrants: adapter?.requiredPolicyGrants,
    };
}
