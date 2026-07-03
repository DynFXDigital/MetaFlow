import * as path from 'path';
import { CapabilityWarning, PackageManifestMetadata } from './types';

export interface ResolvedPackageMarketplaceManifest extends PackageManifestMetadata {
    sourceLayer: string;
    sourceRepo?: string;
}

export interface PackageMarketplaceCandidateEntry {
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

export interface PackageMarketplaceReviewEntry extends PackageMarketplaceCandidateEntry {
    sourceLayer: string;
    sourceRepo?: string;
    manifestPath: string;
    sourceRootPath: string;
    warnings: CapabilityWarning[];
    runtimeValidation: PackageManifestMetadata['runtimeValidation'];
}

export interface CodexPackageMarketplacePayload {
    name: string;
    plugins: Array<{
        name: string;
        source: { source: 'local'; path: string };
        policy: { installation: 'AVAILABLE'; authentication: 'ON_INSTALL' };
        category: string;
        interface: { displayName: string; description?: string };
    }>;
}

export interface GitHubCopilotPackageMarketplacePayload {
    name: string;
    owner: { name: string };
    plugins: Array<{ name: string; source: string; description?: string }>;
}

export interface PackageMarketplaceReport {
    generatedBy: string;
    managed: false;
    requiresOperatorReview: true;
    summary: {
        entries: number;
        targets: Record<string, number>;
    };
    marketplaces: Record<string, PackageMarketplaceCandidateEntry[]>;
    hostPayloads: {
        codex: CodexPackageMarketplacePayload;
        githubCopilot: GitHubCopilotPackageMarketplacePayload;
    };
    entries: PackageMarketplaceReviewEntry[];
    warnings: string[];
}

export function normalizePackageMarketplaceName(
    value: string | undefined,
    fallback: string,
): string {
    const normalized = (value ?? fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
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

function filterWarningsForEntry(warnings: CapabilityWarning[], target: string): CapabilityWarning[] {
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

export function buildPackageMarketplaceEntries(
    manifests: ResolvedPackageMarketplaceManifest[],
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

export function buildPackageMarketplaceCandidatePayload(
    entries: PackageMarketplaceReviewEntry[],
): {
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

export function buildCodexPackageMarketplacePayload(
    workspaceRoot: string,
    entries: PackageMarketplaceReviewEntry[],
    marketplaceName?: string,
): CodexPackageMarketplacePayload {
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
        name: normalizePackageMarketplaceName(marketplaceName, 'metaflow-codex-marketplace'),
        plugins,
    };
}

export function buildGitHubCopilotPackageMarketplacePayload(
    workspaceRoot: string,
    entries: PackageMarketplaceReviewEntry[],
    marketplaceName?: string,
): GitHubCopilotPackageMarketplacePayload {
    const plugins = entries
        .filter((entry) => entry.target === 'github-copilot')
        .map((entry) => ({
            name: entry.packageName ?? entry.packageId,
            source: toWorkspaceRelativePath(workspaceRoot, entry.sourceRootPath),
            ...(entry.summary ? { description: entry.summary } : {}),
        }));

    return {
        name: normalizePackageMarketplaceName(marketplaceName, 'metaflow-marketplace'),
        owner: {
            name: path.basename(workspaceRoot),
        },
        plugins,
    };
}

export function buildPackageMarketplaceReport(options: {
    workspaceRoot: string;
    manifests: ResolvedPackageMarketplaceManifest[];
    target?: string;
    marketplaceName?: string;
    generatedBy: string;
}): PackageMarketplaceReport {
    const entries = buildPackageMarketplaceEntries(options.manifests, options.target);
    const targets: Record<string, number> = {};
    for (const entry of entries) {
        targets[entry.target] = (targets[entry.target] ?? 0) + 1;
    }
    const candidatePayload = buildPackageMarketplaceCandidatePayload(entries);
    return {
        generatedBy: options.generatedBy,
        managed: false,
        requiresOperatorReview: true,
        summary: {
            entries: entries.length,
            targets: Object.fromEntries(
                Object.entries(targets).sort((left, right) =>
                    left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
                ),
            ),
        },
        marketplaces: candidatePayload.marketplaces,
        hostPayloads: {
            codex: buildCodexPackageMarketplacePayload(
                options.workspaceRoot,
                entries,
                options.marketplaceName,
            ),
            githubCopilot: buildGitHubCopilotPackageMarketplacePayload(
                options.workspaceRoot,
                entries,
                options.marketplaceName,
            ),
        },
        entries,
        warnings: entries.flatMap((entry) =>
            entry.warnings.map(
                (warning) => `${entry.packageId}/${entry.target}: ${warning.code}: ${warning.message}`,
            ),
        ),
    };
}
