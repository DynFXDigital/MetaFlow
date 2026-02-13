import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {
    applyFilters,
    applyProfile,
    classifyFiles,
    buildEffectiveFileMap,
    resolveLayers,
    loadConfig,
    MetaFlowConfig,
    ConfigLoadResult,
    EffectiveFile,
} from '@metaflow/engine';

export interface LoadedConfig {
    config: MetaFlowConfig;
    configPath: string;
    workspaceRoot: string;
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

export function resolveEffectiveFiles(config: MetaFlowConfig, workspaceRoot: string): EffectiveFile[] {
    const layers = resolveLayers(config, workspaceRoot);
    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());
    files = applyFilters(files, config.filters);

    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, config.injection);
    return files;
}

export function readConfigJson(configPath: string): unknown {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return jsonc.parse(raw, undefined, { allowTrailingComma: true, disallowComments: false });
}

export function writeConfigJson(configPath: string, data: unknown): void {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}