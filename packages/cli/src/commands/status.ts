import { Command } from 'commander';
import { computeSettingsEntries, resolveLayers } from '@metaflow/engine';
import {
    formatSurfacedConflictWarnings,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolveEffectiveFiles,
    resolveSurfacedFileConflicts,
} from './common';

const DEFAULT_INJECTION_MODE = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
} as const;

type InjectionKey = keyof typeof DEFAULT_INJECTION_MODE;

function summarizeSources(files: Array<{ sourceLayer: string; sourceRepo?: string }>): string[] {
    const counts = new Map<string, number>();

    for (const file of files) {
        const label = file.sourceRepo
            ? `${file.sourceLayer} (${file.sourceRepo})`
            : file.sourceLayer;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }))
        .map(([label, count]) => `${label}: ${count}`);
}

function resolveInjectionModes(config: {
    injection?: Partial<Record<InjectionKey, string>>;
}): Record<InjectionKey, string> {
    return {
        instructions: config.injection?.instructions ?? DEFAULT_INJECTION_MODE.instructions,
        prompts: config.injection?.prompts ?? DEFAULT_INJECTION_MODE.prompts,
        skills: config.injection?.skills ?? DEFAULT_INJECTION_MODE.skills,
        agents: config.injection?.agents ?? DEFAULT_INJECTION_MODE.agents,
        hooks: config.injection?.hooks ?? DEFAULT_INJECTION_MODE.hooks,
    };
}

function summarizeSettingsEntries(
    entries: Array<{ key: string; value: string | string[] | Record<string, boolean> }>,
): string[] {
    return entries
        .map((entry) => {
            const locations = Array.isArray(entry.value)
                ? entry.value
                : typeof entry.value === 'string'
                  ? [entry.value]
                  : Object.keys(entry.value);
            const joinedLocations = locations
                .sort((left, right) => left.localeCompare(right))
                .join(', ');
            return `${entry.key}: ${joinedLocations}`;
        })
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Show overlay status')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config, configPath } = loaded;
            const files = resolveEffectiveFiles(config, workspaceRoot);
            const layers = resolveLayers(config, workspaceRoot);
            const conflicts = resolveSurfacedFileConflicts(config, workspaceRoot);
            const warnings = formatSurfacedConflictWarnings(conflicts);
            const settings = files.filter((f) => f.classification === 'settings').length;
            const synchronized = files.filter((f) => f.classification === 'synchronized').length;
            const authoredCapabilities =
                config.metadataRepos?.flatMap((repo) =>
                    (repo.capabilities ?? []).map((capability) => ({
                        repoId: repo.id,
                        ...capability,
                    })),
                ) ?? [];
            const injectionModes = resolveInjectionModes(config);
            const settingsEntries = computeSettingsEntries(files, workspaceRoot, config);
            const settingsEntrySummary = summarizeSettingsEntries(settingsEntries);
            const sources = summarizeSources(files);
            const resolvedCapabilities = layers
                .map((layer) => ({
                    layerId: layer.layerId,
                    capability: layer.capability,
                }))
                .filter((entry) => entry.capability !== undefined)
                .map((entry) => ({
                    layerId: entry.layerId,
                    id: entry.capability!.id,
                    name: entry.capability!.name,
                    description: entry.capability!.description,
                    license: entry.capability!.license,
                    warnings: entry.capability!.warnings,
                }));

            if (options.json) {
                const data = {
                    configPath,
                    repo: config.metadataRepo?.localPath,
                    repos: config.metadataRepos?.map((r) => ({ id: r.id, localPath: r.localPath })),
                    configuredCapabilities: authoredCapabilities,
                    resolvedCapabilities,
                    surfacedFileConflicts: conflicts,
                    warnings,
                    activeProfile: config.activeProfile ?? null,
                    injection: {
                        modes: injectionModes,
                        settingsEntries,
                    },
                    sources,
                    files: { total: files.length, settings, synchronized },
                };
                console.log(JSON.stringify(data, null, 2));
                return;
            }

            console.log(`Config: ${configPath}`);

            if (config.metadataRepo) {
                console.log(`Repo:   ${config.metadataRepo.localPath}`);
                if (config.metadataRepo.url) {
                    console.log(`URL:    ${config.metadataRepo.url}`);
                }
                if (config.metadataRepo.commit) {
                    console.log(`Commit: ${config.metadataRepo.commit}`);
                }
            } else if (config.metadataRepos) {
                console.log(`Repos:  ${config.metadataRepos.length}`);
                for (const repo of config.metadataRepos) {
                    console.log(`  - ${repo.id}: ${repo.localPath}`);
                    if (repo.url) {
                        console.log(`    URL: ${repo.url}`);
                    }
                    if (repo.commit) {
                        console.log(`    Commit: ${repo.commit}`);
                    }
                }
            }

            if (authoredCapabilities.length > 0) {
                console.log(`Capabilities: ${authoredCapabilities.length}`);
                for (const capability of authoredCapabilities) {
                    const state = capability.enabled === false ? 'disabled' : 'enabled';
                    console.log(`  - ${capability.repoId}/${capability.path} (${state})`);
                }
            }

            if (resolvedCapabilities.length > 0) {
                console.log(`Resolved Capabilities: ${resolvedCapabilities.length}`);
                for (const capability of resolvedCapabilities) {
                    const title = capability.name ?? capability.id;
                    const description = capability.description ?? '(no description)';
                    const license = capability.license ? ` [license: ${capability.license}]` : '';
                    console.log(
                        `  - ${title}: ${description}${license} (layer: ${capability.layerId})`,
                    );
                    for (const warning of capability.warnings) {
                        const location = warning.filePath ? ` [${warning.filePath}]` : '';
                        console.log(`    ! ${warning.code}: ${warning.message}${location}`);
                    }
                }
            }

            if (warnings.length > 0) {
                console.log(`Warnings: ${warnings.length}`);
                for (const warning of warnings) {
                    console.log(`  ! ${warning}`);
                }
            }

            console.log(`Profile: ${config.activeProfile ?? '(none)'}`);
            console.log(
                `Injection: instructions=${injectionModes.instructions}, prompts=${injectionModes.prompts}, skills=${injectionModes.skills}, agents=${injectionModes.agents}, hooks=${injectionModes.hooks}`,
            );
            if (settingsEntrySummary.length > 0) {
                console.log(`Settings Entries: ${settingsEntrySummary.length}`);
                for (const summary of settingsEntrySummary) {
                    console.log(`  - ${summary}`);
                }
            }
            if (sources.length > 0) {
                console.log(`Sources: ${sources.length}`);
                for (const source of sources) {
                    console.log(`  - ${source}`);
                }
            }
            console.log(
                `Files:  ${files.length} total (${settings} settings, ${synchronized} synchronized)`,
            );
        });
}
