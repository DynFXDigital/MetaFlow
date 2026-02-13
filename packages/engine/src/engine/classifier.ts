/**
 * Artifact classifier.
 *
 * Classifies each effective file as `live-ref` or `materialized` based on
 * artifact type and injection config overrides.
 *
 * Default rules:
 * - instructions/** → live-ref
 * - prompts/** → live-ref
 * - skills/** → materialized (or live-ref when injection override is set)
 * - agents/** → materialized (or live-ref when injection override is set)
 * - hooks/** → live-ref
 * - unknown → materialized
 *
 * Pure TypeScript — no VS Code imports.
 */

import { InjectionConfig } from '../config/configSchema';
import { ArtifactClassification, EffectiveFile } from './types';

/** Default classification rules per artifact type directory prefix. */
const DEFAULT_CLASSIFICATION: Record<string, ArtifactClassification> = {
    'instructions': 'live-ref',
    'prompts': 'live-ref',
    'skills': 'materialized',
    'agents': 'materialized',
    'hooks': 'live-ref',
};

/**
 * Classify effective files based on artifact type and injection config.
 *
 * @param files Array of effective files.
 * @param injection Optional injection config overrides.
 * @returns The same files array with classification set (mutated in place).
 */
export function classifyFiles(
    files: EffectiveFile[],
    injection: InjectionConfig | undefined
): EffectiveFile[] {
    for (const file of files) {
        file.classification = classifySingle(file.relativePath, injection);
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
    injection: InjectionConfig | undefined
): ArtifactClassification {
    const normalized = relativePath.replace(/\\/g, '/');
    const topDir = normalized.split('/')[0];

    // Check injection override first
    if (injection) {
        const mode = (injection as Record<string, string | undefined>)[topDir];
        if (mode === 'settings') {
            return 'live-ref';
        }
        if (mode === 'materialize') {
            return 'materialized';
        }
    }

    // Fall back to default rules
    return DEFAULT_CLASSIFICATION[topDir] ?? 'materialized';
}