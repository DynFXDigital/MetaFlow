/**
 * Synchronization engine.
 *
 * Writes synchronized files to the output directory (`.github/`) with
 * provenance headers. Supports apply, clean, and preview workflows.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LayerSource, SyncFileNamingStrategy } from '../config/configSchema';
import { EffectiveFile, PendingAction, PendingChange, ProjectionMetadata } from './types';
import { generateProvenanceHeader, ProvenanceData } from './provenanceHeader';
import {
    ManagedFileState,
    computeContentHash,
    loadManagedState,
    saveManagedState,
    createEmptyState,
} from './managedState';
import { checkDrift } from './driftDetector';
import { isCodexRootRelativeSynchronizedPath, usesInlineProvenanceHeader } from './codexPaths';
import { describeProjection, describeProjectionWithTargetAdapters } from './projectionMetadata';

/** Default output directory relative to workspace root. */
const DEFAULT_OUTPUT_DIR = '.github';
const DEFAULT_FILE_NAMING_STRATEGY: SyncFileNamingStrategy = 'prefixed';
const REPO_WIDE_COPILOT_INSTRUCTIONS_PATH = 'copilot-instructions.md';

export interface PlannedSynchronizedFile {
    /** Destination relative path under the synchronization output directory. */
    destinationRelativePath: string;
    /** Original relative path within the source layer. */
    sourceRelativePath: string;
    /** Source layer that contributed the file. */
    sourceLayer: string;
    /** Source repo that contributed the file. */
    sourceRepo?: string;
    /** Absolute path to the source file. */
    sourcePath: string;
    /** Target and support metadata for this planned output. */
    projection: ProjectionMetadata;
    /** Effective file backing this planned output. */
    file: EffectiveFile;
}

export interface SynchronizationPlan {
    /** Planned synchronized outputs in overlay order. */
    synchronizedFiles: PlannedSynchronizedFile[];
}

export interface PlanSynchronizationOptions {
    /** Workspace root path. */
    workspaceRoot: string;
    /** Output directory (default: `.github`). */
    outputDir?: string;
    /** Effective files from overlay resolution. */
    effectiveFiles: EffectiveFile[];
    /** Strategy for naming synchronized outputs. */
    fileNamingStrategy?: SyncFileNamingStrategy;
    /** Optional normalized layer sources carrying per-layer naming overrides. */
    layerSources?: LayerSource[];
}

interface LoadedSynchronizationPlan extends SynchronizationPlan {
    outputDir: string;
    state: ReturnType<typeof loadManagedState>;
}

interface DestinationCollision {
    destinationRelativePath: string;
    contenders: PlannedSynchronizedFile[];
}

interface UnmanagedDestinationConflict {
    destinationRelativePath: string;
    fullPath: string;
    entry: PlannedSynchronizedFile;
}

interface ManagedRemapConflict {
    trackedRelativePath: string;
    destinationRelativePath: string;
    sourceRelativePath: string;
    sourceLayer: string;
    sourceRepo?: string;
}

function slugToken(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

function getLayerToken(file: EffectiveFile): string {
    const sourceLayer = file.sourceLayer.replace(/\\/g, '/');
    const sourceRepo = (file.sourceRepo ?? '').replace(/\\/g, '/');
    const effectiveRepo = sourceRepo === 'primary' ? '' : sourceRepo;

    if (effectiveRepo && sourceLayer.startsWith(`${effectiveRepo}/`)) {
        return sourceLayer.slice(effectiveRepo.length + 1);
    }

    if (sourceRepo === 'primary' && sourceLayer.startsWith('primary/')) {
        return sourceLayer.slice('primary/'.length);
    }

    return sourceLayer;
}

function normalizeRelativePath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

function resolveFileNamingStrategy(
    fileNamingStrategy?: SyncFileNamingStrategy,
): SyncFileNamingStrategy {
    return fileNamingStrategy ?? DEFAULT_FILE_NAMING_STRATEGY;
}

function layerSourceKey(layerSource: LayerSource): string {
    return `${layerSource.repoId}/${layerSource.path.replace(/\\/g, '/')}`;
}

function buildFileNamingStrategyMap(
    layerSources: LayerSource[] | undefined,
): Map<string, SyncFileNamingStrategy> | undefined {
    if (!layerSources?.some((layerSource) => layerSource.fileNamingStrategy !== undefined)) {
        return undefined;
    }

    const map = new Map<string, SyncFileNamingStrategy>();
    for (const layerSource of layerSources) {
        if (layerSource.fileNamingStrategy !== undefined) {
            map.set(layerSourceKey(layerSource), layerSource.fileNamingStrategy);
        }
    }

    return map;
}

function isChatmodesFile(file: EffectiveFile): boolean {
    const normalized = normalizeRelativePath(file.relativePath);
    return normalized === 'chatmodes' || normalized.startsWith('chatmodes/');
}

function isRepoWideCopilotInstructionsFile(file: EffectiveFile): boolean {
    return normalizeRelativePath(file.relativePath) === REPO_WIDE_COPILOT_INSTRUCTIONS_PATH;
}

function isRootRelativeSynchronizedPath(relativePath: string): boolean {
    return isCodexRootRelativeSynchronizedPath(relativePath);
}

function getSourceRelativePath(file: EffectiveFile): string {
    return normalizeRelativePath(file.sourceRelativePath ?? file.relativePath);
}

function resolveSynchronizedOutputDir(outputDir: string, relativePath: string): string {
    return isRootRelativeSynchronizedPath(relativePath) ? '' : outputDir;
}

function resolveSynchronizedDestinationPath(
    workspaceRoot: string,
    outputDir: string,
    relativePath: string,
): string {
    return path.join(
        workspaceRoot,
        resolveSynchronizedOutputDir(outputDir, relativePath),
        relativePath,
    );
}

function resolveEffectiveFileNamingStrategy(
    file: EffectiveFile,
    fallbackFileNamingStrategy: SyncFileNamingStrategy,
    strategyByLayer: Map<string, SyncFileNamingStrategy> | undefined,
): SyncFileNamingStrategy {
    if (isChatmodesFile(file)) {
        return DEFAULT_FILE_NAMING_STRATEGY;
    }

    if (strategyByLayer) {
        const perLayer = strategyByLayer.get(file.sourceLayer);
        if (perLayer !== undefined) {
            return perLayer;
        }
    }

    return fallbackFileNamingStrategy;
}

function buildSourceIdentity(
    sourceRelativePath: string,
    sourceLayer: string,
    sourceRepo?: string,
): string {
    return [sourceRepo ?? 'default', sourceLayer, sourceRelativePath].join('\u0000');
}

function formatSourceLabel(
    sourceRelativePath: string,
    sourceLayer: string,
    sourceRepo?: string,
): string {
    return `${sourceRepo ?? 'default'}:${sourceLayer}:${sourceRelativePath}`;
}

function comparePlannedFiles(
    left: PlannedSynchronizedFile,
    right: PlannedSynchronizedFile,
): number {
    return (
        left.destinationRelativePath.localeCompare(right.destinationRelativePath) ||
        formatSourceLabel(left.sourceRelativePath, left.sourceLayer, left.sourceRepo).localeCompare(
            formatSourceLabel(right.sourceRelativePath, right.sourceLayer, right.sourceRepo),
        ) ||
        left.sourcePath.localeCompare(right.sourcePath)
    );
}

function formatSynchronizationPlanningError(
    collisions: DestinationCollision[],
    unmanagedConflicts: UnmanagedDestinationConflict[],
    remapConflicts: ManagedRemapConflict[],
): string {
    const lines = ['Cannot resolve synchronized outputs:'];

    for (const collision of collisions) {
        const sources = collision.contenders
            .map((entry) =>
                formatSourceLabel(entry.sourceRelativePath, entry.sourceLayer, entry.sourceRepo),
            )
            .join(' ; ');
        lines.push(`- Output path collision at ${collision.destinationRelativePath}: ${sources}`);
    }

    for (const conflict of unmanagedConflicts) {
        lines.push(
            `- Unmanaged destination already exists at ${conflict.destinationRelativePath} for ${formatSourceLabel(conflict.entry.sourceRelativePath, conflict.entry.sourceLayer, conflict.entry.sourceRepo)} (${conflict.fullPath}). Remove or rename the existing file, or use the prefixed naming strategy.`,
        );
    }

    for (const conflict of remapConflicts) {
        lines.push(
            `- Managed output remap required for ${formatSourceLabel(conflict.sourceRelativePath, conflict.sourceLayer, conflict.sourceRepo)}: tracked at ${conflict.trackedRelativePath}, current strategy resolves to ${conflict.destinationRelativePath}. Automatic migration is not supported; clean or remove the old synchronized output first.`,
        );
    }

    return lines.join('\n');
}

function loadSynchronizationPlan(options: PlanSynchronizationOptions): LoadedSynchronizationPlan {
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const fileNamingStrategy = resolveFileNamingStrategy(options.fileNamingStrategy);
    const strategyByLayer = buildFileNamingStrategyMap(options.layerSources);
    const state = loadManagedState(options.workspaceRoot);
    const synchronizedFiles: PlannedSynchronizedFile[] = [];
    const contendersByDestination = new Map<string, PlannedSynchronizedFile[]>();

    for (const file of options.effectiveFiles) {
        if (file.classification !== 'synchronized') {
            continue;
        }

        const destinationRelativePath = toSynchronizedRelativePath(
            file,
            resolveEffectiveFileNamingStrategy(file, fileNamingStrategy, strategyByLayer),
        );
        const sourceRelativePath = getSourceRelativePath(file);
        const entry: PlannedSynchronizedFile = {
            destinationRelativePath,
            sourceRelativePath,
            sourceLayer: file.sourceLayer,
            sourceRepo: file.sourceRepo,
            sourcePath: file.sourcePath,
            projection: describeProjectionWithTargetAdapters(
                destinationRelativePath,
                sourceRelativePath,
                file.sourceTargetAdapters,
            ),
            file,
        };
        synchronizedFiles.push(entry);

        const contenders = contendersByDestination.get(entry.destinationRelativePath) ?? [];
        contenders.push(entry);
        contendersByDestination.set(entry.destinationRelativePath, contenders);
    }

    const collisions = Array.from(contendersByDestination.entries())
        .filter(([, contenders]) => contenders.length > 1)
        .map(([destinationRelativePath, contenders]) => ({
            destinationRelativePath,
            contenders: [...contenders].sort(comparePlannedFiles),
        }))
        .sort((left, right) =>
            left.destinationRelativePath.localeCompare(right.destinationRelativePath),
        );

    const remapConflicts: ManagedRemapConflict[] = [];
    const destinationBySource = new Map<string, string>();
    for (const entry of synchronizedFiles) {
        destinationBySource.set(
            buildSourceIdentity(entry.sourceRelativePath, entry.sourceLayer, entry.sourceRepo),
            entry.destinationRelativePath,
        );
    }

    for (const trackedRelativePath of Object.keys(state.files).sort()) {
        const tracked = state.files[trackedRelativePath];
        if (!tracked.sourceRelativePath) {
            continue;
        }

        const destinationRelativePath = destinationBySource.get(
            buildSourceIdentity(
                tracked.sourceRelativePath,
                tracked.sourceLayer,
                tracked.sourceRepo,
            ),
        );
        if (destinationRelativePath && destinationRelativePath !== trackedRelativePath) {
            remapConflicts.push({
                trackedRelativePath,
                destinationRelativePath,
                sourceRelativePath: tracked.sourceRelativePath,
                sourceLayer: tracked.sourceLayer,
                sourceRepo: tracked.sourceRepo,
            });
        }
    }

    remapConflicts.sort(
        (left, right) =>
            formatSourceLabel(
                left.sourceRelativePath,
                left.sourceLayer,
                left.sourceRepo,
            ).localeCompare(
                formatSourceLabel(right.sourceRelativePath, right.sourceLayer, right.sourceRepo),
            ) || left.trackedRelativePath.localeCompare(right.trackedRelativePath),
    );

    const unmanagedConflicts: UnmanagedDestinationConflict[] = [];
    const hasRepoWideCopilotInstructions = synchronizedFiles.some((entry) =>
        isRepoWideCopilotInstructionsFile(entry.file),
    );
    const hasRootRelativeSynchronizedFiles = synchronizedFiles.some((entry) =>
        isRootRelativeSynchronizedPath(entry.destinationRelativePath),
    );
    if (
        fileNamingStrategy === 'original-unless-conflict' ||
        strategyByLayer !== undefined ||
        hasRepoWideCopilotInstructions ||
        hasRootRelativeSynchronizedFiles
    ) {
        for (const entry of [...synchronizedFiles].sort(comparePlannedFiles)) {
            const drift = checkDrift(
                options.workspaceRoot,
                outputDir,
                entry.destinationRelativePath,
                state,
            );
            if (
                drift.status === 'untracked' &&
                (resolveEffectiveFileNamingStrategy(
                    entry.file,
                    fileNamingStrategy,
                    strategyByLayer,
                ) === 'original-unless-conflict' ||
                    isRepoWideCopilotInstructionsFile(entry.file) ||
                    isRootRelativeSynchronizedPath(entry.destinationRelativePath))
            ) {
                unmanagedConflicts.push({
                    destinationRelativePath: entry.destinationRelativePath,
                    fullPath: resolveSynchronizedDestinationPath(
                        options.workspaceRoot,
                        outputDir,
                        entry.destinationRelativePath,
                    ),
                    entry,
                });
            }
        }
    }

    if (collisions.length > 0 || unmanagedConflicts.length > 0 || remapConflicts.length > 0) {
        throw new Error(
            formatSynchronizationPlanningError(collisions, unmanagedConflicts, remapConflicts),
        );
    }

    return {
        outputDir,
        state,
        synchronizedFiles,
    };
}

export function toSynchronizedRelativePath(
    file: EffectiveFile,
    fileNamingStrategy?: SyncFileNamingStrategy,
): string {
    const normalizedPath = normalizeRelativePath(file.relativePath);
    if (isRepoWideCopilotInstructionsFile(file)) {
        return REPO_WIDE_COPILOT_INSTRUCTIONS_PATH;
    }
    if (isRootRelativeSynchronizedPath(normalizedPath)) {
        return normalizedPath;
    }

    if (resolveFileNamingStrategy(fileNamingStrategy) === 'original-unless-conflict') {
        return normalizedPath;
    }

    const dirName = path.posix.dirname(normalizedPath);
    const baseName = path.posix.basename(normalizedPath);

    const repoToken =
        slugToken(file.sourceRepo === 'primary' ? 'default' : (file.sourceRepo ?? 'default')) ||
        'default';
    const layerToken = slugToken(getLayerToken(file)) || 'layer';
    const prefixedBaseName = `_${repoToken}-${layerToken}__${baseName}`;

    if (dirName === '.' || dirName === '') {
        return prefixedBaseName;
    }

    return `${dirName}/${prefixedBaseName}`;
}

export function planSynchronization(options: PlanSynchronizationOptions): SynchronizationPlan {
    const { synchronizedFiles } = loadSynchronizationPlan(options);
    return { synchronizedFiles };
}

/** Options for an apply operation. */
export interface ApplyOptions {
    /** Workspace root path. */
    workspaceRoot: string;
    /** Output directory (default: `.github`). */
    outputDir?: string;
    /** Effective files from overlay resolution. */
    effectiveFiles: EffectiveFile[];
    /** Active profile name (for provenance). */
    activeProfile?: string;
    /** Strategy for naming synchronized outputs. */
    fileNamingStrategy?: SyncFileNamingStrategy;
    /** Optional normalized layer sources carrying per-layer naming overrides. */
    layerSources?: LayerSource[];
    /** Force overwrite even if drifted. */
    force?: boolean;
}

/** Result of an apply operation. */
export interface ApplyResult {
    /** Files written successfully. */
    written: string[];
    /** Files skipped due to drift. */
    skipped: string[];
    /** Files removed (no longer in overlay). */
    removed: string[];
    /** Warning messages. */
    warnings: string[];
}

/**
 * Apply synchronization: write classified files with managed-state provenance.
 */
export function apply(options: ApplyOptions): ApplyResult {
    const plan = loadSynchronizationPlan(options);
    const state = plan.state;
    const result: ApplyResult = { written: [], skipped: [], removed: [], warnings: [] };

    // Track which files are in the current overlay
    const currentFiles = new Set(
        plan.synchronizedFiles.map((entry) => entry.destinationRelativePath),
    );

    for (const entry of plan.synchronizedFiles) {
        const relPath = entry.destinationRelativePath;
        const file = entry.file;

        // Check drift
        const drift = checkDrift(options.workspaceRoot, plan.outputDir, relPath, state);
        if (drift.status === 'drifted' && !options.force) {
            result.skipped.push(relPath);
            result.warnings.push(`Skipped drifted file: ${relPath}`);
            continue;
        }

        // Read source content
        let sourceContent: string;
        try {
            sourceContent = fs.readFileSync(file.sourcePath, 'utf-8');
        } catch {
            result.warnings.push(`Cannot read source: ${file.sourcePath}`);
            continue;
        }

        const synchronizedBody = sourceContent.endsWith('\n')
            ? sourceContent
            : `${sourceContent}\n`;
        const contentHash = computeContentHash(synchronizedBody);

        // Generate provenance header
        const provenance: ProvenanceData = {
            synced: new Date().toISOString(),
            sourceRepo: file.sourceRepo,
            scope: file.sourceLayer,
            layers: [file.sourceLayer],
            profile: options.activeProfile,
            contentHash,
        };

        const fullContent = usesInlineProvenanceHeader(relPath)
            ? synchronizedBody + '\n' + generateProvenanceHeader(provenance)
            : synchronizedBody;

        // Write file
        const destPath = resolveSynchronizedDestinationPath(
            options.workspaceRoot,
            plan.outputDir,
            relPath,
        );
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, fullContent, 'utf-8');
        result.written.push(relPath);

        // Update managed state
        const fileState: ManagedFileState = {
            contentHash,
            sourceLayer: file.sourceLayer,
            sourceRelativePath: getSourceRelativePath(file),
            sourceRepo: file.sourceRepo,
        };
        state.files[relPath] = fileState;
    }

    // Remove files no longer in overlay (only if in-sync)
    for (const trackedPath of Object.keys(state.files)) {
        if (!currentFiles.has(trackedPath)) {
            const drift = checkDrift(options.workspaceRoot, plan.outputDir, trackedPath, state);
            if (drift.status === 'in-sync' || drift.status === 'missing') {
                const fullPath = resolveSynchronizedDestinationPath(
                    options.workspaceRoot,
                    plan.outputDir,
                    trackedPath,
                );
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                delete state.files[trackedPath];
                result.removed.push(trackedPath);
            } else if (drift.status === 'drifted') {
                result.warnings.push(`Drifted file not removed: ${trackedPath}`);
            }
        }
    }

    // Save state
    state.lastApply = new Date().toISOString();
    saveManagedState(options.workspaceRoot, state);

    return result;
}

/**
 * Clean all managed files from the output directory.
 */
export function clean(workspaceRoot: string, outputDir?: string): ApplyResult {
    const outDir = outputDir ?? DEFAULT_OUTPUT_DIR;
    const state = loadManagedState(workspaceRoot);
    const result: ApplyResult = { written: [], skipped: [], removed: [], warnings: [] };

    for (const relPath of Object.keys(state.files)) {
        const drift = checkDrift(workspaceRoot, outDir, relPath, state);
        if (drift.status === 'in-sync' || drift.status === 'missing') {
            const fullPath = resolveSynchronizedDestinationPath(workspaceRoot, outDir, relPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
            result.removed.push(relPath);
        } else if (drift.status === 'drifted') {
            result.skipped.push(relPath);
            result.warnings.push(`Skipped drifted file (clean): ${relPath}`);
        }
    }

    // Reset state
    const emptyState = createEmptyState();
    if (state.views) {
        emptyState.views = { ...state.views };
    }
    // Preserve drifted files in state
    for (const rel of result.skipped) {
        if (state.files[rel]) {
            emptyState.files[rel] = state.files[rel];
        }
    }
    saveManagedState(workspaceRoot, emptyState);

    return result;
}

/**
 * Preview pending changes without writing.
 */
export function preview(
    workspaceRoot: string,
    effectiveFiles: EffectiveFile[],
    outputDir?: string,
    fileNamingStrategy?: SyncFileNamingStrategy,
    layerSources?: LayerSource[],
): PendingChange[] {
    const plan = loadSynchronizationPlan({
        workspaceRoot,
        effectiveFiles,
        outputDir,
        fileNamingStrategy,
        layerSources,
    });
    const outDir = plan.outputDir;
    const state = plan.state;
    const changes: PendingChange[] = [];
    const currentFiles = new Set(
        plan.synchronizedFiles.map((entry) => entry.destinationRelativePath),
    );

    for (const entry of plan.synchronizedFiles) {
        const synchronizedRelPath = entry.destinationRelativePath;
        const file = entry.file;

        const drift = checkDrift(workspaceRoot, outDir, synchronizedRelPath, state);
        let action: PendingAction;
        let reason: string | undefined;

        switch (drift.status) {
            case 'drifted':
                action = 'skip';
                reason = 'drifted';
                break;
            case 'missing':
                action = state.files[synchronizedRelPath] ? 'add' : 'add';
                break;
            case 'in-sync':
                action = 'update';
                break;
            case 'untracked':
                action = 'add';
                break;
            default:
                action = 'add';
        }

        changes.push({
            relativePath: synchronizedRelPath,
            action,
            reason,
            classification: file.classification,
            sourceLayer: file.sourceLayer,
            sourceRepo: file.sourceRepo,
            sourceRelativePath: entry.sourceRelativePath,
            projection: entry.projection,
        });
    }

    // Files to remove
    for (const trackedPath of Object.keys(state.files)) {
        if (!currentFiles.has(trackedPath)) {
            const drift = checkDrift(workspaceRoot, outDir, trackedPath, state);
            changes.push({
                relativePath: trackedPath,
                action: drift.status === 'drifted' ? 'skip' : 'remove',
                reason: drift.status === 'drifted' ? 'drifted' : undefined,
                classification: 'synchronized',
                sourceLayer: state.files[trackedPath].sourceLayer,
                sourceRepo: state.files[trackedPath].sourceRepo,
                sourceRelativePath: state.files[trackedPath].sourceRelativePath,
                projection: describeProjection(
                    trackedPath,
                    state.files[trackedPath].sourceRelativePath ?? trackedPath,
                ),
            });
        }
    }

    return changes;
}
