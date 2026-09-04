import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {
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
    LayerContent,
    PiProjectPluginSynchronizationPlan,
    SurfacedFileConflict,
    isPiTargetEnabled,
    planPiProjectPluginSynchronization,
    projectResolvedPiAgentPluginSkills,
    toAuthoredConfig,
} from '@metaflow/engine';

export interface LoadedConfig {
    config: MetaFlowConfig;
    configPath: string;
    workspaceRoot: string;
    migrationRequired: boolean;
}

const CONFIG_ROOT_KEYS = new Set([
    'compatibilityVersion',
    'metadataRepo',
    'layers',
    'metadataRepos',
    'layerSources',
    'profiles',
    'activeProfile',
    'capabilityOverrides',
    'injection',
    'fileNamingStrategy',
    'settingsInjectionTarget',
    'hooks',
    'synchronization',
    'targets',
    'agentPlugins',
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

export function loadConfigOrExit(
    workspaceRoot: string,
    options: { persistMigration?: boolean } = {},
): LoadedConfig | null {
    const result: ConfigLoadResult = loadConfig(workspaceRoot);
    if (!result.ok) {
        printConfigErrors(result);
        process.exitCode = 1;
        return null;
    }

    if (options.persistMigration && result.migrated) {
        persistAuthoredConfig(result.configPath, result.config);
        for (const message of result.migrationMessages ?? []) {
            console.warn(`Notice: ${message}`);
        }
    }

    return {
        config: result.config,
        configPath: result.configPath,
        workspaceRoot,
        migrationRequired: result.migrationRequired === true,
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
    return resolveWorkspaceArtifacts(config, workspaceRoot).effectiveFiles;
}

export interface ResolvedWorkspaceArtifacts {
    layers: LayerContent[];
    effectiveFiles: EffectiveFile[];
}

function projectConfigForActiveCapabilityProfile(config: MetaFlowConfig): MetaFlowConfig {
    const profile = config.activeProfile ? config.profiles?.[config.activeProfile] : undefined;
    if (profile?.enabledCapabilities === undefined || config.layerSources === undefined) {
        return config;
    }
    const selected = new Set(profile.enabledCapabilities);
    return {
        ...config,
        layerSources: config.layerSources.map((source) => ({
            ...source,
            enabled: selected.has(`${source.repoId}:${source.path.replace(/\\/g, '/')}`),
        })),
    };
}

export function resolveWorkspaceArtifacts(
    config: MetaFlowConfig,
    workspaceRoot: string,
): ResolvedWorkspaceArtifacts {
    const effectiveConfig = projectConfigForActiveCapabilityProfile(config);
    const layers = resolveLayers(effectiveConfig, workspaceRoot);
    const fileMap = buildEffectiveFileMap(layers);
    let files = Array.from(fileMap.values());

    const profileName = effectiveConfig.activeProfile;
    const profile =
        profileName && effectiveConfig.profiles ? effectiveConfig.profiles[profileName] : undefined;
    files = applyProfile(files, profile);

    classifyFiles(files, effectiveConfig.injection, effectiveConfig.layerSources);
    return { layers, effectiveFiles: files };
}

export function resolvePiTargetPlan(
    config: MetaFlowConfig,
    workspaceRoot: string,
    layers?: readonly LayerContent[],
): PiProjectPluginSynchronizationPlan {
    const enabled = isPiTargetEnabled(config);
    return planPiProjectPluginSynchronization({
        workspaceRoot,
        enabled,
        ...(enabled
            ? {
                  projection: projectResolvedPiAgentPluginSkills(
                      layers ??
                          resolveLayers(
                              projectConfigForActiveCapabilityProfile(config),
                              workspaceRoot,
                          ),
                  ),
              }
            : {}),
    });
}

export function formatPiTargetDiagnostics(plan: PiProjectPluginSynchronizationPlan): string[] {
    return plan.diagnostics.map((entry) =>
        entry.filePath
            ? `[${entry.code}] ${entry.message} (${entry.filePath})`
            : `[${entry.code}] ${entry.message}`,
    );
}

export function resolveSurfacedFileConflicts(
    config: MetaFlowConfig,
    workspaceRoot: string,
): SurfacedFileConflict[] {
    const layers = resolveLayers(config, workspaceRoot);
    const profileName = config.activeProfile;
    const profile = profileName && config.profiles ? config.profiles[profileName] : undefined;

    return detectSurfacedFileConflicts(layers, {
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
