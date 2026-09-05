import { Command } from 'commander';
import {
    applyPiProjectPluginSynchronization,
    clean,
    planPiProjectPluginSynchronization,
} from '@metaflow/engine';
import { formatPiTargetDiagnostics, getWorkspaceRoot } from './common';

export function registerCleanCommand(program: Command): void {
    program
        .command('clean')
        .description('Remove all managed files and project-target output')
        .action(() => {
            const workspaceRoot = getWorkspaceRoot(program);
            try {
                const piPlan = planPiProjectPluginSynchronization({
                    workspaceRoot,
                    enabled: false,
                });
                if (piPlan.blocked) {
                    throw new Error(formatPiTargetDiagnostics(piPlan).join('; '));
                }
                const piResult = applyPiProjectPluginSynchronization({
                    workspaceRoot,
                    enabled: false,
                });
                if (piResult.plan.blocked) {
                    throw new Error(formatPiTargetDiagnostics(piResult.plan).join('; '));
                }
                const result = clean(workspaceRoot);

                for (const rel of result.removed) {
                    console.log(`remove ${rel}`);
                }
                for (const rel of result.skipped) {
                    console.log(`skip   ${rel}`);
                }
                for (const rel of piResult.removed) {
                    console.log(`pi remove ${rel}`);
                }

                if (result.warnings.length > 0) {
                    for (const w of result.warnings) {
                        console.warn(`Warning: ${w}`);
                    }
                }
                for (const diagnostic of formatPiTargetDiagnostics(piResult.plan)) {
                    console.warn(`Pi: ${diagnostic}`);
                }

                console.log(
                    `\nDone: ${result.removed.length} removed, ${result.skipped.length} skipped; Pi ${piResult.removed.length} removed.`,
                );
            } catch (err: unknown) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exitCode = 1;
            }
        });
}
