/**
 * Pure helpers for settings injection target resolution and surgical merge/remove.
 *
 * Separated from commandHandlers so they can be unit-tested without vscode mocking.
 * No VS Code imports.
 */

import type { SettingsInjectionTarget } from '@metaflow/engine';

const VALID_INJECTION_TARGETS: readonly SettingsInjectionTarget[] = [
    'user',
    'workspace',
    'workspaceFolder',
];

export function isSettingsInjectionTarget(value: unknown): value is SettingsInjectionTarget {
    return (
        typeof value === 'string' && (VALID_INJECTION_TARGETS as readonly string[]).includes(value)
    );
}

/**
 * Merge MetaFlow entries into existing settings value.
 * Object maps: merge by key union. Arrays: append and deduplicate.
 */
export function mergeSettingsValue(existing: unknown, managed: unknown): unknown {
    if (managed === null || managed === undefined) {
        return existing;
    }

    // Object map merge (e.g., chat.instructionsFilesLocations: { path: true })
    if (typeof managed === 'object' && !Array.isArray(managed)) {
        const base =
            typeof existing === 'object' && existing !== null && !Array.isArray(existing)
                ? { ...(existing as Record<string, unknown>) }
                : {};
        return { ...base, ...(managed as Record<string, unknown>) };
    }

    // Array merge (e.g., github.copilot.chat.codeGeneration.instructionFiles: [path])
    if (Array.isArray(managed)) {
        const base = Array.isArray(existing) ? existing : [];
        const merged = [...base];
        for (const item of managed) {
            if (!merged.includes(item)) {
                merged.push(item);
            }
        }
        return merged;
    }

    return managed;
}

/**
 * Remove MetaFlow-managed entries from an existing settings value.
 * Object maps: remove managed keys. Arrays: remove managed elements.
 * Returns undefined if the result is empty (signals key removal).
 */
export function removeSettingsEntries(existing: unknown, managed: unknown): unknown {
    if (existing === null || existing === undefined) {
        return undefined;
    }

    // Object map: remove managed keys
    if (typeof managed === 'object' && managed !== null && !Array.isArray(managed)) {
        if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
            return undefined;
        }
        const result = { ...(existing as Record<string, unknown>) };
        for (const key of Object.keys(managed as Record<string, unknown>)) {
            delete result[key];
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    // Array: remove managed elements
    if (Array.isArray(managed)) {
        if (!Array.isArray(existing)) {
            return undefined;
        }
        const managedSet = new Set(managed);
        const result = existing.filter((item) => !managedSet.has(item));
        return result.length > 0 ? result : undefined;
    }

    return undefined;
}

const BUNDLED_METAFLOW_SETTING_SUFFIX_BY_KEY: Record<string, string> = {
    'chat.instructionsFilesLocations': '/.github/instructions',
    'github.copilot.chat.codeGeneration.instructionFiles': '/.github/instructions',
    'chat.promptFilesLocations': '/.github/prompts',
    'github.copilot.chat.promptFiles': '/.github/prompts',
    'chat.agentFilesLocations': '/.github/agents',
    'chat.agentSkillsLocations': '/.github/skills',
};

function normalizeSettingsPath(value: string): string {
    return value.replace(/\\/g, '/').toLowerCase();
}

function isBundledMetaFlowPath(value: string, expectedSuffix: string): boolean {
    const normalized = normalizeSettingsPath(value);
    return (
        normalized.includes(
            '/globalstorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata',
        ) && normalized.endsWith(expectedSuffix)
    );
}

function collectRetainedBundledMetaFlowPaths(
    settingKey: string,
    retainedValue: unknown,
): Set<string> {
    const expectedSuffix = BUNDLED_METAFLOW_SETTING_SUFFIX_BY_KEY[settingKey];
    const retained = new Set<string>();
    if (!expectedSuffix || retainedValue === null || retainedValue === undefined) {
        return retained;
    }

    if (Array.isArray(retainedValue)) {
        for (const item of retainedValue) {
            if (typeof item === 'string' && isBundledMetaFlowPath(item, expectedSuffix)) {
                retained.add(normalizeSettingsPath(item));
            }
        }
        return retained;
    }

    if (typeof retainedValue === 'object') {
        for (const key of Object.keys(retainedValue as Record<string, unknown>)) {
            if (isBundledMetaFlowPath(key, expectedSuffix)) {
                retained.add(normalizeSettingsPath(key));
            }
        }
    }

    return retained;
}

export function pruneBundledMetaFlowSettingsEntries(
    existing: unknown,
    settingKey: string,
    retainedValue?: unknown,
): unknown {
    if (existing === null || existing === undefined) {
        return undefined;
    }

    const expectedSuffix = BUNDLED_METAFLOW_SETTING_SUFFIX_BY_KEY[settingKey];
    if (!expectedSuffix) {
        return existing;
    }

    const retained = collectRetainedBundledMetaFlowPaths(settingKey, retainedValue);

    if (Array.isArray(existing)) {
        const result = existing.filter(
            (item) =>
                typeof item !== 'string' ||
                !isBundledMetaFlowPath(item, expectedSuffix) ||
                retained.has(normalizeSettingsPath(item)),
        );
        return result.length > 0 ? result : undefined;
    }

    if (typeof existing === 'object') {
        const result = { ...(existing as Record<string, unknown>) };
        for (const key of Object.keys(result)) {
            if (
                isBundledMetaFlowPath(key, expectedSuffix) &&
                !retained.has(normalizeSettingsPath(key))
            ) {
                delete result[key];
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }

    return existing;
}

/**
 * Resolve the settings injection target from local override, config default, and fallback.
 * Pure logic — caller provides the values read from vscode APIs.
 */
export function resolveTarget(
    localOverride: unknown,
    configDefault: unknown,
    folderCount: number,
): { requested: SettingsInjectionTarget; effective: SettingsInjectionTarget } {
    let requested: SettingsInjectionTarget;
    if (isSettingsInjectionTarget(localOverride)) {
        requested = localOverride;
    } else if (isSettingsInjectionTarget(configDefault)) {
        requested = configDefault;
    } else {
        requested = 'workspace';
    }

    let effective = requested;
    if (requested === 'workspaceFolder' && folderCount <= 1) {
        effective = 'workspace';
    }

    return { requested, effective };
}
