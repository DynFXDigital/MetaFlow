import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {
    applyFilters,
    applyExcludedTypeFilters,
    applyProfile,
    classifyFiles,
    buildEffectiveFileMap,
    detectSurfacedFileConflicts,
    formatSurfacedFileConflictMessage,
    resolveLayers,
    loadConfig,
    MetaFlowConfig,
    ConfigLoadResult,
    EffectiveFile,
    SurfacedFileConflict,
    toAuthoredConfig,
} from '@metaflow/engine';

export interface LoadedConfig {
    config: MetaFlowConfig;
    configPath: string;
    workspaceRoot: string;
}

const CONFIG_ROOT_KEYS = new Set([
    'metadataRepo',
    'layers',
    'metadataRepos',
    'layerSources',
    'filters',
    'profiles',
    'activeProfile',
    'injection',
    'settingsInjectionTarget',
    'hooks',
]);

function isMetaFlowConfigDocument(data: unknown): data is MetaFlowConfig {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return false;
    }

    return Object.keys(data as Record<string, unknown>).some((key) => CONFIG_ROOT_KEYS.has(key));
}

function persistAuthoredConfig(configPath: string, config: MetaFlowConfig): void {
    const authoredConfig = toAuthoredConfig(config);
    fs.writeFileSync(configPath, JSON.stringify(authoredConfig, null, 2) + '\n', 'utf-8');
}

export function getWorkspaceRoot(command: { opts: () => { workspace: string } }): string {
    const ws = command.opts().workspace;
    return path.resolve(ws);
}

export function loadConfigOrExit(workspaceRoot: string): LoadedConfig | null {
    const result: ConfigLoadResult = loadConfig(workspaceRoot);
    if (!result.ok) {
        printConfigErrors(result);
        process.exitCode = 1;
        return null;
    }

    if (result.migrated) {
        persistAuthoredConfig(result.configPath, result.config);
        for (const message of result.migrationMessages ?? []) {
            console.warn(`Notice: ${message}`);
        }
    }

    return {
        config: result.config,
        configPath: result.configPath,
        workspaceRoot,
    };
}

export function printConfigErrors(result: ConfigLoadResult): void {
    if (result.ok) {
        return;
    }
    for (const err of result.errors) {
        const pos = err.line !== undefined ? ` (line ${err.line + 1}, col ${err.column ?? 0})` : '';
        console.error(`Error: ${err.message}${pos}`);
    }
}

export function resolveEffectiveFiles(
    config: MetaFlowConfig,
    workspaceRoot: string,
): EffectiveFile[] {
    const layers = resolveLayers(config, workspaceRoot);
    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);
    files = applyExcludedTypeFilters(files, config.layerSources);

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, config.injection, config.layerSources);
    return files;
}

export function resolveSurfacedFileConflicts(
    config: MetaFlowConfig,
    workspaceRoot: string,
): SurfacedFileConflict[] {
    const layers = resolveLayers(config, workspaceRoot);
    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;

    return detectSurfacedFileConflicts(layers, {
        filters: config.filters,
        layerSources: config.layerSources,
        profile,
    });
}

export function formatSurfacedConflictWarnings(conflicts: SurfacedFileConflict[]): string[] {
    return conflicts.map(formatSurfacedFileConflictMessage);
}

export function readConfigJson(configPath: string): unknown {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return jsonc.parse(raw, undefined, { allowTrailingComma: true, disallowComments: false });
}

export function writeConfigJson(configPath: string, data: unknown): void {
    const value = isMetaFlowConfigDocument(data) ? toAuthoredConfig(data) : data;
    fs.writeFileSync(configPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}
