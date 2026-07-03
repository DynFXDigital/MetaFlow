import { Command } from 'commander';
import {
    buildMigrationSuggestionsReport,
    formatMigrationSuggestionsReport,
    resolveLayers,
} from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit } from './common';

interface MigrationSuggestionsOptions {
    json?: boolean;
}

export function registerMigrationSuggestionsCommand(program: Command): void {
    program
        .command('migration-suggestions')
        .description('Suggest non-destructive canonical .metaflow migration candidates')
        .option('--json', 'Output the full migration suggestion report as JSON')
        .action((options: MigrationSuggestionsOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }

            const report = buildMigrationSuggestionsReport(
                resolveLayers(loaded.config, workspaceRoot),
            );
            const payload = options.json
                ? `${JSON.stringify(report, null, 2)}\n`
                : formatMigrationSuggestionsReport(report);
            process.stdout.write(payload);
        });
}
