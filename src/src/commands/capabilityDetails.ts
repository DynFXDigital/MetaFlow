import * as fsp from 'fs/promises';
import * as path from 'path';
import {
    getArtifactType,
    loadCapabilityManifestForLayer,
    loadRepoManifestForRoot,
    MetaFlowConfig,
    resolvePathFromWorkspace,
} from '@metaflow/engine';
import {
    InstructionScopeSummary,
    summarizeLayerContentInstructionScope,
    TreeSummaryCache,
} from '../treeSummary';

import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    BuiltInCapabilityRuntimeState,
    normalizeBuiltInLayerPath,
    resolveBuiltInCapabilityDisplayName,
    resolveBuiltInLayerEnabled,
} from '../builtInCapability';
import { projectConfigForProfile } from './commandHelpers';
import { buildCapabilityGovernanceProjection, type GovernanceUiState } from '../governanceSignals';
import { resolveRepoDisplayLabel } from '../repoDisplayLabel';

type DetailArtifactType =
    | 'instructions'
    | 'prompts'
    | 'commands'
    | 'agents'
    | 'skills'
    | 'hooks'
    | 'other';

const DETAIL_ARTIFACT_ORDER: DetailArtifactType[] = [
    'instructions',
    'prompts',
    'commands',
    'agents',
    'skills',
    'hooks',
    'other',
];

export interface CapabilityDetailCommandArg {
    layerIndex?: number;
    layerPath?: string;
    repoId?: string;
    skipPreview?: boolean;
}

export interface CapabilityDetailTarget {
    capabilityId: string;
    layerId: string;
    layerIndex?: number;
    layerPath: string;
    layerRoot: string;
    repoId?: string;
    repoLabel: string;
    enabled: boolean;
    builtIn: boolean;
    fallbackTitle: string;
}

export interface CapabilityDetailArtifactBucket {
    type: DetailArtifactType;
    files: string[];
}

export interface CapabilityDetailAgentPluginManifest {
    pluginJsonPath: string;
    name?: string;
    version?: string;
    description?: string;
    pluginHosts: string[];
    minimumMetaflowVersion?: string;
}

export interface CapabilityDetailModel {
    title: string;
    capabilityId: string;
    description?: string;
    license?: string;
    experimental?: boolean;
    agentPlugin?: boolean;
    agentPluginManifest?: CapabilityDetailAgentPluginManifest;
    layerId: string;
    layerIndex?: number;
    layerPath: string;
    layerRoot: string;
    repoId?: string;
    repoLabel: string;
    manifestPath?: string;
    enabled: boolean;
    builtIn: boolean;
    warnings: string[];
    instructionScopeSummary: InstructionScopeSummary;
    layerFiles: string[];
    artifactBuckets: CapabilityDetailArtifactBucket[];
    artifactCount: number;
    body?: string;
    governance?: {
        summary: string;
        detailLines: string[];
        variant: 'info' | 'warning' | 'error';
    };
}

function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function titleCaseFromId(value: string): string {
    return value
        .split(/[-_/]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function deriveCapabilityIdFromLayerPath(layerPath: string, repoRoot: string): string {
    const normalized = toPosixPath(layerPath).replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

async function collectLayerFiles(layerRoot: string): Promise<string[]> {
    const files: string[] = [];
    const visit = async (currentDir: string): Promise<void> => {
        const entries = await fsp.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }

            const relativePath = toPosixPath(path.relative(layerRoot, absolutePath));
            if (relativePath.length > 0 && relativePath !== 'CAPABILITY.md') {
                files.push(relativePath);
            }
        }
    };

    try {
        await visit(layerRoot);
        return files.sort((left, right) =>
            left.localeCompare(right, undefined, { sensitivity: 'base' }),
        );
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

function buildArtifactBuckets(files: string[]): CapabilityDetailArtifactBucket[] {
    const grouped = new Map<DetailArtifactType, string[]>();
    for (const type of DETAIL_ARTIFACT_ORDER) {
        grouped.set(type, []);
    }

    for (const relativePath of files) {
        const type = getArtifactType(relativePath) as DetailArtifactType;
        grouped.get(type)?.push(relativePath);
    }

    return DETAIL_ARTIFACT_ORDER.map((type) => ({ type, files: grouped.get(type) ?? [] })).filter(
        (bucket) => bucket.files.length > 0,
    );
}

function formatWarning(
    code: string,
    message: string,
    severity?: 'error' | 'warning' | 'info',
): string {
    if (severity === 'error') {
        return `[Error][${code}] ${message}`;
    }
    if (severity === 'info') {
        return `[Info][${code}] ${message}`;
    }
    return `[${code}] ${message}`;
}

export function resolveCapabilityDetailTarget(
    config: MetaFlowConfig,
    workspaceRoot: string,
    builtInCapability: BuiltInCapabilityRuntimeState,
    arg: CapabilityDetailCommandArg,
): CapabilityDetailTarget | undefined {
    const requestedLayerIndex = typeof arg.layerIndex === 'number' ? arg.layerIndex : undefined;
    const requestedLayerPath = arg.layerPath ? toPosixPath(arg.layerPath) : undefined;

    if (arg.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
        if (!builtInCapability.sourceRoot) {
            return undefined;
        }

        const layerPath = normalizeBuiltInLayerPath(
            arg.layerPath ?? BUILT_IN_CAPABILITY_LAYER_PATH,
        );
        const derivedCapabilityId = deriveCapabilityIdFromLayerPath(
            layerPath,
            builtInCapability.sourceRoot,
        );
        const manifest = loadCapabilityManifestForLayer(
            path.join(builtInCapability.sourceRoot, layerPath),
            derivedCapabilityId,
        );
        const fallbackTitle = resolveBuiltInCapabilityDisplayName(
            manifest?.name,
            builtInCapability.sourceDisplayName,
        );
        return {
            capabilityId: manifest?.id ?? derivedCapabilityId,
            layerId: `${BUILT_IN_CAPABILITY_REPO_ID}/${layerPath}`,
            layerPath,
            layerRoot: path.join(builtInCapability.sourceRoot, layerPath),
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            repoLabel: fallbackTitle,
            enabled: resolveBuiltInLayerEnabled(builtInCapability, layerPath),
            builtIn: true,
            fallbackTitle,
        };
    }

    const effectiveConfig = projectConfigForProfile(config);

    if (effectiveConfig.metadataRepos && effectiveConfig.layerSources) {
        let layerIndex = requestedLayerIndex;
        let source =
            typeof layerIndex === 'number' ? effectiveConfig.layerSources[layerIndex] : undefined;

        if (
            requestedLayerPath &&
            (!source ||
                (typeof arg.repoId === 'string' && source.repoId !== arg.repoId) ||
                toPosixPath(source.path) !== requestedLayerPath)
        ) {
            layerIndex = effectiveConfig.layerSources.findIndex(
                (candidate) =>
                    (typeof arg.repoId !== 'string' || candidate.repoId === arg.repoId) &&
                    toPosixPath(candidate.path) === requestedLayerPath,
            );
            source = layerIndex >= 0 ? effectiveConfig.layerSources[layerIndex] : undefined;
        }

        if (!source) {
            return undefined;
        }

        const repo = effectiveConfig.metadataRepos.find(
            (candidate) => candidate.id === source.repoId,
        );
        if (!repo) {
            return undefined;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        const repoLabel = resolveRepoDisplayLabel(
            repo.id,
            repo.name,
            repo.localPath,
            loadRepoManifestForRoot(repoRoot)?.name,
        );
        const derivedCapabilityId = deriveCapabilityIdFromLayerPath(source.path, repoRoot);
        const manifest = loadCapabilityManifestForLayer(
            path.join(repoRoot, source.path),
            derivedCapabilityId,
        );

        return {
            capabilityId: manifest?.id ?? derivedCapabilityId,
            layerId: `${source.repoId}/${source.path}`,
            layerIndex,
            layerPath: source.path,
            layerRoot: path.join(repoRoot, source.path),
            repoId: source.repoId,
            repoLabel,
            enabled: repo.enabled !== false && source.enabled !== false,
            builtIn: false,
            fallbackTitle: manifest?.name?.trim() || titleCaseFromId(derivedCapabilityId),
        };
    }

    if (effectiveConfig.metadataRepos && requestedLayerPath) {
        const repo = effectiveConfig.metadataRepos.find(
            (candidate) => typeof arg.repoId !== 'string' || candidate.id === arg.repoId,
        );
        const capability = repo?.capabilities?.find(
            (candidate) => toPosixPath(candidate.path) === requestedLayerPath,
        );

        if (!repo || !capability) {
            return undefined;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        const repoLabel = resolveRepoDisplayLabel(
            repo.id,
            repo.name,
            repo.localPath,
            loadRepoManifestForRoot(repoRoot)?.name,
        );
        const derivedCapabilityId = deriveCapabilityIdFromLayerPath(capability.path, repoRoot);
        const manifest = loadCapabilityManifestForLayer(
            path.join(repoRoot, capability.path),
            derivedCapabilityId,
        );

        return {
            capabilityId: manifest?.id ?? derivedCapabilityId,
            layerId: `${repo.id}/${capability.path}`,
            layerPath: capability.path,
            layerRoot: path.join(repoRoot, capability.path),
            repoId: repo.id,
            repoLabel,
            enabled: repo.enabled !== false && capability.enabled !== false,
            builtIn: false,
            fallbackTitle: manifest?.name?.trim() || titleCaseFromId(derivedCapabilityId),
        };
    }

    if (config.metadataRepo && config.layers) {
        let layerIndex = requestedLayerIndex;
        let layerPath = typeof layerIndex === 'number' ? config.layers[layerIndex] : undefined;

        if (requestedLayerPath && (!layerPath || toPosixPath(layerPath) !== requestedLayerPath)) {
            layerIndex = config.layers.findIndex(
                (candidate) => toPosixPath(candidate) === requestedLayerPath,
            );
            layerPath = layerIndex >= 0 ? config.layers[layerIndex] : undefined;
        }

        if (typeof layerPath !== 'string') {
            return undefined;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
        const capabilityId = deriveCapabilityIdFromLayerPath(layerPath, repoRoot);
        const manifest = loadCapabilityManifestForLayer(
            path.join(repoRoot, layerPath),
            capabilityId,
        );
        const repoLabel = resolveRepoDisplayLabel(
            'primary',
            config.metadataRepo.name,
            config.metadataRepo.localPath,
            loadRepoManifestForRoot(repoRoot)?.name,
        );

        return {
            capabilityId: manifest?.id ?? capabilityId,
            layerId: layerPath,
            layerIndex,
            layerPath,
            layerRoot: path.join(repoRoot, layerPath),
            repoLabel,
            enabled: true,
            builtIn: false,
            fallbackTitle: manifest?.name?.trim() || titleCaseFromId(capabilityId),
        };
    }

    return undefined;
}

export async function loadCapabilityDetailModel(
    target: CapabilityDetailTarget,
    treeSummaryCache?: TreeSummaryCache,
    governanceState?: GovernanceUiState,
): Promise<CapabilityDetailModel> {
    const manifest = loadCapabilityManifestForLayer(target.layerRoot, target.capabilityId);
    const layerFiles = await collectLayerFiles(target.layerRoot);
    const artifactBuckets = buildArtifactBuckets(layerFiles);
    const warnings = manifest
        ? manifest.warnings.map((warning) =>
              formatWarning(warning.code, warning.message, warning.severity),
          )
        : ['[CAPABILITY_MANIFEST_MISSING] CAPABILITY.md was not found at the layer root.'];
    const instructionScopeSummary = summarizeLayerContentInstructionScope(
        treeSummaryCache,
        target.repoId,
        target.layerPath,
    );
    const governance = buildCapabilityGovernanceProjection(
        target.repoId,
        target.layerPath,
        governanceState ?? {},
    );

    return {
        title: manifest?.name?.trim() || target.fallbackTitle,
        capabilityId: manifest?.id ?? target.capabilityId,
        description: manifest?.description?.trim(),
        license: manifest?.license?.trim(),
        experimental: manifest?.experimental,
        agentPlugin: manifest?.agentPlugin,
        agentPluginManifest: manifest?.agentPluginManifest
            ? {
                  pluginJsonPath: manifest.agentPluginManifest.pluginJsonPath,
                  name: manifest.agentPluginManifest.name,
                  version: manifest.agentPluginManifest.version,
                  description: manifest.agentPluginManifest.description,
                  pluginHosts: manifest.agentPluginManifest.pluginHosts,
                  minimumMetaflowVersion: manifest.agentPluginManifest.minimumMetaflowVersion,
              }
            : undefined,
        layerId: target.layerId,
        layerIndex: target.layerIndex,
        layerPath: target.layerPath,
        layerRoot: target.layerRoot,
        repoId: target.repoId,
        repoLabel: target.repoLabel,
        manifestPath: manifest?.manifestPath,
        enabled: target.enabled,
        builtIn: target.builtIn,
        warnings,
        instructionScopeSummary,
        layerFiles,
        artifactBuckets,
        artifactCount: layerFiles.length,
        body: manifest?.body?.trim(),
        ...(governance.summary
            ? {
                  governance: {
                      summary: governance.summary,
                      detailLines: governance.detailLines,
                      variant: governance.variant ?? 'info',
                  },
              }
            : {}),
    };
}
