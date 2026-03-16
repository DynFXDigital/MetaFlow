import { FilterConfig, LayerSource, ProfileConfig } from '../config/configSchema';
import { applyFilters, applyExcludedTypeFilters } from './filterEngine';
import { applyProfile } from './profileEngine';
import {
    EffectiveFile,
    LayerContent,
    SurfacedFileConflict,
    SurfacedFileConflictSource,
} from './types';

export interface DetectSurfacedFileConflictsOptions {
    filters?: FilterConfig;
    layerSources?: LayerSource[];
    profile?: ProfileConfig;
}

function toEffectiveFileCandidate(
    layer: LayerContent,
    file: { relativePath: string; absolutePath: string },
): EffectiveFile {
    return {
        relativePath: file.relativePath.replace(/\\/g, '/'),
        sourcePath: file.absolutePath,
        sourceLayer: layer.layerId,
        sourceRepo: layer.repoId,
        sourceCapabilityId: layer.capability?.id,
        sourceCapabilityName: layer.capability?.name,
        sourceCapabilityDescription: layer.capability?.description,
        sourceCapabilityLicense: layer.capability?.license,
        classification: 'synchronized',
    };
}

function toConflictSource(file: EffectiveFile): SurfacedFileConflictSource {
    return {
        relativePath: file.relativePath,
        sourcePath: file.sourcePath,
        sourceLayer: file.sourceLayer,
        ...(file.sourceRepo !== undefined ? { sourceRepo: file.sourceRepo } : {}),
        ...(file.sourceCapabilityId !== undefined
            ? { sourceCapabilityId: file.sourceCapabilityId }
            : {}),
        ...(file.sourceCapabilityName !== undefined
            ? { sourceCapabilityName: file.sourceCapabilityName }
            : {}),
    };
}

function formatConflictSourceLabel(source: SurfacedFileConflictSource): string {
    const capabilityLabel = source.sourceCapabilityName ?? source.sourceCapabilityId;
    if (!capabilityLabel || capabilityLabel === source.sourceLayer) {
        return source.sourceLayer;
    }

    return `${capabilityLabel} [${source.sourceLayer}]`;
}

export function formatSurfacedFileConflictMessage(conflict: SurfacedFileConflict): string {
    const contenders = conflict.contenders.map(formatConflictSourceLabel).join(' -> ');
    return `[CAPABILITY_CONFLICT] ${conflict.relativePath} surfaced by ${conflict.contenders.length} enabled capabilities; using ${formatConflictSourceLabel(conflict.winner)}. Contenders: ${contenders}`;
}

export function detectSurfacedFileConflicts(
    layers: LayerContent[],
    options?: DetectSurfacedFileConflictsOptions,
): SurfacedFileConflict[] {
    const candidates: EffectiveFile[] = [];

    for (const layer of layers) {
        for (const file of layer.files) {
            candidates.push(toEffectiveFileCandidate(layer, file));
        }
    }

    let filtered = applyFilters(candidates, options?.filters);
    filtered = applyExcludedTypeFilters(filtered, options?.layerSources);
    filtered = applyProfile(filtered, options?.profile);

    const contendersByPath = new Map<string, EffectiveFile[]>();
    for (const file of filtered) {
        const contenders = contendersByPath.get(file.relativePath) ?? [];
        contenders.push(file);
        contendersByPath.set(file.relativePath, contenders);
    }

    const conflicts: SurfacedFileConflict[] = [];
    for (const [relativePath, contenders] of contendersByPath.entries()) {
        if (contenders.length < 2) {
            continue;
        }

        const normalizedContenders = contenders.map(toConflictSource);
        conflicts.push({
            relativePath,
            winner: normalizedContenders[normalizedContenders.length - 1],
            overridden: normalizedContenders.slice(0, -1),
            contenders: normalizedContenders,
        });
    }

    conflicts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return conflicts;
}
