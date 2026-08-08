import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasValidReadmeDescriptorAtRoot } from '@metaflow/engine';

export const CAPABILITY_PLUGIN_METADATA_WATCH_PATTERNS = [
    '**/README.md',
    '**/CAPABILITY.md',
    '**/plugin.json',
    '**/instructions/**',
    '**/commands/**',
    '**/skills/**',
    '**/agents/**',
] as const;

const KNOWN_CAPABILITY_ARTIFACT_ROOTS = [
    'instructions',
    'prompts',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
] as const;

function isFile(candidatePath: string): boolean {
    try {
        return fs.statSync(candidatePath).isFile();
    } catch {
        return false;
    }
}

function isDirectory(candidatePath: string): boolean {
    try {
        return fs.statSync(candidatePath).isDirectory();
    } catch {
        return false;
    }
}

function hasKnownCapabilityArtifacts(directoryPath: string): boolean {
    return KNOWN_CAPABILITY_ARTIFACT_ROOTS.some(
        (artifactRoot) =>
            isDirectory(path.join(directoryPath, artifactRoot)) ||
            isDirectory(path.join(directoryPath, '.github', artifactRoot)),
    );
}

function isRecognizedReadmePackageRoot(directoryPath: string): boolean {
    if (!hasValidReadmeDescriptorAtRoot(directoryPath)) {
        return false;
    }

    return (
        isFile(path.join(directoryPath, 'plugin.json')) ||
        hasKnownCapabilityArtifacts(directoryPath)
    );
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
    const relative = path.relative(parentPath, candidatePath);
    return (
        relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    );
}

export function findNearestCapabilityDirectory(
    repoRoot: string,
    changedPath: string,
): string | undefined {
    let current = path.dirname(changedPath);
    try {
        if (fs.existsSync(changedPath) && fs.statSync(changedPath).isDirectory()) {
            current = changedPath;
        }
    } catch {
        current = path.dirname(changedPath);
    }

    while (isPathInside(repoRoot, current)) {
        const readmePath = path.join(current, 'README.md');
        if (isFile(readmePath) && isRecognizedReadmePackageRoot(current)) {
            return current;
        }

        const legacyManifestPath = path.join(current, 'CAPABILITY.md');
        if (isFile(legacyManifestPath)) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }

    return undefined;
}

export interface DirtyCapabilityPluginMetadataRepo {
    repoId: string;
    repoRoot: string;
    capabilityDirectoryPaths: string[];
}

export interface CapabilityPluginMetadataSchedulerCoreDeps {
    getDelayMs: () => number;
    maintainDirtyRepo: (target: DirtyCapabilityPluginMetadataRepo) => Promise<void>;
    logInfo?: (message: string) => void;
    logWarn?: (message: string) => void;
    setTimeoutFn: (callback: () => void, delayMs: number) => unknown;
    clearTimeoutFn: (handle: unknown) => void;
}

export interface CapabilityPluginMetadataSchedulerCore {
    markDirty: (target: {
        repoId: string;
        repoRoot: string;
        capabilityDirectoryPath?: string;
    }) => void;
    flush: (repoId: string) => Promise<void>;
    dispose: () => void;
}

interface PendingRepoMaintenance {
    repoId: string;
    repoRoot: string;
    capabilityDirectoryPaths: Set<string>;
}

function normalizeDelayMs(value: number): number {
    if (!Number.isFinite(value)) {
        return 5000;
    }

    return Math.max(250, Math.min(60000, Math.trunc(value)));
}

export function createCapabilityPluginMetadataSchedulerCore(
    deps: CapabilityPluginMetadataSchedulerCoreDeps,
): CapabilityPluginMetadataSchedulerCore {
    const pendingByRepoId = new Map<string, PendingRepoMaintenance>();
    const timerByRepoId = new Map<string, unknown>();
    const runningRepoIds = new Set<string>();
    let disposed = false;

    const clearTimer = (repoId: string): void => {
        const handle = timerByRepoId.get(repoId);
        if (handle === undefined) {
            return;
        }

        deps.clearTimeoutFn(handle);
        timerByRepoId.delete(repoId);
    };

    const schedule = (repoId: string): void => {
        if (disposed) {
            return;
        }

        clearTimer(repoId);
        const delayMs = normalizeDelayMs(deps.getDelayMs());
        const handle = deps.setTimeoutFn(() => {
            timerByRepoId.delete(repoId);
            void flush(repoId);
        }, delayMs);
        timerByRepoId.set(repoId, handle);
    };

    const flush = async (repoId: string): Promise<void> => {
        if (disposed) {
            return;
        }

        clearTimer(repoId);

        if (runningRepoIds.has(repoId)) {
            schedule(repoId);
            return;
        }

        const pending = pendingByRepoId.get(repoId);
        if (!pending) {
            return;
        }

        pendingByRepoId.delete(repoId);
        runningRepoIds.add(repoId);

        const target: DirtyCapabilityPluginMetadataRepo = {
            repoId: pending.repoId,
            repoRoot: pending.repoRoot,
            capabilityDirectoryPaths: Array.from(pending.capabilityDirectoryPaths).sort(
                (left, right) => left.localeCompare(right),
            ),
        };

        try {
            await deps.maintainDirtyRepo(target);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            deps.logWarn?.(
                `Capability plugin metadata maintenance failed for ${repoId}: ${message}`,
            );
        } finally {
            runningRepoIds.delete(repoId);
        }

        if (!disposed && pendingByRepoId.has(repoId)) {
            schedule(repoId);
        }
    };

    return {
        markDirty: ({ repoId, repoRoot, capabilityDirectoryPath }) => {
            if (disposed) {
                return;
            }

            const pending = pendingByRepoId.get(repoId) ?? {
                repoId,
                repoRoot,
                capabilityDirectoryPaths: new Set<string>(),
            };
            pending.repoRoot = repoRoot;
            if (capabilityDirectoryPath) {
                pending.capabilityDirectoryPaths.add(capabilityDirectoryPath);
            }
            pendingByRepoId.set(repoId, pending);

            deps.logInfo?.(`Capability plugin metadata marked dirty for ${repoId}.`);
            schedule(repoId);
        },
        flush,
        dispose: () => {
            disposed = true;
            for (const repoId of timerByRepoId.keys()) {
                clearTimer(repoId);
            }
            pendingByRepoId.clear();
            runningRepoIds.clear();
        },
    };
}
