import { Command } from 'commander';
import { getWorkspaceRoot, loadConfigOrExit, readConfigJson, writeConfigJson, resolveEffectiveFiles } from './common';

export function registerProfileCommand(program: Command): void {
    const profile = program.command('profile').description('Manage activation profiles');

    profile
        .command('list')
        .description('List available profiles')
        .action(() => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config } = loaded;
            const profiles = config.profiles ?? {};
            const names = Object.keys(profiles).sort();
            if (names.length === 0) {
                console.log('No profiles defined.');
                return;
            }
            for (const name of names) {
                const marker = name === config.activeProfile ? ' (active)' : '';
                console.log(`  ${name}${marker}`);
            }
        });

    profile
        .command('set <name>')
        .description('Set the active profile')
        .action((name: string) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config, configPath } = loaded;
            const profiles = config.profiles ?? {};

            if (!profiles[name]) {
                console.error(`Error: profile "${name}" not found.`);
                process.exitCode = 1;
                return;
            }

            const raw = readConfigJson(configPath) as Record<string, unknown>;
            raw.activeProfile = name;
            writeConfigJson(configPath, raw);

            const files = resolveEffectiveFiles({ ...config, activeProfile: name }, workspaceRoot);
            console.log(`Active profile set to "${name}".`);
            console.log(`Effective files: ${files.length}`);
        });
}