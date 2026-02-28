import { Command } from 'commander';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';
import { resolveLayers } from '@metaflow/engine';

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
            const settings = files.filter(f => f.classification === 'settings').length;
            const materialized = files.filter(f => f.classification === 'materialized').length;
            const capabilities = layers
                .map(layer => ({
                    layerId: layer.layerId,
                    capability: layer.capability,
                }))
                .filter(entry => entry.capability !== undefined)
                .map(entry => ({
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
                    repos: config.metadataRepos?.map(r => ({ id: r.id, localPath: r.localPath })),
                    layers: config.layers ?? config.layerSources?.map(ls => `${ls.repoId}/${ls.path}`),
                    capabilities,
                    activeProfile: config.activeProfile ?? null,
                    files: { total: files.length, settings, materialized },
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
                }
            }

            if (config.layers) {
                console.log(`Layers: ${config.layers.join(', ')}`);
            } else if (config.layerSources) {
                console.log(`Layer sources: ${config.layerSources.length}`);
            }

            if (capabilities.length > 0) {
                console.log(`Capabilities: ${capabilities.length}`);
                for (const capability of capabilities) {
                    const title = capability.name ?? capability.id;
                    const description = capability.description ?? '(no description)';
                    const license = capability.license ? ` [license: ${capability.license}]` : '';
                    console.log(`  - ${title}: ${description}${license} (layer: ${capability.layerId})`);
                    for (const warning of capability.warnings) {
                        const location = warning.filePath ? ` [${warning.filePath}]` : '';
                        console.log(`    ! ${warning.code}: ${warning.message}${location}`);
                    }
                }
            }

            console.log(`Profile: ${config.activeProfile ?? '(none)'}`);
            console.log(`Files:  ${files.length} total (${settings} settings, ${materialized} materialized)`);
        });
}