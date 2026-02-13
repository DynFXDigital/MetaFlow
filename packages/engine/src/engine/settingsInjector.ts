/**
 * Settings injector.
 *
 * Computes VS Code settings paths for live-referenced artifacts.
 * Does not import `vscode` — returns a data structure that the extension
 * layer writes via the VS Code settings API.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as path from 'path';
import { EffectiveFile } from './types';
import { MetaFlowConfig } from '../config/configSchema';

/** A settings injection instruction. */
export interface SettingsEntry {
    /** VS Code settings key. */
    key: string;
    /** Value to set (usually a path string or array). */
    value: string | string[];
}

/**
 * Compute settings entries for live-referenced directories.
 *
 * @param effectiveFiles All effective files after overlay/filter/profile.
 * @param workspaceRoot Absolute workspace root.
 * @param config MetaFlow config (for hooks).
 * @returns Array of settings entries to inject.
 */
export function computeSettingsEntries(
    effectiveFiles: EffectiveFile[],
    workspaceRoot: string,
    config: MetaFlowConfig
): SettingsEntry[] {
    const entries: SettingsEntry[] = [];

    // Collect unique live-ref directories by artifact type
    const liveRefDirs = new Map<string, Set<string>>();
    for (const file of effectiveFiles) {
        if (file.classification !== 'live-ref') {
            continue;
        }
        const normalized = file.relativePath.replace(/\\/g, '/');
        const topDir = normalized.split('/')[0];
        const dirPath = path.dirname(file.sourcePath);

        if (!liveRefDirs.has(topDir)) {
            liveRefDirs.set(topDir, new Set());
        }
        liveRefDirs.get(topDir)!.add(dirPath);
    }

    // Map artifact types to VS Code setting keys
    const settingsMap: Record<string, string> = {
        instructions: 'github.copilot.chat.codeGeneration.instructionFiles',
        prompts: 'github.copilot.chat.promptFiles',
    };

    for (const [artifactType, dirs] of liveRefDirs) {
        const settingKey = settingsMap[artifactType];
        if (settingKey) {
            const paths = Array.from(dirs).map(d =>
                path.relative(workspaceRoot, d).replace(/\\/g, '/')
            );
            entries.push({ key: settingKey, value: paths });
        }
    }

    // Hook file paths
    if (config.hooks) {
        if (config.hooks.preApply) {
            entries.push({
                key: 'metaflow.hooks.preApply',
                value: config.hooks.preApply,
            });
        }
        if (config.hooks.postApply) {
            entries.push({
                key: 'metaflow.hooks.postApply',
                value: config.hooks.postApply,
            });
        }
    }

    return entries;
}

/**
 * Compute settings keys that should be removed during clean.
 *
 * @returns Array of settings keys to remove.
 */
export function computeSettingsKeysToRemove(): string[] {
    return [
        'github.copilot.chat.codeGeneration.instructionFiles',
        'github.copilot.chat.promptFiles',
        'metaflow.hooks.preApply',
        'metaflow.hooks.postApply',
    ];
}