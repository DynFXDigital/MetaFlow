import { Command } from 'commander';
import { apply } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';

export function registerApplyCommand(program: Command): void {
    program
        .command('apply')
        .description('Materialize overlay outputs to .github')
        .option('-f, --force', 'Overwrite drifted files')
        .action((options: { force?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config } = loaded;
            const files = resolveEffectiveFiles(config, workspaceRoot);

            const result = apply({
                workspaceRoot,
                effectiveFiles: files,
                activeProfile: config.activeProfile,
                force: options.force ?? false,
            });

            for (const rel of result.written) {
                console.log(`write  ${rel}`);
            }
            for (const rel of result.removed) {
                console.log(`remove ${rel}`);
            }
            for (const rel of result.skipped) {
                console.log(`skip   ${rel}`);
            }

            if (result.warnings.length > 0) {
                for (const w of result.warnings) {
                    console.warn(`Warning: ${w}`);
                }
            }

            console.log(`\nDone: ${result.written.length} written, ${result.removed.length} removed, ${result.skipped.length} skipped.`);
        });
}