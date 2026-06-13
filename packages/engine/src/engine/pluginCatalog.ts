import * as path from 'path';
import {
    CapabilityMetadata,
    CapabilityPluginCatalogEntry,
    CapabilityWarning,
    LayerContent,
} from './types';

export interface AgentPluginCatalogResult {
    entries: CapabilityPluginCatalogEntry[];
    warnings: CapabilityWarning[];
}

export interface CapabilityPluginMarketplacePluginEntry {
    name: string;
    source: string;
    description?: string;
    version?: string;
}

export interface CapabilityPluginMarketplaceManifest {
    name: string;
    owner: {
        name: string;
    };
    plugins: CapabilityPluginMarketplacePluginEntry[];
    metadata?: {
        description?: string;
        version?: string;
    };
}

export interface CapabilityPluginMarketplaceManifestOptions {
    repoRoot: string;
    marketplaceName: string;
    ownerName?: string;
    description?: string;
    version?: string;
}

export interface CapabilityPluginMarketplaceManifestResult {
    manifest: CapabilityPluginMarketplaceManifest;
    warnings: CapabilityWarning[];
}

function hasCapabilityErrors(capability: CapabilityMetadata | undefined): boolean {
    return (capability?.warnings ?? []).some(
        (warning) => (warning.severity ?? 'warning') === 'error',
    );
}

function toDuplicateWarning(
    pluginName: string,
    pluginJsonPath: string,
    conflictingLayerIds: string[],
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_MANIFEST_DUPLICATE',
        message:
            `Duplicate agent-plugin plugin name "${pluginName}" is declared by multiple capabilities: ` +
            conflictingLayerIds.join(', '),
        filePath: pluginJsonPath,
        severity: 'error',
    };
}

function toMarketplacePluginDuplicateWarning(
    pluginName: string,
    pluginJsonPath: string,
    conflictingPluginNames: string[],
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_PLUGIN_DUPLICATE',
        message:
            `Generated marketplace plugin name "${pluginName}" collides for multiple capability plugin manifests: ` +
            conflictingPluginNames.join(', '),
        filePath: pluginJsonPath,
        severity: 'error',
    };
}

function toMarketplaceSourceWarning(
    pluginName: string,
    pluginJsonPath: string,
    repoRoot: string,
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_MANIFEST_OUTSIDE_REPO',
        message:
            `Capability plugin "${pluginName}" is outside the repository root "${repoRoot}" and cannot be included in the generated marketplace manifest.`,
        filePath: pluginJsonPath,
        severity: 'error',
    };
}

function toMarketplacePluginSource(
    repoRoot: string,
    pluginJsonPath: string,
): string | undefined {
    const pluginDirectory = path.dirname(pluginJsonPath);
    const relativePath = path.relative(repoRoot, pluginDirectory);
    if (
        relativePath.length === 0 ||
        relativePath === '.' ||
        relativePath === path.sep
    ) {
        return './';
    }

    const normalized = relativePath.split(path.sep).join('/');
    if (normalized === '..' || normalized.startsWith('../')) {
        return undefined;
    }

    return `./${normalized}`;
}

export function buildAgentPluginCatalog(layers: LayerContent[]): AgentPluginCatalogResult {
    const candidateEntries: CapabilityPluginCatalogEntry[] = [];

    for (const layer of layers) {
        const capability = layer.capability;
        const pluginManifest = capability?.agentPluginManifest;
        if (!capability?.agentPlugin || !pluginManifest?.name || !pluginManifest.version) {
            continue;
        }

        if (hasCapabilityErrors(capability)) {
            continue;
        }

        candidateEntries.push({
            pluginName: pluginManifest.name,
            version: pluginManifest.version,
            displayName: capability.name?.trim() || capability.id,
            description:
                capability.description?.trim() || pluginManifest.description?.trim() || undefined,
            capabilityId: capability.id,
            layerId: layer.layerId,
            repoId: layer.repoId,
            manifestPath: capability.manifestPath,
            pluginJsonPath: pluginManifest.pluginJsonPath,
            pluginHosts: [...pluginManifest.pluginHosts],
            minimumMetaflowVersion: pluginManifest.minimumMetaflowVersion,
            license: capability.license,
            experimental: capability.experimental,
        });
    }

    const groupedByPluginName = new Map<string, CapabilityPluginCatalogEntry[]>();
    for (const entry of candidateEntries) {
        const grouped = groupedByPluginName.get(entry.pluginName) ?? [];
        grouped.push(entry);
        groupedByPluginName.set(entry.pluginName, grouped);
    }

    const entries: CapabilityPluginCatalogEntry[] = [];
    const warnings: CapabilityWarning[] = [];
    for (const [pluginName, grouped] of groupedByPluginName) {
        if (grouped.length > 1) {
            const layerIds = grouped
                .map((entry) => entry.layerId)
                .sort((left, right) => left.localeCompare(right));
            for (const entry of grouped) {
                warnings.push(toDuplicateWarning(pluginName, entry.pluginJsonPath, layerIds));
            }
            continue;
        }

        entries.push(grouped[0]);
    }

    entries.sort((left, right) => {
        const pluginComparison = left.pluginName.localeCompare(right.pluginName);
        if (pluginComparison !== 0) {
            return pluginComparison;
        }
        return left.layerId.localeCompare(right.layerId);
    });

    return { entries, warnings };
}

export function buildCapabilityPluginMarketplaceManifest(
    entries: CapabilityPluginCatalogEntry[],
    options: CapabilityPluginMarketplaceManifestOptions,
): CapabilityPluginMarketplaceManifestResult {
    const warnings: CapabilityWarning[] = [];
    const candidatePlugins = entries.map((entry) => {
        const source = toMarketplacePluginSource(options.repoRoot, entry.pluginJsonPath);
        if (!source) {
            warnings.push(
                toMarketplaceSourceWarning(
                    entry.pluginName,
                    entry.pluginJsonPath,
                    options.repoRoot,
                ),
            );
            return undefined;
        }

        return {
            pluginName: entry.pluginName,
            pluginJsonPath: entry.pluginJsonPath,
            plugin: {
                name: entry.pluginName,
                source,
                ...(entry.description ? { description: entry.description } : {}),
                ...(entry.version ? { version: entry.version } : {}),
            } satisfies CapabilityPluginMarketplacePluginEntry,
        };
    });

    const groupedByPluginName = new Map<
        string,
        Array<
            NonNullable<typeof candidatePlugins[number]>
        >
    >();
    for (const candidate of candidatePlugins) {
        if (!candidate) {
            continue;
        }

        const grouped = groupedByPluginName.get(candidate.plugin.name) ?? [];
        grouped.push(candidate);
        groupedByPluginName.set(candidate.plugin.name, grouped);
    }

    const plugins: CapabilityPluginMarketplacePluginEntry[] = [];
    for (const [pluginName, grouped] of groupedByPluginName) {
        if (grouped.length > 1) {
            const conflictingPluginNames = grouped
                .map((candidate) => candidate.pluginName)
                .sort((left, right) => left.localeCompare(right));
            for (const candidate of grouped) {
                warnings.push(
                    toMarketplacePluginDuplicateWarning(
                        pluginName,
                        candidate.pluginJsonPath,
                        conflictingPluginNames,
                    ),
                );
            }
            continue;
        }

        plugins.push(grouped[0].plugin);
    }

    plugins.sort((left, right) => left.name.localeCompare(right.name));

    const metadata = {
        ...(options.description ? { description: options.description } : {}),
        ...(options.version ? { version: options.version } : {}),
    };

    const normalizedMarketplaceName = options.marketplaceName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return {
        manifest: {
            name: normalizedMarketplaceName || 'metaflow-marketplace',
            owner: {
                name: options.ownerName?.trim() || 'MetaFlow',
            },
            plugins,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
        warnings,
    };
}
