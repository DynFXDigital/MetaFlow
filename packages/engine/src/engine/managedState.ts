/**
 * Managed state persistence.
 *
 * Tracks Synchronized files, their content hashes, and source metadata
 * for drift detection and safe re-render.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** Per-file managed state entry. */
export interface ManagedFileState {
    /** SHA-256 content hash of the file body (after provenance header removal). */
    contentHash: string;
    /** Layer that contributed this file. */
    sourceLayer: string;
    /** Original relative path within the source layer. */
    sourceRelativePath?: string;
    /** Source repo ID (for multi-repo). */
    sourceRepo?: string;
    /** Source commit SHA at time of sync. */
    sourceCommit?: string;
}

/** Full managed state document. */
export interface ManagedState {
    /** Schema version for forward compatibility. */
    version: number;
    /** ISO-8601 timestamp of last apply. */
    lastApply: string;
    /** Map of relative path → file state. */
    files: Record<string, ManagedFileState>;
}

/** Default state directory relative to workspace root. */
const STATE_DIR = '.metaflow';
const STATE_FILE = 'state.json';
const CURRENT_VERSION = 1;
const MANAGED_FILE_STATE_KEYS: readonly (keyof ManagedFileState)[] = [
    'contentHash',
    'sourceLayer',
    'sourceRelativePath',
    'sourceRepo',
    'sourceCommit',
];

function canonicalizeManagedFileState(state: ManagedFileState): ManagedFileState {
    const ordered: ManagedFileState = {
        contentHash: state.contentHash,
        sourceLayer: state.sourceLayer,
    };

    for (const key of MANAGED_FILE_STATE_KEYS) {
        if (key === 'contentHash' || key === 'sourceLayer') {
            continue;
        }

        const value = state[key];
        if (value !== undefined) {
            ordered[key] = value;
        }
    }

    return ordered;
}

function canonicalizeManagedState(state: ManagedState): ManagedState {
    const files: Record<string, ManagedFileState> = {};
    for (const relativePath of Object.keys(state.files ?? {}).sort()) {
        files[relativePath] = canonicalizeManagedFileState(state.files[relativePath]);
    }

    return {
        version: state.version,
        lastApply: state.lastApply,
        files,
    };
}

/**
 * Compute SHA-256 hash of content.
 *
 * @param content String content to hash.
 * @returns `sha256:<hex>` hash string.
 */
export function computeContentHash(content: string): string {
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${hash}`;
}

/**
 * Load managed state from the workspace.
 *
 * @param workspaceRoot Absolute workspace root path.
 * @returns Managed state, or empty state if not found or corrupted.
 */
export function loadManagedState(workspaceRoot: string): ManagedState {
    const statePath = path.join(workspaceRoot, STATE_DIR, STATE_FILE);
    try {
        if (!fs.existsSync(statePath)) {
            return createEmptyState();
        }
        const raw = fs.readFileSync(statePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || parsed.version !== CURRENT_VERSION) {
            return createEmptyState(); // incompatible version
        }
        return canonicalizeManagedState(parsed as ManagedState);
    } catch {
        return createEmptyState(); // corrupted file
    }
}

/**
 * Save managed state to the workspace.
 *
 * @param workspaceRoot Absolute workspace root path.
 * @param state Managed state to persist.
 */
export function saveManagedState(workspaceRoot: string, state: ManagedState): void {
    const stateDir = path.join(workspaceRoot, STATE_DIR);
    fs.mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, STATE_FILE);
    const canonicalState = canonicalizeManagedState(state);
    fs.writeFileSync(statePath, JSON.stringify(canonicalState, null, 2) + '\n', 'utf-8');
}

/**
 * Create an empty managed state.
 */
export function createEmptyState(): ManagedState {
    return {
        version: CURRENT_VERSION,
        lastApply: new Date().toISOString(),
        files: {},
    };
}

/**
 * Get the managed state directory path.
 */
export function getStateDirPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, STATE_DIR);
}
