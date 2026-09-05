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
import {
    isRootSynchronizationAuthorizationActive,
    RootSynchronizationAuthorization,
} from '../config/configMigration';
import { EffectiveFile, PendingAction, PendingChange } from './types';
import { generateProvenanceHeader, ProvenanceData } from './provenanceHeader';
import {
    ManagedFileState,
    computeContentHash,
    loadManagedState,
    saveManagedState,
    createEmptyState,
} from './managedState';
import { checkDrift } from './driftDetector';

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
    /** Effective file backing this planned output. */
    file: EffectiveFile;
}

export interface SynchronizationPlan {
    /** Planned synchronized outputs in overlay order. */
    synchronizedFiles: PlannedSynchronizedFile[];
    /** Managed root files retained while policy is disabled. */
    retainedFiles: PolicyRetainedFile[];
}

export type RetainedSynchronizationReason = 'policy-disabled-retained';
export type RetainedSynchronizationStatus = 'in-sync' | 'missing' | 'drifted';

export interface PolicyRetainedFile {
    relativePath: string;
    status: RetainedSynchronizationStatus;
    reason: RetainedSynchronizationReason;
    sourceLayer: string;
    sourceRelativePath?: string;
    sourceRepo?: string;
}

export interface ManagedSynchronizationSourceIdentity {
    sourceLayer: string;
    sourceRelativePath?: string;
    sourceRepo?: string;
}

export type ManagedFileDispositionStatus =
    'removed' | 'state-cleared' | 'preserved-drifted' | 'not-managed' | 'source-mismatch';

export interface DisposeManagedFileOptions {
    workspaceRoot: string;
    outputDir?: string;
    relativePath: string;
    expectedSourceIdentity?: ManagedSynchronizationSourceIdentity;
}

export interface DisposeManagedFileResult {
    relativePath: string;
    status: ManagedFileDispositionStatus;
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
    /** Strict effective workspace policy for the canonical root file. */
    synchronizationPolicy?: boolean;
    /** Operation-local proof for an enabled root synchronization policy. */
    rootSynchronizationAuthorization?: RootSynchronizationAuthorization;
    /** Config path bound to the operation-local proof. */
    rootSynchronizationConfigPath?: string;
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

function isManagedFileStateEquivalent(
    fileState: ManagedFileState | undefined,
    entry: PlannedSynchronizedFile,
    contentHash: string,
): boolean {
    if (!fileState || fileState.sourceCommit !== undefined) {
        return false;
    }

    return (
        fileState.contentHash === contentHash &&
        fileState.sourceLayer === entry.file.sourceLayer &&
        fileState.sourceRelativePath === normalizeRelativePath(entry.file.relativePath) &&
        fileState.sourceRepo === entry.file.sourceRepo
    );
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
    const synchronizationPolicy = options.synchronizationPolicy === true;
    const hasRootFile =
        options.effectiveFiles.some(isRepoWideCopilotInstructionsFile) ||
        state.files[REPO_WIDE_COPILOT_INSTRUCTIONS_PATH] !== undefined;
    if (
        synchronizationPolicy &&
        hasRootFile &&
        !isRootSynchronizationAuthorizationActive(
            options.rootSynchronizationAuthorization,
            options.rootSynchronizationConfigPath,
        )
    ) {
        throw new Error(
            'Repository-wide Copilot instruction synchronization requires a fresh active current-version authorization.',
        );
    }

    for (const file of options.effectiveFiles) {
        if (file.classification !== 'synchronized') {
            continue;
        }
        if (isRepoWideCopilotInstructionsFile(file) && !synchronizationPolicy) {
            continue;
        }

        const entry: PlannedSynchronizedFile = {
            destinationRelativePath: toSynchronizedRelativePath(
                file,
                resolveEffectiveFileNamingStrategy(file, fileNamingStrategy, strategyByLayer),
            ),
            sourceRelativePath: normalizeRelativePath(file.relativePath),
            sourceLayer: file.sourceLayer,
            sourceRepo: file.sourceRepo,
            sourcePath: file.sourcePath,
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
    if (
        fileNamingStrategy === 'original-unless-conflict' ||
        strategyByLayer !== undefined ||
        hasRepoWideCopilotInstructions
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
                    isRepoWideCopilotInstructionsFile(entry.file))
            ) {
                unmanagedConflicts.push({
                    destinationRelativePath: entry.destinationRelativePath,
                    fullPath: path.join(
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

    const retainedFiles: PolicyRetainedFile[] = [];
    if (!synchronizationPolicy) {
        const retained = state.files[REPO_WIDE_COPILOT_INSTRUCTIONS_PATH];
        if (retained) {
            const drift = checkDrift(
                options.workspaceRoot,
                outputDir,
                REPO_WIDE_COPILOT_INSTRUCTIONS_PATH,
                state,
            );
            retainedFiles.push({
                relativePath: REPO_WIDE_COPILOT_INSTRUCTIONS_PATH,
                status: drift.status === 'untracked' ? 'missing' : drift.status,
                reason: 'policy-disabled-retained',
                sourceLayer: retained.sourceLayer,
                sourceRelativePath: retained.sourceRelativePath,
                sourceRepo: retained.sourceRepo,
            });
        }
    }

    return {
        outputDir,
        state,
        synchronizedFiles,
        retainedFiles,
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
    const { synchronizedFiles, retainedFiles } = loadSynchronizationPlan(options);
    return { synchronizedFiles, retainedFiles };
}

/**
 * Dispose one managed file without widening the operation to global Clean.
 * Source identity is checked before any mutation, and drift is always preserved.
 */
export function disposeManagedFile(options: DisposeManagedFileOptions): DisposeManagedFileResult {
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const state = loadManagedState(options.workspaceRoot);
    const fileState = state.files[options.relativePath];
    if (!fileState) {
        return { relativePath: options.relativePath, status: 'not-managed' };
    }

    const expected = options.expectedSourceIdentity;
    if (
        expected &&
        (fileState.sourceLayer !== expected.sourceLayer ||
            fileState.sourceRelativePath !== expected.sourceRelativePath ||
            fileState.sourceRepo !== expected.sourceRepo)
    ) {
        return { relativePath: options.relativePath, status: 'source-mismatch' };
    }

    const drift = checkDrift(options.workspaceRoot, outputDir, options.relativePath, state);
    if (drift.status === 'drifted') {
        return { relativePath: options.relativePath, status: 'preserved-drifted' };
    }

    const fullPath = path.join(options.workspaceRoot, outputDir, options.relativePath);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
    delete state.files[options.relativePath];
    saveManagedState(options.workspaceRoot, state);
    return {
        relativePath: options.relativePath,
        status: drift.status === 'missing' ? 'state-cleared' : 'removed',
    };
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
    synchronizationPolicy?: boolean;
    rootSynchronizationAuthorization?: RootSynchronizationAuthorization;
    rootSynchronizationConfigPath?: string;
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
    /** Managed root files retained while policy is disabled. */
    retained: PolicyRetainedFile[];
}

/**
 * Apply synchronization: write classified files with provenance.
 */
export function apply(options: ApplyOptions): ApplyResult {
    const stateFileExisted = fs.existsSync(
        path.join(options.workspaceRoot, '.metaflow', 'state.json'),
    );
    const plan = loadSynchronizationPlan(options);
    const outPath = path.join(options.workspaceRoot, plan.outputDir);
    const state = plan.state;
    const result: ApplyResult = {
        written: [],
        skipped: [],
        removed: [],
        warnings: [],
        retained: plan.retainedFiles,
    };
    let managedStateChanged = false;

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

        // If the destination is still in sync and the source/ownership hash is
        // unchanged, avoid regenerating the timestamped provenance header and
        // avoid touching the destination or managed state file.
        if (
            !options.force &&
            drift.status === 'in-sync' &&
            isManagedFileStateEquivalent(state.files[relPath], entry, contentHash)
        ) {
            result.skipped.push(relPath);
            continue;
        }

        // Generate provenance header
        const provenance: ProvenanceData = {
            synced: new Date().toISOString(),
            sourceRepo: file.sourceRepo,
            scope: file.sourceLayer,
            layers: [file.sourceLayer],
            profile: options.activeProfile,
            contentHash,
        };

        const header = generateProvenanceHeader(provenance);
        const fullContent = synchronizedBody + '\n' + header;

        // Write file
        const destPath = path.join(outPath, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, fullContent, 'utf-8');
        result.written.push(relPath);

        // Update managed state
        const fileState: ManagedFileState = {
            contentHash,
            sourceLayer: file.sourceLayer,
            sourceRelativePath: file.relativePath.replace(/\\/g, '/'),
            sourceRepo: file.sourceRepo,
        };
        state.files[relPath] = fileState;
        managedStateChanged = true;
    }

    // Remove files no longer in overlay (only if in-sync)
    for (const trackedPath of Object.keys(state.files)) {
        if (!currentFiles.has(trackedPath)) {
            if (
                trackedPath === REPO_WIDE_COPILOT_INSTRUCTIONS_PATH &&
                options.synchronizationPolicy !== true
            ) {
                continue;
            }
            const drift = checkDrift(options.workspaceRoot, plan.outputDir, trackedPath, state);
            if (drift.status === 'in-sync' || drift.status === 'missing') {
                const fullPath = path.join(outPath, trackedPath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                delete state.files[trackedPath];
                result.removed.push(trackedPath);
                managedStateChanged = true;
            } else if (drift.status === 'drifted') {
                result.warnings.push(`Drifted file not removed: ${trackedPath}`);
            }
        }
    }

    // Save state
    // Preserve the observable first-apply marker even when the overlay has no
    // synchronized files. Subsequent unchanged applies still avoid touching
    // managed state because lastApply is already initialized.
    if (managedStateChanged || !stateFileExisted || state.lastApply === undefined) {
        state.lastApply = new Date().toISOString();
        saveManagedState(options.workspaceRoot, state);
    }

    return result;
}

/**
 * Clean all managed files from the output directory.
 */
export function clean(workspaceRoot: string, outputDir?: string): ApplyResult {
    const outDir = outputDir ?? DEFAULT_OUTPUT_DIR;
    const outPath = path.join(workspaceRoot, outDir);
    const state = loadManagedState(workspaceRoot);
    const result: ApplyResult = {
        written: [],
        skipped: [],
        removed: [],
        warnings: [],
        retained: [],
    };

    for (const relPath of Object.keys(state.files)) {
        const drift = checkDrift(workspaceRoot, outDir, relPath, state);
        if (drift.status === 'in-sync' || drift.status === 'missing') {
            const fullPath = path.join(outPath, relPath);
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
    synchronizationPolicy?: boolean,
    rootSynchronizationAuthorization?: RootSynchronizationAuthorization,
    rootSynchronizationConfigPath?: string,
): PendingChange[] {
    const plan = loadSynchronizationPlan({
        workspaceRoot,
        effectiveFiles,
        outputDir,
        fileNamingStrategy,
        layerSources,
        synchronizationPolicy,
        rootSynchronizationAuthorization,
        rootSynchronizationConfigPath,
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
        });
    }

    // Files to remove
    for (const trackedPath of Object.keys(state.files)) {
        if (!currentFiles.has(trackedPath)) {
            if (
                trackedPath === REPO_WIDE_COPILOT_INSTRUCTIONS_PATH &&
                synchronizationPolicy !== true
            ) {
                continue;
            }
            const drift = checkDrift(workspaceRoot, outDir, trackedPath, state);
            changes.push({
                relativePath: trackedPath,
                action: drift.status === 'drifted' ? 'skip' : 'remove',
                reason: drift.status === 'drifted' ? 'drifted' : undefined,
                classification: 'synchronized',
                sourceLayer: state.files[trackedPath].sourceLayer,
            });
        }
    }

    const withRetention = changes as PendingChange[] & { retained: PolicyRetainedFile[] };
    Object.defineProperty(withRetention, 'retained', {
        configurable: true,
        enumerable: false,
        value: plan.retainedFiles,
        writable: false,
    });
    return withRetention;
}
