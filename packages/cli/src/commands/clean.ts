import { Command } from 'commander';
import { clean, loadManagedState } from '@metaflow/engine';
import { getWorkspaceRoot } from './common';

function formatTargetLabel(target: string | undefined): string {
    if (!target || target === 'generic' || target === 'metaflow') {
        return '';
    }
    return `[${target}] `;
}

function formatCleanPath(relPath: string, targetsByPath: Map<string, string | undefined>): string {
    return `${formatTargetLabel(targetsByPath.get(relPath))}${relPath}`;
}

export function registerCleanCommand(program: Command): void {
    program
        .command('clean')
        .description('Remove all managed files')
        .action(() => {
            const workspaceRoot = getWorkspaceRoot(program);
            const state = loadManagedState(workspaceRoot);
            const targetsByPath = new Map<string, string | undefined>(
                Object.entries(state.files).map(([relPath, fileState]) => [
                    relPath,
                    fileState.projectionTarget,
                ]),
            );
            const result = clean(workspaceRoot);

            for (const rel of result.removed) {
                console.log(`remove ${formatCleanPath(rel, targetsByPath)}`);
            }
            for (const rel of result.skipped) {
                console.log(`skip   ${formatCleanPath(rel, targetsByPath)}`);
            }

            if (result.warnings.length > 0) {
                for (const w of result.warnings) {
                    console.warn(`Warning: ${w}`);
                }
            }

            console.log(
                `\nDone: ${result.removed.length} removed, ${result.skipped.length} skipped.`,
            );
        });
}
