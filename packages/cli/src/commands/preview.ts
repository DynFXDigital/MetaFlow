import { Command } from 'commander';
import { preview } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';

export function registerPreviewCommand(program: Command): void {
    program
        .command('preview')
        .description('Preview effective files and pending changes')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config } = loaded;
            const files = resolveEffectiveFiles(config, workspaceRoot);
            const changes = preview(workspaceRoot, files);

            if (options.json) {
                const data = {
                    effectiveFiles: files.map(f => ({
                        relativePath: f.relativePath,
                        classification: f.classification,
                        sourceLayer: f.sourceLayer,
                    })),
                    pendingChanges: changes.map(c => ({
                        relativePath: c.relativePath,
                        action: c.action,
                        reason: c.reason ?? null,
                    })),
                };
                console.log(JSON.stringify(data, null, 2));
                return;
            }

            if (files.length === 0) {
                console.log('No files in overlay.');
                return;
            }

            console.log('Effective files:');
            for (const f of files) {
                console.log(`  [${f.classification}] ${f.relativePath}`);
            }

            if (changes.length > 0) {
                console.log(`\nPending changes (${changes.length}):`);
                for (const c of changes) {
                    const suffix = c.reason ? ` (${c.reason})` : '';
                    console.log(`  ${c.action} ${c.relativePath}${suffix}`);
                }
            }
        });
}