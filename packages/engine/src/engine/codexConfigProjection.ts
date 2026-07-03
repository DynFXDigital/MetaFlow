/**
 * Shared Codex config TOML projection.
 *
 * Codex stores several concept families in `.codex/config.toml`. MetaFlow keeps
 * the canonical concepts separate, so this helper merges supported sections
 * while applying target-adapter materialization per concept.
 */

import {
    CodexProjectConfigMetadata,
    McpServerMetadata,
    TargetAdapterMetadata,
    TargetAdapterMaterializationMode,
    TargetCapabilityConcept,
} from './types';
import {
    codexProjectConfigDestination,
    renderCodexProjectConfigToml,
} from './codexProjectConfig';
import {
    codexMcpProjectionDestination,
    renderCodexMcpConfigToml,
} from './codexMcpProjection';
import { effectiveTargetAdapterMaterializationMode } from './targetAdapter';

const CODEX_CONFIG_PROJECTION_DESTINATION = '.codex/config.toml';

export interface CodexConfigProjection {
    destination: string;
    sourceRelativePath: string;
    sourcePath: string;
    content: string;
}

type ProjectConfigCandidate = {
    config: CodexProjectConfigMetadata;
    sourceRelativePath: string;
    sourcePath: string;
};

type McpCandidate = {
    servers: McpServerMetadata[];
    sourceRelativePath: string;
    sourcePath: string;
};

function selectCodexAdapter(
    targetAdapters: TargetAdapterMetadata[] | undefined,
): TargetAdapterMetadata | undefined {
    return (targetAdapters ?? [])
        .filter((adapter) => adapter.target === 'codex')
        .sort(
            (left, right) =>
                Number(right.enabled) - Number(left.enabled) || left.id.localeCompare(right.id),
        )[0];
}

function materializationModeForConcept(
    concept: TargetCapabilityConcept,
    targetAdapters: TargetAdapterMetadata[] | undefined,
): TargetAdapterMaterializationMode {
    const adapter = selectCodexAdapter(targetAdapters);
    if (!adapter) {
        return 'candidate';
    }
    return effectiveTargetAdapterMaterializationMode(adapter, concept);
}

function isManagedConcept(
    concept: TargetCapabilityConcept,
    targetAdapters: TargetAdapterMetadata[] | undefined,
): boolean {
    return materializationModeForConcept(concept, targetAdapters) === 'managed';
}

function mergeTomlChunks(chunks: string[]): string {
    const normalized = chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
    return normalized.length > 0 ? `${normalized.join('\n\n')}\n` : '';
}

function selectPrimaryManagedSource(
    sources: Array<ProjectConfigCandidate | McpCandidate>,
): ProjectConfigCandidate | McpCandidate {
    return (
        sources.find((source) => source.sourceRelativePath === '.metaflow/mcp') ?? sources[0]
    );
}

function lastProjectableProjectConfig(
    configs: CodexProjectConfigMetadata[],
): ProjectConfigCandidate | undefined {
    const candidates = configs
        .filter((config) => codexProjectConfigDestination(config) === CODEX_CONFIG_PROJECTION_DESTINATION)
        .map((config) => ({
            config,
            sourceRelativePath: `.metaflow/project-config/${config.manifestPath.split(/[\\/]/).pop()}`,
            sourcePath: config.manifestPath,
        }));
    return candidates[candidates.length - 1];
}

function projectableMcpServers(
    servers: McpServerMetadata[],
    sourcePath: string,
): McpCandidate | undefined {
    if (codexMcpProjectionDestination(servers) !== CODEX_CONFIG_PROJECTION_DESTINATION) {
        return undefined;
    }
    return {
        servers,
        sourceRelativePath: '.metaflow/mcp',
        sourcePath,
    };
}

export function renderCodexConfigProjection(
    configs: CodexProjectConfigMetadata[],
    servers: McpServerMetadata[],
    targetAdapters: TargetAdapterMetadata[] | undefined,
    mcpSourcePath: string,
): CodexConfigProjection | undefined {
    const projectConfig = lastProjectableProjectConfig(configs);
    const mcpServers = projectableMcpServers(servers, mcpSourcePath);
    if (!projectConfig && !mcpServers) {
        return undefined;
    }

    const managedChunks: string[] = [];
    const managedSources: Array<ProjectConfigCandidate | McpCandidate> = [];
    if (projectConfig && isManagedConcept('projectConfig', targetAdapters)) {
        managedChunks.push(renderCodexProjectConfigToml(projectConfig.config));
        managedSources.push(projectConfig);
    }
    if (mcpServers && isManagedConcept('mcpServers', targetAdapters)) {
        managedChunks.push(renderCodexMcpConfigToml(mcpServers.servers));
        managedSources.push(mcpServers);
    }

    if (managedChunks.length > 0) {
        const primarySource = selectPrimaryManagedSource(managedSources);
        return {
            destination: CODEX_CONFIG_PROJECTION_DESTINATION,
            sourceRelativePath: primarySource.sourceRelativePath,
            sourcePath: primarySource.sourcePath,
            content: mergeTomlChunks(managedChunks),
        };
    }

    if (projectConfig) {
        return {
            destination: CODEX_CONFIG_PROJECTION_DESTINATION,
            sourceRelativePath: projectConfig.sourceRelativePath,
            sourcePath: projectConfig.sourcePath,
            content: renderCodexProjectConfigToml(projectConfig.config),
        };
    }

    if (mcpServers) {
        return {
            destination: CODEX_CONFIG_PROJECTION_DESTINATION,
            sourceRelativePath: mcpServers.sourceRelativePath,
            sourcePath: mcpServers.sourcePath,
            content: renderCodexMcpConfigToml(mcpServers.servers),
        };
    }

    return undefined;
}

export const codexConfigProjectionConstants = {
    CODEX_CONFIG_PROJECTION_DESTINATION,
};
