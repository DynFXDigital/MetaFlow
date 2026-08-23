import * as path from 'path';
import {
    CapabilityAgentPluginManifest,
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
    author?: CapabilityAgentPluginManifest['author'];
    license?: string;
    keywords?: string[];
    homepage?: string;
    repository?: string;
    documentation?: string;
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
    conflictingLayerIds: string[],
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_PLUGIN_DUPLICATE',
        message:
            `Generated marketplace plugin name "${pluginName}" collides for multiple capability plugin manifests: ` +
            conflictingLayerIds.join(', '),
        filePath: pluginJsonPath,
        severity: 'error',
    };
}

function toIdentityMismatchWarning(
    fieldName: 'name' | 'description',
    descriptorValue: string,
    pluginValue: string,
    descriptorPath: string,
    pluginJsonPath: string,
): CapabilityWarning {
    return {
        code: `CAPABILITY_AGENT_PLUGIN_README_${fieldName.toUpperCase()}_MISMATCH`,
        message:
            `README.md ${fieldName} "${descriptorValue}" does not match plugin.json ${fieldName} "${pluginValue}". ` +
            `Align the shared ${fieldName} values in ${descriptorPath} and ${pluginJsonPath}.`,
        filePath: descriptorPath,
        severity: 'warning',
    };
}

function toIdentityMismatchWarnings(
    capability: CapabilityMetadata,
    pluginManifest: CapabilityAgentPluginManifest,
): CapabilityWarning[] {
    if (capability.descriptorKind !== 'readme') {
        return [];
    }

    const warnings: CapabilityWarning[] = [];
    const descriptorName = capability.name?.trim();
    const pluginName = pluginManifest.name?.trim();
    if (
        descriptorName &&
        pluginName &&
        normalizePluginName(descriptorName) !== normalizePluginName(pluginName)
    ) {
        warnings.push(
            toIdentityMismatchWarning(
                'name',
                descriptorName,
                pluginName,
                capability.manifestPath,
                pluginManifest.pluginJsonPath,
            ),
        );
    }

    const descriptorDescription = capability.description?.trim();
    const pluginDescription = pluginManifest.description?.trim();
    if (descriptorDescription && pluginDescription && descriptorDescription !== pluginDescription) {
        warnings.push(
            toIdentityMismatchWarning(
                'description',
                descriptorDescription,
                pluginDescription,
                capability.manifestPath,
                pluginManifest.pluginJsonPath,
            ),
        );
    }

    return warnings;
}

function compareText(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

const PLUGIN_METADATA_KEY_ORDER = [
    'name',
    'version',
    'description',
    'author',
    'license',
    'keywords',
    'homepage',
    'repository',
    'documentation',
    'agents',
    'commands',
    'skills',
    'rules',
    'hooks',
    'mcpServers',
    'lspServers',
    'components',
    'metaflow',
    'pluginHosts',
    'minimumMetaflowVersion',
    'source',
    'owner',
    'plugins',
    'metadata',
] as const;

function compareCanonicalKeys(left: string, right: string): number {
    const leftIndex = PLUGIN_METADATA_KEY_ORDER.indexOf(
        left as (typeof PLUGIN_METADATA_KEY_ORDER)[number],
    );
    const rightIndex = PLUGIN_METADATA_KEY_ORDER.indexOf(
        right as (typeof PLUGIN_METADATA_KEY_ORDER)[number],
    );
    if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
            return 1;
        }
        if (rightIndex === -1) {
            return -1;
        }
        if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
        }
    }
    return compareText(left, right);
}

/**
 * Return a stable JSON-compatible representation of plugin metadata.
 *
 * Object fields use the documented manifest order where known and lexical
 * order for extension fields. String arrays are treated as metadata sets and
 * sorted after their values are recursively canonicalized.
 */
export function canonicalizePluginMetadataJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        const normalized = value.map((entry) => canonicalizePluginMetadataJson(entry));
        return normalized.every((entry) => typeof entry === 'string')
            ? normalized.sort((left, right) => compareText(left as string, right as string))
            : normalized;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(compareCanonicalKeys)) {
        normalized[key] = canonicalizePluginMetadataJson((value as Record<string, unknown>)[key]);
    }
    return normalized;
}

function normalizePluginName(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function compareWarnings(left: CapabilityWarning, right: CapabilityWarning): number {
    const codeComparison = compareText(left.code, right.code);
    if (codeComparison !== 0) {
        return codeComparison;
    }

    const pathComparison = compareText(left.filePath ?? '', right.filePath ?? '');
    if (pathComparison !== 0) {
        return pathComparison;
    }

    return compareText(left.message, right.message);
}

function toMarketplaceSourceWarning(
    pluginName: string,
    pluginJsonPath: string,
    repoRoot: string,
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_MARKETPLACE_MANIFEST_OUTSIDE_REPO',
        message: `Capability plugin "${pluginName}" is outside the repository root "${repoRoot}" and cannot be included in the generated marketplace manifest.`,
        filePath: pluginJsonPath,
        severity: 'error',
    };
}

function toMarketplacePluginSource(repoRoot: string, pluginJsonPath: string): string | undefined {
    const pluginDirectory = path.dirname(pluginJsonPath);
    const relativePath = path.relative(repoRoot, pluginDirectory);
    if (relativePath.length === 0 || relativePath === '.' || relativePath === path.sep) {
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
    const warnings: CapabilityWarning[] = [];

    for (const layer of layers) {
        const capability = layer.capability;
        const pluginManifest = capability?.agentPluginManifest;
        if (
            !capability ||
            capability?.agentPlugin === false ||
            (pluginManifest?.compatibilityProfile !== undefined &&
                pluginManifest.compatibilityProfile !== 'legacy-host') ||
            !pluginManifest?.name ||
            !pluginManifest.version
        ) {
            continue;
        }

        if (hasCapabilityErrors(capability)) {
            continue;
        }

        warnings.push(...toIdentityMismatchWarnings(capability, pluginManifest));

        candidateEntries.push({
            pluginName: pluginManifest.name,
            version: pluginManifest.version,
            displayName: capability.name?.trim() || pluginManifest.name || capability.id,
            description:
                capability.description?.trim() || pluginManifest.description?.trim() || undefined,
            capabilityId: capability.id,
            layerId: layer.layerId,
            repoId: layer.repoId,
            manifestPath: capability.manifestPath,
            pluginJsonPath: pluginManifest.pluginJsonPath,
            pluginHosts: [...pluginManifest.pluginHosts],
            minimumMetaflowVersion: pluginManifest.minimumMetaflowVersion,
            license: pluginManifest.license ?? capability.license,
            author: pluginManifest.author,
            keywords: [...pluginManifest.keywords],
            components: pluginManifest.components ? { ...pluginManifest.components } : undefined,
            homepage: pluginManifest.homepage,
            repository: pluginManifest.repository,
            documentation: pluginManifest.documentation,
            experimental: capability.experimental,
        });
    }

    candidateEntries.sort((left, right) => {
        const pluginComparison = compareText(left.pluginName, right.pluginName);
        if (pluginComparison !== 0) {
            return pluginComparison;
        }
        return compareText(left.layerId, right.layerId);
    });

    const groupedByPluginName = new Map<string, CapabilityPluginCatalogEntry[]>();
    for (const entry of candidateEntries) {
        const grouped = groupedByPluginName.get(entry.pluginName) ?? [];
        grouped.push(entry);
        groupedByPluginName.set(entry.pluginName, grouped);
    }

    const entries: CapabilityPluginCatalogEntry[] = [];
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
        const pluginComparison = compareText(left.pluginName, right.pluginName);
        if (pluginComparison !== 0) {
            return pluginComparison;
        }
        return compareText(left.layerId, right.layerId);
    });

    warnings.sort(compareWarnings);
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
            layerId: entry.layerId,
            pluginJsonPath: entry.pluginJsonPath,
            plugin: {
                name: entry.pluginName,
                source,
                ...(entry.description ? { description: entry.description } : {}),
                ...(entry.version ? { version: entry.version } : {}),
                ...(entry.author ? { author: entry.author } : {}),
                ...(entry.license ? { license: entry.license } : {}),
                ...(entry.keywords && entry.keywords.length > 0
                    ? { keywords: [...entry.keywords] }
                    : {}),
                ...(entry.homepage ? { homepage: entry.homepage } : {}),
                ...(entry.repository ? { repository: entry.repository } : {}),
                ...(entry.documentation ? { documentation: entry.documentation } : {}),
            } satisfies CapabilityPluginMarketplacePluginEntry,
        };
    });

    const groupedByPluginName = new Map<
        string,
        Array<NonNullable<(typeof candidatePlugins)[number]>>
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
            const conflictingLayerIds = grouped
                .map((candidate) => candidate.layerId)
                .sort(compareText);
            for (const candidate of grouped) {
                warnings.push(
                    toMarketplacePluginDuplicateWarning(
                        pluginName,
                        candidate.pluginJsonPath,
                        conflictingLayerIds,
                    ),
                );
            }
            continue;
        }

        plugins.push(grouped[0].plugin);
    }

    plugins.sort((left, right) => compareText(left.name, right.name));
    warnings.sort(compareWarnings);

    const metadata = {
        ...(options.description ? { description: options.description } : {}),
        ...(options.version ? { version: options.version } : {}),
    };

    const normalizedMarketplaceName = options.marketplaceName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const manifest: CapabilityPluginMarketplaceManifest = {
        name: normalizedMarketplaceName || 'metaflow-marketplace',
        owner: {
            name: options.ownerName?.trim() || 'MetaFlow',
        },
        plugins,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };

    return {
        manifest: canonicalizePluginMetadataJson(manifest) as CapabilityPluginMarketplaceManifest,
        warnings,
    };
}
