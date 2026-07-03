import { Command } from 'commander';
import { buildCodexSupportBoundariesDocument } from '@metaflow/engine';

interface CodexSupportBoundariesOptions {
    json?: boolean;
}

export function registerCodexSupportBoundariesCommand(program: Command): void {
    program
        .command('codex-support-boundaries')
        .description('Print Codex file-backed and runtime-only support boundaries')
        .option('--json', 'Output report metadata and Markdown content as JSON')
        .action((options: CodexSupportBoundariesOptions) => {
            const document = buildCodexSupportBoundariesDocument();
            if (options.json) {
                console.log(JSON.stringify(document, null, 2));
                return;
            }

            process.stdout.write(document.content);
        });
}
