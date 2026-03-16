import * as fsp from 'fs/promises';
import * as path from 'path';
import {
    applyProfile,
    EffectiveFile,
    ExcludableArtifactType,
    getArtifactType,
    MetaFlowConfig,
    parseFrontmatter,
    resolvePathFromWorkspace,
} from '@metaflow/engine';
import { BUILT_IN_CAPABILITY_REPO_ID, BuiltInCapabilityRuntimeState } from './builtInCapability';

export type SummaryArtifactType = ExcludableArtifactType;

export const SUMMARY_ARTIFACT_ORDER: SummaryArtifactType[] = [
    'instructions',
    'prompts',
    'agents',
    'skills',
];

export interface ArtifactSummaryCounts {
    active: number;
    available: number;
}

export interface ArtifactSummary {
    totalActive: number;
    totalAvailable: number;
    byType: Record<SummaryArtifactType, ArtifactSummaryCounts>;
}

export interface TreeSummaryRecord {
    repoId: string;
    artifactType: SummaryArtifactType;
    repoRelativePath: string;
    displayPath: string;
    artifactPath: string;
    absolutePath?: string;
}

export type InstructionScopeRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface InstructionScopeAssessment {
    level: InstructionScopeRiskLevel;
    reason: string;
    patterns: string[];
    missingApplyTo: boolean;
}

export interface InstructionScopeRecord {
    repoId: string;
    repoRelativePath: string;
    displayPath: string;
    absolutePath?: string;
    name: string;
    applyTo?: string;
    active: boolean;
    riskLevel: InstructionScopeRiskLevel;
    riskReason: string;
    patterns: string[];
    missingApplyTo: boolean;
}

export interface InstructionScopeSummary {
    inspectedCount: number;
    activeCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    unknownCount: number;
    missingApplyToCount: number;
    activeHighRiskCount: number;
    topRisks: InstructionScopeRecord[];
    status: 'none' | 'low' | 'moderate' | 'elevated';
}

export interface TreeSummaryCache {
    availableRecords: TreeSummaryRecord[];
    currentActiveRecords: TreeSummaryRecord[];
    baseActiveRecords: TreeSummaryRecord[];
    instructionScopeRecords: InstructionScopeRecord[];
    currentInstructionScopeSummary: InstructionScopeSummary;
    profileInstructionScopeSummaries: Record<string, InstructionScopeSummary>;
    profileSummaries: Record<string, ArtifactSummary>;
    currentSummary: ArtifactSummary;
    availableSummary: ArtifactSummary;
}

interface RepoRootDescriptor {
    repoId: string;
    rootPath: string;
}

const EMPTY_SUMMARY_COUNTS = (): ArtifactSummaryCounts => ({ active: 0, available: 0 });

function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function normalizeRelativePath(value: string): string {
    const normalized = toPosixPath(value)
        .replace(/^\.\//, '')
        .replace(/^\/+|\/+$/g, '');
    return normalized || '.';
}

function isKnownArtifactType(value: string): value is SummaryArtifactType {
    return SUMMARY_ARTIFACT_ORDER.includes(value as SummaryArtifactType);
}

function createEmptySummary(): ArtifactSummary {
    return {
        totalActive: 0,
        totalAvailable: 0,
        byType: {
            instructions: EMPTY_SUMMARY_COUNTS(),
            prompts: EMPTY_SUMMARY_COUNTS(),
            agents: EMPTY_SUMMARY_COUNTS(),
            skills: EMPTY_SUMMARY_COUNTS(),
        },
    };
}

function createEmptyInstructionScopeSummary(): InstructionScopeSummary {
    return {
        inspectedCount: 0,
        activeCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        unknownCount: 0,
        missingApplyToCount: 0,
        activeHighRiskCount: 0,
        topRisks: [],
        status: 'none',
    };
}

function cloneSummary(summary: ArtifactSummary): ArtifactSummary {
    return {
        totalActive: summary.totalActive,
        totalAvailable: summary.totalAvailable,
        byType: {
            instructions: { ...summary.byType.instructions },
            prompts: { ...summary.byType.prompts },
            agents: { ...summary.byType.agents },
            skills: { ...summary.byType.skills },
        },
    };
}

function titleCaseArtifactType(type: SummaryArtifactType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function titleCaseRiskLevel(level: InstructionScopeRiskLevel): string {
    return level.charAt(0).toUpperCase() + level.slice(1);
}

function toDisplayRelativePath(relativePath: string): string {
    const parts = toPosixPath(relativePath).split('/').filter(Boolean);
    const githubIndex = parts.indexOf('.github');
    if (githubIndex === -1) {
        return parts.join('/');
    }

    const displayParts = [...parts.slice(0, githubIndex), ...parts.slice(githubIndex + 1)];
    return displayParts.join('/');
}

function getArtifactPath(relativePath: string): string {
    const displayPath = toDisplayRelativePath(relativePath);
    const parts = displayPath.split('/').filter(Boolean);
    const typeIndex = parts.findIndex((part) => isKnownArtifactType(part));
    if (typeIndex === -1) {
        return displayPath;
    }

    return parts.slice(typeIndex + 1).join('/');
}

function getSummaryArtifactType(relativePath: string): SummaryArtifactType | undefined {
    const displayPath = toDisplayRelativePath(relativePath);
    const parts = displayPath.split('/').filter(Boolean);
    const typeSegment = parts.find(isKnownArtifactType);
    return typeSegment;
}

function getRecordKey(repoId: string, repoRelativePath: string): string {
    return `${repoId}:${normalizeRelativePath(repoRelativePath)}`;
}

function splitApplyToPatterns(applyTo: string | undefined): string[] {
    return (applyTo ?? '')
        .split(',')
        .map((pattern) => pattern.trim())
        .filter(Boolean);
}

function compareRiskLevel(
    left: InstructionScopeRiskLevel,
    right: InstructionScopeRiskLevel,
): number {
    const order: Record<InstructionScopeRiskLevel, number> = {
        high: 4,
        unknown: 3,
        medium: 2,
        low: 1,
    };

    return order[left] - order[right];
}

function assessInstructionScopePattern(pattern: string): {
    level: InstructionScopeRiskLevel;
    reason: string;
} {
    const normalizedPattern = pattern.trim().replace(/\\/g, '/');
    const wildcardIndex = normalizedPattern.search(/[*?[]/);
    const prefix =
        wildcardIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, wildcardIndex);
    const prefixSegments = prefix.split('/').filter(Boolean);
    const hasRecursiveWildcard = normalizedPattern.includes('**');
    const startsWithRecursiveWildcard = normalizedPattern.startsWith('**/');
    const endsWithRecursiveWildcard = normalizedPattern.endsWith('/**');

    if (
        normalizedPattern === '**' ||
        normalizedPattern === '**/*' ||
        normalizedPattern === '**/*.*'
    ) {
        return {
            level: 'high',
            reason: 'Repo-wide wildcard pattern.',
        };
    }

    if (wildcardIndex === -1) {
        return {
            level: 'low',
            reason: 'Exact file path match.',
        };
    }

    if (startsWithRecursiveWildcard) {
        return {
            level: 'medium',
            reason: 'Wildcard spans nested folders without an anchored root path.',
        };
    }

    if (endsWithRecursiveWildcard && prefixSegments.length <= 1) {
        return {
            level: 'medium',
            reason: 'Top-level directory wildcard covers a broad subtree.',
        };
    }

    if (hasRecursiveWildcard && prefixSegments.length <= 1) {
        return {
            level: 'medium',
            reason: 'Pattern is only weakly anchored before a recursive wildcard.',
        };
    }

    if (wildcardIndex !== -1 && prefixSegments.length <= 1) {
        return {
            level: 'medium',
            reason: 'Pattern is anchored only to a broad top-level location or file type.',
        };
    }

    return {
        level: 'low',
        reason: 'Pattern is anchored to a specific path or file subset.',
    };
}

export function assessInstructionScope(applyTo: string | undefined): InstructionScopeAssessment {
    const patterns = splitApplyToPatterns(applyTo);

    if (patterns.length === 0) {
        return {
            level: 'high',
            reason: 'Missing applyTo; instruction scope cannot be reviewed or constrained.',
            patterns: [],
            missingApplyTo: true,
        };
    }

    let highestLevel: InstructionScopeRiskLevel = 'low';
    let highestReason = 'Pattern is anchored to a specific path or file subset.';

    for (const pattern of patterns) {
        const assessment = assessInstructionScopePattern(pattern);
        if (compareRiskLevel(assessment.level, highestLevel) > 0) {
            highestLevel = assessment.level;
            highestReason = assessment.reason;
        }
    }

    return {
        level: highestLevel,
        reason: highestReason,
        patterns,
        missingApplyTo: false,
    };
}

function pathStartsWith(candidate: string, prefix: string): boolean {
    const normalizedCandidate = normalizeRelativePath(candidate);
    const normalizedPrefix = normalizeRelativePath(prefix);

    if (normalizedPrefix === '.') {
        return true;
    }

    return (
        normalizedCandidate === normalizedPrefix ||
        normalizedCandidate.startsWith(`${normalizedPrefix}/`)
    );
}

function isPathWithin(targetPath: string, parentPath: string): boolean {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedParent = path.normalize(parentPath);
    return (
        normalizedTarget === normalizedParent ||
        normalizedTarget.startsWith(normalizedParent + path.sep)
    );
}

function buildRepoDescriptors(
    config: MetaFlowConfig | undefined,
    workspaceRoot: string,
    builtInCapability: BuiltInCapabilityRuntimeState,
): RepoRootDescriptor[] {
    const descriptors: RepoRootDescriptor[] = [];
    const seenDescriptors = new Set<string>();

    const pushDescriptor = (repoId: string, rootPath: string): void => {
        const normalizedRootPath = path.normalize(rootPath);
        const descriptorKey = `${repoId}:${normalizedRootPath}`;
        if (seenDescriptors.has(descriptorKey)) {
            return;
        }

        seenDescriptors.add(descriptorKey);
        descriptors.push({
            repoId,
            rootPath: normalizedRootPath,
        });
    };

    if (config?.metadataRepo?.localPath) {
        pushDescriptor(
            'primary',
            resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath),
        );
    }

    for (const repo of config?.metadataRepos ?? []) {
        pushDescriptor(repo.id, resolvePathFromWorkspace(workspaceRoot, repo.localPath));
    }

    if (builtInCapability.sourceRoot) {
        pushDescriptor(BUILT_IN_CAPABILITY_REPO_ID, builtInCapability.sourceRoot);
    }

    return descriptors.sort((left, right) => right.rootPath.length - left.rootPath.length);
}

async function collectAvailableRecordsForRepo(
    root: RepoRootDescriptor,
): Promise<TreeSummaryRecord[]> {
    try {
        await fsp.access(root.rootPath);
    } catch {
        return [];
    }

    const records: TreeSummaryRecord[] = [];
    const visit = async (currentDir: string): Promise<void> => {
        const entries = await fsp.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === '.git' || entry.name === 'node_modules') {
                continue;
            }

            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }

            const repoRelativePath = normalizeRelativePath(
                path.relative(root.rootPath, absolutePath),
            );
            const displayPath = toDisplayRelativePath(repoRelativePath);
            const artifactType = getSummaryArtifactType(repoRelativePath);
            if (!artifactType) {
                continue;
            }

            records.push({
                repoId: root.repoId,
                artifactType,
                repoRelativePath,
                displayPath,
                artifactPath: getArtifactPath(repoRelativePath),
                absolutePath,
            });
        }
    };

    await visit(root.rootPath);
    return records;
}

function deriveRepoRelativePathFromLayer(
    layerPath: string | undefined,
    relativePath: string,
): string {
    const normalizedLayerPath = normalizeRelativePath(layerPath ?? '.');
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    if (normalizedLayerPath === '.') {
        return normalizedRelativePath;
    }

    return normalizeRelativePath(path.posix.join(normalizedLayerPath, normalizedRelativePath));
}

function resolveRecordFromEffectiveFile(
    file: EffectiveFile,
    repoDescriptors: RepoRootDescriptor[],
): TreeSummaryRecord | undefined {
    const artifactType = getArtifactType(file.relativePath);
    if (!isKnownArtifactType(artifactType)) {
        return undefined;
    }

    const sourcePath =
        typeof file.sourcePath === 'string' ? path.normalize(file.sourcePath) : undefined;
    const sourceRepo =
        typeof file.sourceRepo === 'string' ? path.normalize(file.sourceRepo) : undefined;
    const sourceLayer = typeof file.sourceLayer === 'string' ? file.sourceLayer : '.';

    let matchedRepo = repoDescriptors.find((descriptor) => {
        if (sourcePath && isPathWithin(sourcePath, descriptor.rootPath)) {
            return true;
        }

        if (sourceRepo && isPathWithin(sourceRepo, descriptor.rootPath)) {
            return true;
        }

        return sourceLayer === descriptor.repoId || sourceLayer.startsWith(`${descriptor.repoId}/`);
    });

    if (!matchedRepo && repoDescriptors.length === 1) {
        matchedRepo = repoDescriptors[0];
    }

    if (!matchedRepo) {
        return undefined;
    }

    let repoRelativePath: string;
    if (sourcePath && isPathWithin(sourcePath, matchedRepo.rootPath)) {
        repoRelativePath = normalizeRelativePath(path.relative(matchedRepo.rootPath, sourcePath));
    } else {
        let layerPath = '.';
        const normalizedSourceLayer = normalizeRelativePath(sourceLayer);
        if (
            sourceLayer &&
            path.isAbsolute(sourceLayer) &&
            isPathWithin(sourceLayer, matchedRepo.rootPath)
        ) {
            layerPath = normalizeRelativePath(path.relative(matchedRepo.rootPath, sourceLayer));
        } else if (normalizedSourceLayer === matchedRepo.repoId || normalizedSourceLayer === '.') {
            layerPath = '.';
        } else if (normalizedSourceLayer.startsWith(`${matchedRepo.repoId}/`)) {
            layerPath = normalizeRelativePath(
                normalizedSourceLayer.slice(matchedRepo.repoId.length + 1),
            );
        } else {
            layerPath = normalizedSourceLayer;
        }

        repoRelativePath = deriveRepoRelativePathFromLayer(layerPath, file.relativePath);
    }

    return {
        repoId: matchedRepo.repoId,
        artifactType,
        repoRelativePath,
        displayPath: toDisplayRelativePath(repoRelativePath),
        artifactPath: getArtifactPath(repoRelativePath),
        absolutePath: sourcePath,
    };
}

function toRecords(
    files: EffectiveFile[],
    repoDescriptors: RepoRootDescriptor[],
): TreeSummaryRecord[] {
    return files
        .map((file) => resolveRecordFromEffectiveFile(file, repoDescriptors))
        .filter((record): record is TreeSummaryRecord => record !== undefined);
}

function summarize(
    activeRecords: TreeSummaryRecord[],
    availableRecords: TreeSummaryRecord[],
): ArtifactSummary {
    const summary = createEmptySummary();

    for (const record of activeRecords) {
        summary.byType[record.artifactType].active += 1;
        summary.totalActive += 1;
    }

    for (const record of availableRecords) {
        summary.byType[record.artifactType].available += 1;
        summary.totalAvailable += 1;
    }

    return summary;
}

function compareInstructionScopeRecords(
    left: InstructionScopeRecord,
    right: InstructionScopeRecord,
): number {
    const severityDelta = compareRiskLevel(right.riskLevel, left.riskLevel);
    if (severityDelta !== 0) {
        return severityDelta;
    }

    if (left.active !== right.active) {
        return left.active ? -1 : 1;
    }

    return left.displayPath.localeCompare(right.displayPath, undefined, { sensitivity: 'base' });
}

async function buildInstructionScopeRecords(
    availableRecords: TreeSummaryRecord[],
    currentActiveRecords: TreeSummaryRecord[],
): Promise<InstructionScopeRecord[]> {
    const activeKeys = new Set(
        currentActiveRecords
            .filter((record) => record.artifactType === 'instructions')
            .map((record) => getRecordKey(record.repoId, record.repoRelativePath)),
    );

    const results = await Promise.all(
        availableRecords
            .filter((record) => record.artifactType === 'instructions')
            .map(async (record) => {
                const active = activeKeys.has(getRecordKey(record.repoId, record.repoRelativePath));
                const fallbackName = path.posix.basename(
                    record.displayPath || record.repoRelativePath,
                );

                if (!record.absolutePath) {
                    return {
                        repoId: record.repoId,
                        repoRelativePath: record.repoRelativePath,
                        displayPath: record.displayPath,
                        absolutePath: record.absolutePath,
                        name: fallbackName,
                        applyTo: undefined,
                        active,
                        riskLevel: 'unknown',
                        riskReason: 'Instruction file could not be read to inspect applyTo.',
                        patterns: [],
                        missingApplyTo: false,
                    } satisfies InstructionScopeRecord;
                }

                try {
                    const parsed = parseFrontmatter(
                        await fsp.readFile(record.absolutePath, 'utf-8'),
                    );
                    const fields = parsed?.fields;
                    const assessment = assessInstructionScope(fields?.applyTo);

                    return {
                        repoId: record.repoId,
                        repoRelativePath: record.repoRelativePath,
                        displayPath: record.displayPath,
                        absolutePath: record.absolutePath,
                        name: fields?.name?.trim() || fallbackName,
                        applyTo: fields?.applyTo?.trim() || undefined,
                        active,
                        riskLevel: assessment.level,
                        riskReason: assessment.reason,
                        patterns: assessment.patterns,
                        missingApplyTo: assessment.missingApplyTo,
                    } satisfies InstructionScopeRecord;
                } catch {
                    return {
                        repoId: record.repoId,
                        repoRelativePath: record.repoRelativePath,
                        displayPath: record.displayPath,
                        absolutePath: record.absolutePath,
                        name: fallbackName,
                        applyTo: undefined,
                        active,
                        riskLevel: 'unknown',
                        riskReason: 'Instruction file could not be read to inspect applyTo.',
                        patterns: [],
                        missingApplyTo: false,
                    } satisfies InstructionScopeRecord;
                }
            }),
    );

    return results.sort(compareInstructionScopeRecords);
}

function summarizeInstructionScopeRecords(
    records: InstructionScopeRecord[],
    activeKeys?: Set<string>,
): InstructionScopeSummary {
    if (records.length === 0) {
        return createEmptyInstructionScopeSummary();
    }

    const summary = createEmptyInstructionScopeSummary();

    for (const record of records) {
        const isActive = activeKeys
            ? activeKeys.has(getRecordKey(record.repoId, record.repoRelativePath))
            : record.active;

        summary.inspectedCount += 1;
        if (isActive) {
            summary.activeCount += 1;
        }

        if (record.missingApplyTo) {
            summary.missingApplyToCount += 1;
        }

        switch (record.riskLevel) {
            case 'high':
                summary.highRiskCount += 1;
                if (isActive) {
                    summary.activeHighRiskCount += 1;
                }
                break;
            case 'medium':
                summary.mediumRiskCount += 1;
                break;
            case 'unknown':
                summary.unknownCount += 1;
                break;
            case 'low':
            default:
                summary.lowRiskCount += 1;
                break;
        }
    }

    summary.topRisks = records
        .filter((record) => record.riskLevel !== 'low')
        .sort(compareInstructionScopeRecords)
        .slice(0, 3);

    if (summary.highRiskCount > 0 || summary.unknownCount > 0) {
        summary.status = 'elevated';
    } else if (summary.mediumRiskCount > 0) {
        summary.status = 'moderate';
    } else {
        summary.status = 'low';
    }

    return summary;
}

export async function buildTreeSummaryCache(
    config: MetaFlowConfig | undefined,
    workspaceRoot: string | undefined,
    effectiveFiles: EffectiveFile[],
    baseProfileFiles: EffectiveFile[],
    builtInCapability: BuiltInCapabilityRuntimeState,
): Promise<TreeSummaryCache> {
    if (!workspaceRoot) {
        const empty = createEmptySummary();
        return {
            availableRecords: [],
            currentActiveRecords: [],
            baseActiveRecords: [],
            instructionScopeRecords: [],
            currentInstructionScopeSummary: createEmptyInstructionScopeSummary(),
            profileInstructionScopeSummaries: {},
            profileSummaries: {},
            currentSummary: cloneSummary(empty),
            availableSummary: cloneSummary(empty),
        };
    }

    const repoDescriptors = buildRepoDescriptors(config, workspaceRoot, builtInCapability);
    const availableRecords = (
        await Promise.all(repoDescriptors.map(collectAvailableRecordsForRepo))
    ).flat();
    const currentActiveRecords = toRecords(effectiveFiles, repoDescriptors);
    const baseActiveRecords = toRecords(baseProfileFiles, repoDescriptors);
    const instructionScopeRecords = await buildInstructionScopeRecords(
        availableRecords,
        currentActiveRecords,
    );
    const availableSummary = summarize([], availableRecords);
    const currentSummary = summarize(currentActiveRecords, availableRecords);
    const profileSummaries: Record<string, ArtifactSummary> = {};
    const profileInstructionScopeSummaries: Record<string, InstructionScopeSummary> = {};
    const currentInstructionScopeSummary =
        summarizeInstructionScopeRecords(instructionScopeRecords);

    for (const [profileName, profile] of Object.entries(config?.profiles ?? {})) {
        const profileRecords = toRecords(applyProfile(baseProfileFiles, profile), repoDescriptors);
        profileSummaries[profileName] = summarize(profileRecords, availableRecords);
        profileInstructionScopeSummaries[profileName] = summarizeInstructionScopeRecords(
            instructionScopeRecords,
            new Set(
                profileRecords
                    .filter((record) => record.artifactType === 'instructions')
                    .map((record) => getRecordKey(record.repoId, record.repoRelativePath)),
            ),
        );
    }

    return {
        availableRecords,
        currentActiveRecords,
        baseActiveRecords,
        instructionScopeRecords,
        currentInstructionScopeSummary,
        profileInstructionScopeSummaries,
        profileSummaries,
        currentSummary,
        availableSummary,
    };
}

export function summarizeRepo(
    cache: TreeSummaryCache | undefined,
    repoId: string,
): ArtifactSummary {
    if (!cache) {
        return createEmptySummary();
    }

    return summarize(
        cache.currentActiveRecords.filter((record) => record.repoId === repoId),
        cache.availableRecords.filter((record) => record.repoId === repoId),
    );
}

export function summarizeLayerPrefix(
    cache: TreeSummaryCache | undefined,
    repoId: string | undefined,
    prefix: string,
): ArtifactSummary {
    if (!cache || !repoId) {
        return createEmptySummary();
    }

    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarize(
        cache.currentActiveRecords.filter(
            (record) =>
                record.repoId === repoId &&
                pathStartsWith(record.repoRelativePath, normalizedPrefix),
        ),
        cache.availableRecords.filter(
            (record) =>
                record.repoId === repoId &&
                pathStartsWith(record.repoRelativePath, normalizedPrefix),
        ),
    );
}

export function summarizeDisplayPrefix(
    cache: TreeSummaryCache | undefined,
    repoId: string | undefined,
    prefix: string,
): ArtifactSummary {
    if (!cache || !repoId) {
        return createEmptySummary();
    }

    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarize(
        cache.currentActiveRecords.filter(
            (record) =>
                record.repoId === repoId && pathStartsWith(record.displayPath, normalizedPrefix),
        ),
        cache.availableRecords.filter(
            (record) =>
                record.repoId === repoId && pathStartsWith(record.displayPath, normalizedPrefix),
        ),
    );
}

export function summarizeArtifactPrefix(
    cache: TreeSummaryCache | undefined,
    artifactType: SummaryArtifactType,
    prefix: string,
): ArtifactSummary {
    if (!cache) {
        return createEmptySummary();
    }

    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarize(
        cache.currentActiveRecords.filter(
            (record) =>
                record.artifactType === artifactType &&
                pathStartsWith(record.artifactPath || '.', normalizedPrefix),
        ),
        cache.availableRecords.filter(
            (record) =>
                record.artifactType === artifactType &&
                pathStartsWith(record.artifactPath || '.', normalizedPrefix),
        ),
    );
}

export function summarizeProfile(
    cache: TreeSummaryCache | undefined,
    profileName: string,
): ArtifactSummary {
    return cache?.profileSummaries[profileName] ?? createEmptySummary();
}

function filterInstructionScopeRecords(
    cache: TreeSummaryCache | undefined,
    predicate: (record: InstructionScopeRecord) => boolean,
): InstructionScopeRecord[] {
    if (!cache) {
        return [];
    }

    return cache.instructionScopeRecords.filter(predicate);
}

export function summarizeRepoInstructionScope(
    cache: TreeSummaryCache | undefined,
    repoId: string,
): InstructionScopeSummary {
    return summarizeInstructionScopeRecords(
        filterInstructionScopeRecords(cache, (record) => record.repoId === repoId),
    );
}

export function summarizeLayerInstructionScope(
    cache: TreeSummaryCache | undefined,
    repoId: string | undefined,
    prefix: string,
): InstructionScopeSummary {
    if (!repoId) {
        return createEmptyInstructionScopeSummary();
    }

    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarizeInstructionScopeRecords(
        filterInstructionScopeRecords(
            cache,
            (record) =>
                record.repoId === repoId &&
                pathStartsWith(record.repoRelativePath, normalizedPrefix),
        ),
    );
}

export function summarizeDisplayInstructionScope(
    cache: TreeSummaryCache | undefined,
    repoId: string | undefined,
    prefix: string,
): InstructionScopeSummary {
    if (!repoId) {
        return createEmptyInstructionScopeSummary();
    }

    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarizeInstructionScopeRecords(
        filterInstructionScopeRecords(
            cache,
            (record) =>
                record.repoId === repoId && pathStartsWith(record.displayPath, normalizedPrefix),
        ),
    );
}

export function summarizeArtifactInstructionScope(
    cache: TreeSummaryCache | undefined,
    prefix: string,
): InstructionScopeSummary {
    const normalizedPrefix = normalizeRelativePath(prefix);
    return summarizeInstructionScopeRecords(
        filterInstructionScopeRecords(cache, (record) =>
            pathStartsWith(getArtifactPath(record.repoRelativePath) || '.', normalizedPrefix),
        ),
    );
}

export function summarizeProfileInstructionScope(
    cache: TreeSummaryCache | undefined,
    profileName: string,
): InstructionScopeSummary {
    return (
        cache?.profileInstructionScopeSummaries[profileName] ?? createEmptyInstructionScopeSummary()
    );
}

export function getInstructionScopeStatusLabel(summary: InstructionScopeSummary): string {
    switch (summary.status) {
        case 'elevated':
            return 'Elevated';
        case 'moderate':
            return 'Moderate';
        case 'low':
            return 'Low';
        default:
            return 'None';
    }
}

export function getInstructionScopeTooltipLines(summary: InstructionScopeSummary): string[] {
    if (summary.inspectedCount === 0) {
        return [];
    }

    const lines = [
        `Instruction scope: ${getInstructionScopeStatusLabel(summary)} (${summary.inspectedCount} inspected, ${summary.activeCount} active)`,
        `High risk: ${summary.highRiskCount}`,
        `Broad patterns: ${summary.mediumRiskCount}`,
        `Unknown: ${summary.unknownCount}`,
        `Missing applyTo: ${summary.missingApplyToCount}`,
    ];

    for (const record of summary.topRisks) {
        const patternLabel =
            record.patterns.length > 0 ? record.patterns.join(', ') : 'no applyTo declared';
        lines.push(
            `Scope example: ${record.name} -> ${patternLabel} (${titleCaseRiskLevel(record.riskLevel)})`,
        );
    }

    return lines;
}
export function formatSummaryToken(summary: ArtifactSummary): string {
    return `${summary.totalActive}/${summary.totalAvailable}`;
}

export function formatSummaryDescription(
    base: string | undefined,
    summary: ArtifactSummary,
    qualifiers: string[] = [],
): string {
    const parts = [
        formatSummaryToken(summary),
        ...qualifiers.filter((value) => value.trim().length > 0),
    ];
    const suffix = `(${parts.join(', ')})`;
    return base ? `${base} ${suffix}` : suffix;
}

export function getSummaryTooltipLines(summary: ArtifactSummary): string[] {
    return SUMMARY_ARTIFACT_ORDER.map(
        (type) =>
            `${titleCaseArtifactType(type)}: ${summary.byType[type].active}/${summary.byType[type].available} active`,
    );
}
