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
}

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
    warnings: ResolvedPackageManifest['warnings'];
    runtimeValidation: ResolvedPackageManifest['runtimeValidation'];
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
                warnings: manifest.warnings,
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

export function registerExportPackageMarketplaceCommand(program: Command): void {
    program
        .command('export-package-marketplace')
        .description('Export package marketplace candidates from canonical MetaFlow package metadata')
        .option('--json', 'Output the full review object instead of compact candidate entries')
        .option('--target <target>', 'Only export marketplace entries for one target')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
        .action((options: ExportPackageMarketplaceOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }

            const packageManifests = resolvePackageManifests(loaded.config, workspaceRoot);
            const entries = buildPackageMarketplaceEntries(packageManifests, options.target);
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

            const payload = options.json
                ? `${JSON.stringify(review, null, 2)}\n`
                : `${JSON.stringify(buildCandidatePayload(entries), null, 2)}\n`;

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
