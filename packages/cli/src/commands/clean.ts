import { Command } from 'commander';
import { clean } from '@metaflow/engine';
import { getWorkspaceRoot } from './common';

export function registerCleanCommand(program: Command): void {
    program
        .command('clean')
        .description('Remove all managed files')
        .action(() => {
            const workspaceRoot = getWorkspaceRoot(program);
            const result = clean(workspaceRoot);

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

            console.log(`\nDone: ${result.removed.length} removed, ${result.skipped.length} skipped.`);
        });
}