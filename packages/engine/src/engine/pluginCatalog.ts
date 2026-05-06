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

function hasCapabilityErrors(capability: CapabilityMetadata | undefined): boolean {
    return (capability?.warnings ?? []).some((warning) => (warning.severity ?? 'warning') === 'error');
}

function toDuplicateWarning(
    packageName: string,
    packageJsonPath: string,
    conflictingLayerIds: string[],
): CapabilityWarning {
    return {
        code: 'CAPABILITY_AGENT_PLUGIN_PACKAGE_DUPLICATE',
        message:
            `Duplicate agent-plugin package name "${packageName}" is declared by multiple capabilities: ` +
            conflictingLayerIds.join(', '),
        filePath: packageJsonPath,
        severity: 'error',
    };
}

export function buildAgentPluginCatalog(layers: LayerContent[]): AgentPluginCatalogResult {
    const candidateEntries: CapabilityPluginCatalogEntry[] = [];

    for (const layer of layers) {
        const capability = layer.capability;
        const pluginPackage = capability?.agentPluginPackage;
        if (!capability?.agentPlugin || !pluginPackage?.name || !pluginPackage.version) {
            continue;
        }

        if (hasCapabilityErrors(capability)) {
            continue;
        }

        candidateEntries.push({
            packageName: pluginPackage.name,
            version: pluginPackage.version,
            displayName: capability.name?.trim() || capability.id,
            description: capability.description?.trim() || pluginPackage.description?.trim() || undefined,
            capabilityId: capability.id,
            layerId: layer.layerId,
            repoId: layer.repoId,
            manifestPath: capability.manifestPath,
            packageJsonPath: pluginPackage.packageJsonPath,
            pluginHosts: [...pluginPackage.pluginHosts],
            minimumMetaflowVersion: pluginPackage.minimumMetaflowVersion,
            license: capability.license,
            experimental: capability.experimental,
        });
    }

    const groupedByPackageName = new Map<string, CapabilityPluginCatalogEntry[]>();
    for (const entry of candidateEntries) {
        const grouped = groupedByPackageName.get(entry.packageName) ?? [];
        grouped.push(entry);
        groupedByPackageName.set(entry.packageName, grouped);
    }

    const entries: CapabilityPluginCatalogEntry[] = [];
    const warnings: CapabilityWarning[] = [];
    for (const [packageName, grouped] of groupedByPackageName) {
        if (grouped.length > 1) {
            const layerIds = grouped.map((entry) => entry.layerId).sort((left, right) => left.localeCompare(right));
            for (const entry of grouped) {
                warnings.push(toDuplicateWarning(packageName, entry.packageJsonPath, layerIds));
            }
            continue;
        }

        entries.push(grouped[0]);
    }

    entries.sort((left, right) => {
        const packageComparison = left.packageName.localeCompare(right.packageName);
        if (packageComparison !== 0) {
            return packageComparison;
        }
        return left.layerId.localeCompare(right.layerId);
    });

    return { entries, warnings };
}