import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
    buildCodexPackageMarketplacePayload,
    buildGitHubCopilotPackageMarketplacePayload,
    buildPackageMarketplaceCandidatePayload,
    buildPackageMarketplaceEntries,
    buildPackageMarketplaceReport,
} from '@metaflow/engine';
import {
    getWorkspaceRoot,
    loadConfigOrExit,
    resolvePackageManifests,
} from './common';

interface ExportPackageMarketplaceOptions {
    json?: boolean;
    out?: string;
    force?: boolean;
    target?: string;
    format?: string;
    marketplaceName?: string;
}

type PackageMarketplaceExportFormat =
    | 'compact'
    | 'codex-marketplace'
    | 'github-copilot-marketplace';

function normalizeFormat(format: string | undefined): PackageMarketplaceExportFormat {
    if (!format || format === 'compact') {
        return 'compact';
    }
    if (format === 'codex-marketplace' || format === 'github-copilot-marketplace') {
        return format;
    }
    throw new Error(
        'Unsupported package marketplace export format. Use compact, codex-marketplace, or github-copilot-marketplace.',
    );
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

export function registerExportPackageMarketplaceCommand(program: Command): void {
    program
        .command('export-package-marketplace')
        .description('Export package marketplace candidates from canonical MetaFlow package metadata')
        .option('--json', 'Output the full review object instead of compact candidate entries')
        .option(
            '--format <format>',
            'Output format: compact, codex-marketplace, or github-copilot-marketplace',
        )
        .option('--target <target>', 'Only export marketplace entries for one target')
        .option('--marketplace-name <name>', 'Marketplace name for host-shaped marketplace output')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
        .action((options: ExportPackageMarketplaceOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }

            let format: PackageMarketplaceExportFormat;
            try {
                format = normalizeFormat(options.format);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Error: ${message}`);
                process.exitCode = 1;
                return;
            }

            if (options.json && format !== 'compact') {
                console.error('Error: --json cannot be combined with host-shaped --format output.');
                process.exitCode = 1;
                return;
            }

            let formatTarget: string | undefined;
            if (format === 'codex-marketplace') {
                formatTarget = 'codex';
            } else if (format === 'github-copilot-marketplace') {
                formatTarget = 'github-copilot';
            }
            if (options.target && formatTarget && options.target !== formatTarget) {
                console.error(
                    `Error: --format ${format} only supports target "${formatTarget}".`,
                );
                process.exitCode = 1;
                return;
            }

            const packageManifests = resolvePackageManifests(loaded.config, workspaceRoot);
            const entries = buildPackageMarketplaceEntries(
                packageManifests,
                options.target ?? formatTarget,
            );
            if (entries.length === 0) {
                const suffix = options.target ? ` for target "${options.target}"` : '';
                console.error(`Error: No package marketplace entries are configured${suffix}.`);
                process.exitCode = 1;
                return;
            }

            const review = buildPackageMarketplaceReport({
                workspaceRoot,
                manifests: packageManifests,
                target: options.target ?? formatTarget,
                marketplaceName: options.marketplaceName,
                generatedBy: 'metaflow export-package-marketplace',
            });
            for (const warning of review.warnings) {
                console.warn(`Warning: ${warning}`);
            }

            let payloadObject: unknown;
            if (options.json) {
                payloadObject = review;
            } else if (format === 'codex-marketplace') {
                payloadObject = buildCodexPackageMarketplacePayload(
                    workspaceRoot,
                    entries,
                    options.marketplaceName,
                );
            } else if (format === 'github-copilot-marketplace') {
                payloadObject = buildGitHubCopilotPackageMarketplacePayload(
                    workspaceRoot,
                    entries,
                    options.marketplaceName,
                );
            } else {
                payloadObject = buildPackageMarketplaceCandidatePayload(entries);
            }

            const payload = `${JSON.stringify(payloadObject, null, 2)}\n`;

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
                `Wrote package marketplace export: ${path.relative(workspaceRoot, outputPath)}`,
            );
        });
}
