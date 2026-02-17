import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { getWorkspaceRoot } from './common';

export function registerInitCommand(program: Command): void {
    program
        .command('init')
        .description('Generate a starter .metaflow/config.jsonc')
        .option('-f, --force', 'Overwrite existing config')
        .action((options: { force?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');

            if (fs.existsSync(configPath) && !options.force) {
                console.error(`Config already exists: ${configPath}`);
                console.error('Use --force to overwrite.');
                process.exitCode = 1;
                return;
            }

            const template = {
                metadataRepo: {
                    localPath: '../your-metadata-repo',
                    url: 'https://github.com/your-org/your-metadata-repo.git',
                },
                layers: ['company/core'],
                filters: { include: ['**'], exclude: [] },
                profiles: { default: { enable: ['**'] } },
                activeProfile: 'default',
                injection: {
                    instructions: 'settings',
                    prompts: 'settings',
                    skills: 'settings',
                    agents: 'settings',
                    hooks: 'settings',
                },
            };

            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
            console.log(`Created: ${configPath}`);
        });
}