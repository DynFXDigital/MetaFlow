/**
 * Artifact classifier.
 *
 * Classifies each effective file as `settings` or `synchronized` based on
 * artifact type and injection config overrides.
 *
 * Default rules:
 * - instructions/** → settings
 * - prompts/** → settings
 * - skills/** → settings
 * - agents/** → settings
 * - hooks/** → settings
 * - chatmodes/** → synchronized (deprecated, no settings injection)
 * - unknown → synchronized
 *
 * Pure TypeScript — no VS Code imports.
 */

import { InjectionConfig, LayerSource } from '../config/configSchema';
import { normalizeInputPath } from '../config/configPathUtils';
import { ArtifactClassification, EffectiveFile } from './types';

/** Default classification rules per artifact type directory prefix. */
const DEFAULT_CLASSIFICATION: Record<string, ArtifactClassification> = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
    chatmodes: 'synchronized',
};

/**
 * Build a lookup key matching the layerId format used by the overlay engine.
 */
function layerSourceKey(ls: LayerSource): string {
    return `${ls.repoId}/${normalizeInputPath(ls.path)}`;
}

/**
 * Build a map from layerId → resolved InjectionConfig for fast per-file lookup.
 * Each layer source's injection (already flattened: capability > repo by normalization)
 * is merged over the global injection as a sparse override.
 */
function buildInjectionMap(
    layerSources: LayerSource[] | undefined,
    globalInjection: InjectionConfig | undefined,
): Map<string, InjectionConfig> | undefined {
    if (!layerSources?.some((ls) => ls.injection !== undefined)) {
        return undefined; // no per-layer overrides — caller can use global directly
    }
    const map = new Map<string, InjectionConfig>();
    for (const ls of layerSources) {
        if (ls.injection) {
            map.set(layerSourceKey(ls), { ...(globalInjection ?? {}), ...ls.injection });
        }
    }
    return map;
}

/**
 * Resolve the effective injection config for a single file.
 *
 * Precedence: layer-specific injection (capability > repo, already flattened) > global > defaults.
 */
export function resolveFileInjection(
    file: EffectiveFile,
    injectionMap: Map<string, InjectionConfig> | undefined,
    globalInjection: InjectionConfig | undefined,
): InjectionConfig | undefined {
    if (injectionMap && file.sourceLayer) {
        const layerInjection = injectionMap.get(file.sourceLayer);
        if (layerInjection) {
            return layerInjection;
        }
    }
    return globalInjection;
}

/**
 * Classify effective files based on artifact type and injection config.
 *
 * @param files Array of effective files.
 * @param injection Optional injection config overrides (global).
 * @param layerSources Optional layer sources with per-layer injection (for hierarchical resolution).
 * @returns The same files array with classification set (mutated in place).
 */
export function classifyFiles(
    files: EffectiveFile[],
    injection: InjectionConfig | undefined,
    layerSources?: LayerSource[],
): EffectiveFile[] {
    const injectionMap = buildInjectionMap(layerSources, injection);
    for (const file of files) {
        const effective = injectionMap
            ? resolveFileInjection(file, injectionMap, injection)
            : injection;
        file.classification = classifySingle(file.relativePath, effective);
    }
    return files;
}

/**
 * Classify a single file by its relative path.
 *
 * @param relativePath Relative path (forward slashes).
 * @param injection Optional injection config overrides.
 * @returns The artifact classification.
 */
export function classifySingle(
    relativePath: string,
    injection: InjectionConfig | undefined,
): ArtifactClassification {
    const normalized = relativePath.replace(/\\/g, '/');
    const effectivePath = normalized.startsWith('.github/')
        ? normalized.slice('.github/'.length)
        : normalized;
    const topDir = effectivePath.split('/')[0];

    // Deprecated chatmodes remain synchronized-only.
    if (topDir === 'chatmodes') {
        return 'synchronized';
    }

    // Check injection override first
    if (injection) {
        const mode = (injection as Record<string, string | undefined>)[topDir];
        if (mode === 'settings') {
            return 'settings';
        }
        if (mode === 'synchronize') {
            return 'synchronized';
        }
    }

    // Fall back to default rules
    return DEFAULT_CLASSIFICATION[topDir] ?? 'synchronized';
}
