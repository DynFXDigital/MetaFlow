import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { discoverLayersInRepo, MetaFlowConfig, NamedMetadataRepo, LayerSource } from '@metaflow/engine';

export const BUNDLED_REPO_ID = 'metaflow-bundled';

export type BundledMetadataMode = 'baseline-plus-local' | 'baseline-only' | 'off';
export type BundledMetadataUpdatePolicy = 'pinned-to-extension' | 'manual-refresh';

export interface BundledMetadataSettings {
    enabled: boolean;
    mode: BundledMetadataMode;
    updatePolicy: BundledMetadataUpdatePolicy;
}

export interface BundledMetadataMaterialization {
    targetRoot: string;
    layerPaths: string[];
    updated: boolean;
}

export function normalizeBundledMetadataMode(value: unknown): BundledMetadataMode {
    if (value === 'baseline-only' || value === 'off') {
        return value;
    }
    return 'baseline-plus-local';
}

export function normalizeBundledMetadataUpdatePolicy(value: unknown): BundledMetadataUpdatePolicy {
    if (value === 'manual-refresh') {
        return 'manual-refresh';
    }
    return 'pinned-to-extension';
}

export function readBundledMetadataSettings(
    getValue: <T>(key: string, defaultValue: T) => T
): BundledMetadataSettings {
    return {
        enabled: getValue<boolean>('bundledMetadata.enabled', false),
        mode: normalizeBundledMetadataMode(getValue<string>('bundledMetadata.mode', 'baseline-plus-local')),
        updatePolicy: normalizeBundledMetadataUpdatePolicy(
            getValue<string>('bundledMetadata.updatePolicy', 'pinned-to-extension')
        ),
    };
}

export async function materializeBundledMetadata(options: {
    workspaceRoot: string;
    extensionPath: string;
    extensionVersion: string;
    updatePolicy: BundledMetadataUpdatePolicy;
    forceRefresh?: boolean;
}): Promise<BundledMetadataMaterialization | undefined> {
    const bundledSourceRoot = path.join(options.extensionPath, 'assets', 'bundled-metadata');
    if (!fs.existsSync(bundledSourceRoot)) {
        return undefined;
    }

    const versionFolder = sanitizeVersionFolder(options.extensionVersion);
    const targetRoot = path.join(options.workspaceRoot, '.metaflow', 'system', 'bundled', versionFolder);

    const shouldOverwrite = options.forceRefresh === true || options.updatePolicy === 'pinned-to-extension';
    const shouldCopy = shouldOverwrite || !fs.existsSync(targetRoot);

    if (shouldCopy) {
        await copyDirectory(bundledSourceRoot, targetRoot, shouldOverwrite);
    }

    const layerPaths = discoverLayersInRepo(targetRoot);
    return {
        targetRoot,
        layerPaths,
        updated: shouldCopy,
    };
}

export function mergeConfigWithBundledMetadata(
    config: MetaFlowConfig,
    bundledLocalPath: string,
    bundledLayerPaths: string[],
    mode: Exclude<BundledMetadataMode, 'off'>
): MetaFlowConfig {
    const cloned = cloneConfig(config);
    const normalizedBundledLayerPaths = bundledLayerPaths.length > 0 ? bundledLayerPaths : ['.'];

    const bundledRepo: NamedMetadataRepo = {
        id: BUNDLED_REPO_ID,
        name: 'MetaFlow Bundled Baseline',
        localPath: bundledLocalPath,
        enabled: true,
    };

    const bundledSources: LayerSource[] = normalizedBundledLayerPaths.map(layerPath => ({
        repoId: BUNDLED_REPO_ID,
        path: layerPath,
        enabled: true,
    }));

    if (mode === 'baseline-only') {
        return {
            metadataRepos: [bundledRepo],
            layerSources: bundledSources,
            filters: cloned.filters,
            profiles: cloned.profiles,
            activeProfile: cloned.activeProfile,
            injection: cloned.injection,
            hooks: cloned.hooks,
        };
    }

    const metadataRepos = cloned.metadataRepos ? [...cloned.metadataRepos] : [];
    const layerSources = cloned.layerSources ? [...cloned.layerSources] : [];

    if (!cloned.metadataRepos || !cloned.layerSources) {
        if (cloned.metadataRepo && cloned.layers) {
            metadataRepos.push({
                id: 'primary',
                ...cloned.metadataRepo,
                enabled: true,
            });
            for (const layerPath of cloned.layers) {
                layerSources.push({
                    repoId: 'primary',
                    path: layerPath,
                    enabled: true,
                });
            }
        }
    }

    const metadataReposWithoutBundled = metadataRepos.filter(repo => repo.id !== BUNDLED_REPO_ID);
    const layerSourcesWithoutBundled = layerSources.filter(source => source.repoId !== BUNDLED_REPO_ID);

    return {
        metadataRepos: [bundledRepo, ...metadataReposWithoutBundled],
        layerSources: [...bundledSources, ...layerSourcesWithoutBundled],
        filters: cloned.filters,
        profiles: cloned.profiles,
        activeProfile: cloned.activeProfile,
        injection: cloned.injection,
        hooks: cloned.hooks,
    };
}

function sanitizeVersionFolder(version: string): string {
    const cleaned = version.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
    return cleaned.length > 0 ? cleaned : 'dev';
}

async function copyDirectory(sourceDir: string, targetDir: string, overwrite: boolean): Promise<void> {
    await fsp.mkdir(targetDir, { recursive: true });
    const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(sourcePath, targetPath, overwrite);
            continue;
        }

        if (!overwrite && fs.existsSync(targetPath)) {
            continue;
        }

        await fsp.copyFile(sourcePath, targetPath);
    }
}

function cloneConfig(config: MetaFlowConfig): MetaFlowConfig {
    return JSON.parse(JSON.stringify(config)) as MetaFlowConfig;
}
