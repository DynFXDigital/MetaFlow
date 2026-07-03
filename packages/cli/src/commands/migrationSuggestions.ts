import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildMigrationSuggestionsReport,
    formatMigrationSuggestionsReport,
    resolveLayers,
} from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveWorkspaceOutputPath } from './common';

interface MigrationSuggestionsOptions {
    json?: boolean;
    out?: string;
    force?: boolean;
}

export function registerMigrationSuggestionsCommand(program: Command): void {
    program
        .command('migration-suggestions')
        .description('Suggest non-destructive canonical .metaflow migration candidates')
        .option('--json', 'Output the full migration suggestion report as JSON')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
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
            if (!options.out) {
                process.stdout.write(payload);
                return;
            }

            let outputPath: string;
            try {
                outputPath = resolveWorkspaceOutputPath(workspaceRoot, options.out);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Error: ${message}`);
                process.exitCode = 1;
                return;
            }

            if (fs.existsSync(outputPath) && !options.force) {
                console.error(
                    `Error: Output file already exists: ${path.relative(workspaceRoot, outputPath)}`,
                );
                console.error('Use --force to overwrite it.');
                process.exitCode = 1;
                return;
            }

            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, payload, 'utf-8');
            console.log(
                `Wrote migration suggestions report: ${path.relative(workspaceRoot, outputPath)}`,
            );
        });
}
