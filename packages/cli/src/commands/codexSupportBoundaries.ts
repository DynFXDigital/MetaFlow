import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { buildCodexSupportBoundariesDocument, loadConfig } from '@metaflow/engine';
import {
    getWorkspaceRoot,
    resolveRuntimeEvidenceRecords,
    resolveWorkspaceOutputPath,
} from './common';

interface CodexSupportBoundariesOptions {
    json?: boolean;
    out?: string;
    force?: boolean;
}

export function registerCodexSupportBoundariesCommand(program: Command): void {
    program
        .command('codex-support-boundaries')
        .description('Print Codex file-backed and runtime-only support boundaries')
        .option('--json', 'Output report metadata and Markdown content as JSON')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
        .action((options: CodexSupportBoundariesOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfig(workspaceRoot);
            const runtimeEvidenceRecords = loaded.ok
                ? resolveRuntimeEvidenceRecords(loaded.config, workspaceRoot)
                : [];
            const document = buildCodexSupportBoundariesDocument({
                runtimeEvidenceRecords,
            });
            const payload = options.json
                ? `${JSON.stringify(document, null, 2)}\n`
                : document.content;

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
                `Wrote Codex support boundaries report: ${path.relative(workspaceRoot, outputPath)}`,
            );
        });
}
