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

export function toSynchronizedRelativePath(file: EffectiveFile): string {
    const normalizedPath = file.relativePath.replace(/\\/g, '/');
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
 * Apply synchronization: write classified files with provenance.
 */
export function apply(options: ApplyOptions): ApplyResult {
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const outPath = path.join(options.workspaceRoot, outputDir);
    const state = loadManagedState(options.workspaceRoot);
    const result: ApplyResult = { written: [], skipped: [], removed: [], warnings: [] };

    // Track which files are in the current overlay
    const currentFiles = new Set<string>();

    for (const file of options.effectiveFiles) {
        if (file.classification !== 'synchronized') {
            continue; // settings-classified files are not synchronized
        }

        const relPath = toSynchronizedRelativePath(file);
        currentFiles.add(relPath);

        // Check drift
        const drift = checkDrift(options.workspaceRoot, outputDir, relPath, state);
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
    }

    // Remove files no longer in overlay (only if in-sync)
    for (const trackedPath of Object.keys(state.files)) {
        if (!currentFiles.has(trackedPath)) {
            const drift = checkDrift(options.workspaceRoot, outputDir, trackedPath, state);
            if (drift.status === 'in-sync' || drift.status === 'missing') {
                const fullPath = path.join(outPath, trackedPath);
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
    const outPath = path.join(workspaceRoot, outDir);
    const state = loadManagedState(workspaceRoot);
    const result: ApplyResult = { written: [], skipped: [], removed: [], warnings: [] };

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
): PendingChange[] {
    const outDir = outputDir ?? DEFAULT_OUTPUT_DIR;
    const state = loadManagedState(workspaceRoot);
    const changes: PendingChange[] = [];
    const currentFiles = new Set<string>();

    for (const file of effectiveFiles) {
        if (file.classification !== 'synchronized') {
            continue;
        }

        const synchronizedRelPath = toSynchronizedRelativePath(file);
        currentFiles.add(synchronizedRelPath);

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

    return changes;
}
