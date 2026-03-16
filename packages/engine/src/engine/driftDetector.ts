/**
 * Drift detector.
 *
 * Compares current file content against managed state to detect local edits.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ManagedState, computeContentHash } from './managedState';
import { stripProvenanceHeader } from './provenanceHeader';

/** Drift classification for a single file. */
export type DriftStatus = 'in-sync' | 'drifted' | 'missing' | 'untracked';

/** Drift detection result for a single file. */
export interface DriftResult {
    relativePath: string;
    status: DriftStatus;
    currentHash?: string;
    expectedHash?: string;
}

/**
 * Check drift status for a single managed file.
 *
 * @param workspaceRoot Absolute workspace root.
 * @param outputDir synchronization output directory (e.g., `.github`).
 * @param relativePath Relative path of the Synchronized file.
 * @param state Current managed state.
 * @returns Drift result.
 */
export function checkDrift(
    workspaceRoot: string,
    outputDir: string,
    relativePath: string,
    state: ManagedState,
): DriftResult {
    const fileState = state.files[relativePath];
    const fullPath = path.join(workspaceRoot, outputDir, relativePath);

    if (!fileState) {
        // Not tracked in managed state
        if (fs.existsSync(fullPath)) {
            return { relativePath, status: 'untracked' };
        }
        return { relativePath, status: 'missing' };
    }

    if (!fs.existsSync(fullPath)) {
        return {
            relativePath,
            status: 'missing',
            expectedHash: fileState.contentHash,
        };
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const body = stripProvenanceHeader(content);
    const currentHash = computeContentHash(body);

    if (currentHash === fileState.contentHash) {
        return {
            relativePath,
            status: 'in-sync',
            currentHash,
            expectedHash: fileState.contentHash,
        };
    }

    return {
        relativePath,
        status: 'drifted',
        currentHash,
        expectedHash: fileState.contentHash,
    };
}

/**
 * Check drift for all files in managed state.
 *
 * @param workspaceRoot Absolute workspace root.
 * @param outputDir synchronization output directory.
 * @param state Current managed state.
 * @returns Array of drift results.
 */
export function checkAllDrift(
    workspaceRoot: string,
    outputDir: string,
    state: ManagedState,
): DriftResult[] {
    const results: DriftResult[] = [];
    for (const relativePath of Object.keys(state.files)) {
        results.push(checkDrift(workspaceRoot, outputDir, relativePath, state));
    }
    return results;
}
