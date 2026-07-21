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
        .map((p) => p.replace(/\\/g, '/'))
        .sort((a, b) => a.localeCompare(b))
        .map((p) => [p, true] as const);
    return Object.fromEntries(entries);
}

function resolvePluginRoot(file: EffectiveFile): string | undefined {
    const normalized = file.relativePath.replace(/\\/g, '/');
    const rawSegments = normalized.split('/').filter((segment) => segment.length > 0);
    if (rawSegments.length === 0) {
        return undefined;
    }

    const relativeSegments = rawSegments[0] === '.github' ? rawSegments.slice(1) : rawSegments;
    if (relativeSegments.length === 0) {
        return undefined;
    }

    let currentPath = file.sourcePath;
    for (let index = 0; index < relativeSegments.length; index += 1) {
        currentPath = path.dirname(currentPath);
    }

    if (path.basename(currentPath) === '.github') {
        currentPath = path.dirname(currentPath);
    }

    return currentPath;
}

export function computePluginRootPaths(effectiveFiles: EffectiveFile[]): string[] {
    const pluginRoots = new Set<string>();

    for (const file of effectiveFiles) {
        if (file.classification !== 'plugin') {
            continue;
        }

        const pluginRoot = resolvePluginRoot(file);
        if (pluginRoot) {
            pluginRoots.add(pluginRoot);
        }
    }

    return Array.from(pluginRoots).sort((left, right) => left.localeCompare(right));
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
    config: MetaFlowConfig,
): SettingsEntry[] {
    const entries: SettingsEntry[] = [];

    // Collect unique settings-backed directories by artifact type
    const settingsDirs = new Map<string, Set<string>>();
    const settingsHookFiles = new Set<string>();
    const pluginRoots = computePluginRootPaths(effectiveFiles);
    const pluginRootPaths = new Set(pluginRoots.map((pluginRoot) => path.resolve(pluginRoot)));
    for (const file of effectiveFiles) {
        if (file.classification === 'plugin') {
            continue;
        }

        if (file.classification !== 'settings') {
            continue;
        }
        const normalized = file.relativePath.replace(/\\/g, '/');
        const rawSegments = normalized.split('/');
        const relativeSegments =
            rawSegments[0] === '.github' && rawSegments.length > 1
                ? rawSegments.slice(1)
                : rawSegments;
        const topDir = relativeSegments[0];
        if (topDir === 'hooks' || normalized === 'hooks.json') {
            const hookPluginRoot = resolvePluginRoot(file);
            if (hookPluginRoot && pluginRootPaths.has(path.resolve(hookPluginRoot))) {
                continue;
            }
            settingsHookFiles.add(toWorkspaceRelative(workspaceRoot, file.sourcePath));
            continue;
        }

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
            instructions: ['chat.instructionsFilesLocations'],
            prompts: ['chat.promptFilesLocations'],
        agents: ['chat.agentFilesLocations'],
        skills: ['chat.agentSkillsLocations'],
    };

    for (const [artifactType, dirs] of settingsDirs) {
        const settingKeys = settingsMap[artifactType];
        if (settingKeys) {
            const locationMap = toLocationMap(
                Array.from(dirs).map((d) => toWorkspaceRelative(workspaceRoot, d)),
            );
            const paths = Object.keys(locationMap);
            for (const settingKey of settingKeys) {
                const value = settingKey.startsWith('chat.') ? locationMap : paths;
                entries.push({ key: settingKey, value });
            }
        }
    }

    if (pluginRoots.length > 0) {
        entries.push({
            key: 'chat.pluginLocations',
            value: toLocationMap(
                pluginRoots.map((pluginRoot) => toWorkspaceRelative(workspaceRoot, pluginRoot)),
            ),
        });
    }

    // Hook file locations include settings-backed hook artifacts and legacy script paths.
    const legacyHooks = config.hooks;
    if (settingsHookFiles.size > 0 || legacyHooks) {
        const hookLocations = new Set(settingsHookFiles);

        if (legacyHooks?.preApply) {
            const preApplyPath = path.isAbsolute(legacyHooks.preApply)
                ? legacyHooks.preApply
                : path.join(workspaceRoot, legacyHooks.preApply);
            hookLocations.add(toWorkspaceRelative(workspaceRoot, preApplyPath));
        }
        if (legacyHooks?.postApply) {
            const postApplyPath = path.isAbsolute(legacyHooks.postApply)
                ? legacyHooks.postApply
                : path.join(workspaceRoot, legacyHooks.postApply);
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
        'chat.pluginLocations',
        'chat.instructionsFilesLocations',
        'chat.promptFilesLocations',
        'chat.agentFilesLocations',
        'chat.agentSkillsLocations',
        'chat.hookFilesLocations',
    ];
}
