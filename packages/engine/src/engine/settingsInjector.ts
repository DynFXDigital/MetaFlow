/**
 * Settings injector.
 *
 * Computes VS Code settings paths for settings-injected artifacts.
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
    value: string | string[] | Record<string, boolean>;
}

type LocationMap = Record<string, boolean>;

function toWorkspaceRelative(workspaceRoot: string, targetPath: string): string {
    const relative = path.relative(workspaceRoot, targetPath).replace(/\\/g, '/');
    return relative === '' ? '.' : relative;
}

function toLocationMap(paths: string[]): LocationMap {
    const entries = paths
        .map(p => p.replace(/\\/g, '/'))
        .sort((a, b) => a.localeCompare(b))
        .map(p => [p, true] as const);
    return Object.fromEntries(entries);
}

/**
 * Compute settings entries for settings-injected directories.
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

    // Collect unique settings-backed directories by artifact type
    const settingsDirs = new Map<string, Set<string>>();
    for (const file of effectiveFiles) {
        if (file.classification !== 'settings') {
            continue;
        }
        const normalized = file.relativePath.replace(/\\/g, '/');
        const relativeSegments = normalized.split('/');
        const topDir = relativeSegments[0];
        
        // Navigate up to the artifact type directory (e.g., instructions/, skills/, prompts/)
        // VS Code will scan subdirectories automatically, so we only add the top level
        const levelsUp = relativeSegments.length - 1;
        let artifactTypeDir = file.sourcePath;
        for (let i = 0; i < levelsUp; i++) {
            artifactTypeDir = path.dirname(artifactTypeDir);
        }

        if (!settingsDirs.has(topDir)) {
            settingsDirs.set(topDir, new Set());
        }
        settingsDirs.get(topDir)!.add(artifactTypeDir);
    }

    // Map artifact types to VS Code setting keys
    const settingsMap: Record<string, string[]> = {
        instructions: [
            'chat.instructionsFilesLocations',
            'github.copilot.chat.codeGeneration.instructionFiles',
        ],
        prompts: [
            'chat.promptFilesLocations',
            'github.copilot.chat.promptFiles',
        ],
        agents: [
            'chat.agentFilesLocations',
        ],
        skills: [
            'chat.agentSkillsLocations',
        ],
    };

    for (const [artifactType, dirs] of settingsDirs) {
        const settingKeys = settingsMap[artifactType];
        if (settingKeys) {
            const paths = Array.from(dirs).map(d => toWorkspaceRelative(workspaceRoot, d));
            const locationMap = toLocationMap(paths);
            for (const settingKey of settingKeys) {
                const value = settingKey.startsWith('chat.') ? locationMap : paths;
                entries.push({ key: settingKey, value });
            }
        }
    }

    // Hook file locations (hooks are file-based)
    if (config.hooks) {
        const hookLocations = new Set<string>();

        if (config.hooks.preApply) {
            const preApplyPath = path.isAbsolute(config.hooks.preApply)
                ? config.hooks.preApply
                : path.join(workspaceRoot, config.hooks.preApply);
            hookLocations.add(toWorkspaceRelative(workspaceRoot, preApplyPath));
        }
        if (config.hooks.postApply) {
            const postApplyPath = path.isAbsolute(config.hooks.postApply)
                ? config.hooks.postApply
                : path.join(workspaceRoot, config.hooks.postApply);
            hookLocations.add(toWorkspaceRelative(workspaceRoot, postApplyPath));
        }

        if (hookLocations.size > 0) {
            entries.push({
                key: 'chat.hookFilesLocations',
                value: toLocationMap(Array.from(hookLocations)),
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
        'chat.instructionsFilesLocations',
        'chat.promptFilesLocations',
        'chat.agentFilesLocations',
        'chat.agentSkillsLocations',
        'chat.hookFilesLocations',
        'github.copilot.chat.codeGeneration.instructionFiles',
        'github.copilot.chat.promptFiles',
    ];
}