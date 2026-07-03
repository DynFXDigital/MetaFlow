import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { buildGitHubCopilotMcpHandoff } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveMcpServers } from './common';

interface ExportCopilotMcpOptions {
    json?: boolean;
    out?: string;
    force?: boolean;
}

function isWithinWorkspace(workspaceRoot: string, candidatePath: string): boolean {
    const relative = path.relative(workspaceRoot, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveOutputPath(workspaceRoot: string, outputPath: string): string {
    const resolved = path.isAbsolute(outputPath)
        ? path.resolve(outputPath)
        : path.resolve(workspaceRoot, outputPath);

    if (!isWithinWorkspace(workspaceRoot, resolved)) {
        throw new Error('Output path must stay within the workspace.');
    }

    return resolved;
}

export function registerExportCopilotMcpCommand(program: Command): void {
    program
        .command('export-copilot-mcp')
        .description('Export a GitHub Copilot workspace MCP handoff from canonical MetaFlow MCP metadata')
        .option('--json', 'Output the full handoff object instead of .vscode/mcp.json content')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
        .action((options: ExportCopilotMcpOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }

            const mcpServers = resolveMcpServers(loaded.config, workspaceRoot);
            const handoff = buildGitHubCopilotMcpHandoff(mcpServers);
            if (!handoff) {
                console.error('Error: No canonical MCP server metadata is configured.');
                process.exitCode = 1;
                return;
            }

            for (const warning of handoff.warnings) {
                console.warn(`Warning: ${warning}`);
            }

            const payload = options.json
                ? `${JSON.stringify(handoff, null, 2)}\n`
                : handoff.content;

            if (!options.out) {
                process.stdout.write(payload);
                return;
            }

            let outputPath: string;
            try {
                outputPath = resolveOutputPath(workspaceRoot, options.out);
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
                `Wrote GitHub Copilot MCP handoff: ${path.relative(workspaceRoot, outputPath)}`,
            );
        });
}
