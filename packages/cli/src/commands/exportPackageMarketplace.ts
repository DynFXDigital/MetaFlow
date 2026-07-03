import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
    getWorkspaceRoot,
    loadConfigOrExit,
    ResolvedPackageManifest,
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

interface PackageMarketplaceCandidateEntry {
    packageId: string;
    target: string;
    packageName?: string;
    title?: string;
    summary?: string;
    publisher?: string;
    categories: string[];
    keywords: string[];
    url?: string;
}

interface PackageMarketplaceReviewEntry extends PackageMarketplaceCandidateEntry {
    sourceLayer: string;
    sourceRepo?: string;
    manifestPath: string;
    sourceRootPath: string;
    warnings: ResolvedPackageManifest['warnings'];
    runtimeValidation: ResolvedPackageManifest['runtimeValidation'];
}

function normalizeMarketplaceName(value: string | undefined, fallback: string): string {
    const normalized = (value ?? fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

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

function findSourceRootFromManifest(manifestPath: string): string {
    const parts = path.resolve(manifestPath).split(path.sep);
    const metaflowIndex = parts.lastIndexOf('.metaflow');
    if (metaflowIndex <= 0) {
        return path.dirname(manifestPath);
    }
    return parts.slice(0, metaflowIndex).join(path.sep);
}

function toWorkspaceRelativePath(workspaceRoot: string, sourceRootPath: string): string {
    const relative = path.relative(workspaceRoot, sourceRootPath).replace(/\\/g, '/');
    if (!relative || relative === '.') {
        return '.';
    }
    return relative.startsWith('../') || relative.startsWith('./') ? relative : `./${relative}`;
}

function filterWarningsForEntry(
    warnings: ResolvedPackageManifest['warnings'],
    target: string,
): ResolvedPackageManifest['warnings'] {
    return warnings.filter((warning) => {
        const isTargetSpecific =
            warning.code.startsWith('PACKAGE_MARKETPLACE_TARGET_') ||
            warning.code.startsWith('PACKAGE_RUNTIME_VALIDATION_');
        if (!isTargetSpecific) {
            return true;
        }
        return warning.message.includes(`"${target}"`);
    });
}

function buildPackageMarketplaceEntries(
    manifests: ResolvedPackageManifest[],
    target?: string,
): PackageMarketplaceReviewEntry[] {
    const entries: PackageMarketplaceReviewEntry[] = [];
    for (const manifest of manifests) {
        for (const entry of manifest.marketplaceEntries) {
            if (target && entry.target !== target) {
                continue;
            }
            entries.push({
                packageId: manifest.id,
                target: entry.target,
                ...(entry.packageName ? { packageName: entry.packageName } : {}),
                ...(entry.title ? { title: entry.title } : {}),
                ...(entry.summary ? { summary: entry.summary } : {}),
                ...(entry.publisher ? { publisher: entry.publisher } : {}),
                categories: entry.categories,
                keywords: entry.keywords,
                ...(entry.url ? { url: entry.url } : {}),
                sourceLayer: manifest.sourceLayer,
                ...(manifest.sourceRepo ? { sourceRepo: manifest.sourceRepo } : {}),
                manifestPath: manifest.manifestPath,
                sourceRootPath: findSourceRootFromManifest(manifest.manifestPath),
                warnings: filterWarningsForEntry(manifest.warnings, entry.target),
                runtimeValidation: manifest.runtimeValidation.filter(
                    (record) => record.target === entry.target,
                ),
            });
        }
    }
    return entries.sort((left, right) => {
        const targetCompare = left.target.localeCompare(right.target);
        if (targetCompare !== 0) {
            return targetCompare;
        }
        const packageCompare = left.packageId.localeCompare(right.packageId);
        if (packageCompare !== 0) {
            return packageCompare;
        }
        return (left.packageName ?? '').localeCompare(right.packageName ?? '');
    });
}

function buildCandidatePayload(entries: PackageMarketplaceReviewEntry[]): {
    marketplaces: Record<string, PackageMarketplaceCandidateEntry[]>;
} {
    const marketplaces: Record<string, PackageMarketplaceCandidateEntry[]> = {};
    for (const entry of entries) {
        marketplaces[entry.target] ??= [];
        marketplaces[entry.target].push({
            packageId: entry.packageId,
            target: entry.target,
            ...(entry.packageName ? { packageName: entry.packageName } : {}),
            ...(entry.title ? { title: entry.title } : {}),
            ...(entry.summary ? { summary: entry.summary } : {}),
            ...(entry.publisher ? { publisher: entry.publisher } : {}),
            categories: entry.categories,
            keywords: entry.keywords,
            ...(entry.url ? { url: entry.url } : {}),
        });
    }
    return { marketplaces };
}

function buildCodexMarketplacePayload(
    workspaceRoot: string,
    entries: PackageMarketplaceReviewEntry[],
    marketplaceName?: string,
): {
    name: string;
    plugins: Array<{
        name: string;
        source: { source: 'local'; path: string };
        policy: { installation: 'AVAILABLE'; authentication: 'ON_INSTALL' };
        category: string;
        interface: { displayName: string; description?: string };
    }>;
} {
    const plugins = entries
        .filter((entry) => entry.target === 'codex')
        .map((entry) => ({
            name: entry.packageName ?? entry.packageId,
            source: {
                source: 'local' as const,
                path: toWorkspaceRelativePath(workspaceRoot, entry.sourceRootPath),
            },
            policy: {
                installation: 'AVAILABLE' as const,
                authentication: 'ON_INSTALL' as const,
            },
            category: entry.categories[0] ?? 'Productivity',
            interface: {
                displayName: entry.title ?? entry.packageName ?? entry.packageId,
                ...(entry.summary ? { description: entry.summary } : {}),
            },
        }));

    return {
        name: normalizeMarketplaceName(marketplaceName, 'metaflow-codex-marketplace'),
        plugins,
    };
}

function buildGitHubCopilotMarketplacePayload(
    workspaceRoot: string,
    entries: PackageMarketplaceReviewEntry[],
    marketplaceName?: string,
): {
    name: string;
    owner: { name: string };
    plugins: Array<{ name: string; source: string; description?: string }>;
} {
    const plugins = entries
        .filter((entry) => entry.target === 'github-copilot')
        .map((entry) => ({
            name: entry.packageName ?? entry.packageId,
            source: toWorkspaceRelativePath(workspaceRoot, entry.sourceRootPath),
            ...(entry.summary ? { description: entry.summary } : {}),
        }));

    return {
        name: normalizeMarketplaceName(marketplaceName, 'metaflow-marketplace'),
        owner: {
            name: path.basename(workspaceRoot),
        },
        plugins,
    };
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

            const review = {
                generatedBy: 'metaflow export-package-marketplace',
                managed: false,
                requiresOperatorReview: true,
                entries,
                warnings: entries.flatMap((entry) =>
                    entry.warnings.map(
                        (warning) => `${entry.packageId}/${entry.target}: ${warning.code}: ${warning.message}`,
                    ),
                ),
            };
            for (const warning of review.warnings) {
                console.warn(`Warning: ${warning}`);
            }

            let payloadObject: unknown;
            if (options.json) {
                payloadObject = review;
            } else if (format === 'codex-marketplace') {
                payloadObject = buildCodexMarketplacePayload(
                    workspaceRoot,
                    entries,
                    options.marketplaceName,
                );
            } else if (format === 'github-copilot-marketplace') {
                payloadObject = buildGitHubCopilotMarketplacePayload(
                    workspaceRoot,
                    entries,
                    options.marketplaceName,
                );
            } else {
                payloadObject = buildCandidatePayload(entries);
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
