import { Command } from 'commander';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';

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
            const settings = files.filter(f => f.classification === 'settings').length;
            const materialized = files.filter(f => f.classification === 'materialized').length;

            if (options.json) {
                const data = {
                    configPath,
                    repo: config.metadataRepo?.localPath,
                    repos: config.metadataRepos?.map(r => ({ id: r.id, localPath: r.localPath })),
                    layers: config.layers ?? config.layerSources?.map(ls => `${ls.repoId}/${ls.path}`),
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

            console.log(`Profile: ${config.activeProfile ?? '(none)'}`);
            console.log(`Files:  ${files.length} total (${settings} settings, ${materialized} materialized)`);
        });
}