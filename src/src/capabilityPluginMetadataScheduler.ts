import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolvePathFromWorkspace } from '@metaflow/engine';
import {
    ExtensionState,
    collectCapabilityPluginMaintenanceWarningMessages,
    maintainAllCapabilityPluginMetadataInRepo,
    mergeCapabilityWarningMessages,
} from './commands/commandHandlers';
import { ensureMultiRepoConfig } from './commands/commandHelpers';
import {
    createCapabilityPluginMetadataSchedulerCore,
    DirtyCapabilityPluginMetadataRepo,
} from './capabilityPluginMetadataSchedulerCore';
import { BUILT_IN_CAPABILITY_REPO_ID } from './builtInCapability';
import { logInfo, logWarn } from './views/outputChannel';

const AUTO_MAINTAIN_SETTING_KEY = 'pluginMetadata.autoMaintain';
const AUTO_MAINTAIN_DELAY_SETTING_KEY = 'pluginMetadata.autoMaintainDelayMs';
const DEFAULT_AUTO_MAINTAIN_DELAY_MS = 5000;
const WATCH_PATTERNS = [
    '**/CAPABILITY.md',
    '**/plugin.json',
    '**/instructions/**',
    '**/.github/instructions/**',
    '**/skills/**',
    '**/.github/skills/**',
    '**/agents/**',
    '**/.github/agents/**',
];

interface WatchedRepo {
    repoId: string;
    repoRoot: string;
    excludePatterns: string[];
    disposables: vscode.Disposable[];
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
    const relative = path.relative(parentPath, candidatePath);
    return (
        relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    );
}

function findNearestCapabilityDirectory(repoRoot: string, changedPath: string): string | undefined {
    let current = path.dirname(changedPath);
    try {
        if (fs.existsSync(changedPath) && fs.statSync(changedPath).isDirectory()) {
            current = changedPath;
        }
    } catch {
        current = path.dirname(changedPath);
    }

    while (isPathInside(repoRoot, current)) {
        const manifestPath = path.join(current, 'CAPABILITY.md');
        if (fs.existsSync(manifestPath)) {
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

function normalizeDelayMs(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_AUTO_MAINTAIN_DELAY_MS;
    }

    return Math.max(250, Math.min(60000, Math.trunc(value)));
}

function getAutoMaintainEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('metaflow')
        .get<boolean>(AUTO_MAINTAIN_SETTING_KEY, true);
}

function getAutoMaintainDelayMs(): number {
    return normalizeDelayMs(
        vscode.workspace
            .getConfiguration('metaflow')
            .get<unknown>(AUTO_MAINTAIN_DELAY_SETTING_KEY, DEFAULT_AUTO_MAINTAIN_DELAY_MS),
    );
}

export function createCapabilityPluginMetadataScheduler(
    state: ExtensionState,
    workspaceRoot: string,
): vscode.Disposable & { sync(): void } {
    const watchedRepos = new Map<string, WatchedRepo>();
    let core: ReturnType<typeof createCapabilityPluginMetadataSchedulerCore>;

    const maintainDirtyRepo = async (target: DirtyCapabilityPluginMetadataRepo): Promise<void> => {
        const watched = watchedRepos.get(target.repoId);
        if (!watched) {
            return;
        }

        const result = await maintainAllCapabilityPluginMetadataInRepo(target.repoRoot, {
            repoId: target.repoId,
            excludePatterns: watched.excludePatterns,
            capabilityDirectoryPaths: target.capabilityDirectoryPaths,
        });

        if (result.failureCount > 0 || result.warnings.length > 0) {
            for (const failure of result.failures) {
                logWarn(
                    `MetaFlow: Auto-maintain failed for ${target.repoId}/${failure.layerPath}. ${failure.message}`,
                );
            }
            for (const warning of result.warnings) {
                logWarn(`MetaFlow: Auto-maintain warning for ${target.repoId}: ${warning.message}`);
            }

            const warningsChanged = mergeCapabilityWarningMessages(
                state.capabilityWarnings,
                collectCapabilityPluginMaintenanceWarningMessages(result),
            );
            if (warningsChanged) {
                state.onDidChange.fire();
            }
        }

        if (result.changedCount > 0 || result.marketplaceChanged) {
            logInfo(
                `Capability plugin metadata auto-maintained for ${target.repoId}: ${result.changedCount} capabilities changed, marketplace ${result.marketplaceChanged ? 'updated' : 'up to date'}.`,
            );
            await vscode.commands.executeCommand('metaflow.refresh', { skipRepoSync: true });
        }
    };

    core = createCapabilityPluginMetadataSchedulerCore({
        getDelayMs: getAutoMaintainDelayMs,
        maintainDirtyRepo,
        logInfo,
        logWarn,
        setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeoutFn: (handle) => clearTimeout(handle as NodeJS.Timeout),
    });

    const disposeRepo = (repoId: string): void => {
        const watched = watchedRepos.get(repoId);
        if (!watched) {
            return;
        }

        for (const disposable of watched.disposables) {
            disposable.dispose();
        }
        watchedRepos.delete(repoId);
    };

    const markDirty = (repo: WatchedRepo, uri: vscode.Uri): void => {
        const changedPath = uri.fsPath;
        const capabilityDirectoryPath = findNearestCapabilityDirectory(repo.repoRoot, changedPath);
        core.markDirty({
            repoId: repo.repoId,
            repoRoot: repo.repoRoot,
            capabilityDirectoryPath,
        });
    };

    const watchRepo = (repoId: string, repoRoot: string, excludePatterns: string[]): void => {
        const disposables: vscode.Disposable[] = [];
        const repo: WatchedRepo = { repoId, repoRoot, excludePatterns, disposables };

        for (const pattern of WATCH_PATTERNS) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(repoRoot, pattern),
            );
            disposables.push(
                watcher,
                watcher.onDidCreate((uri) => markDirty(repo, uri)),
                watcher.onDidChange((uri) => markDirty(repo, uri)),
                watcher.onDidDelete((uri) => markDirty(repo, uri)),
            );
        }

        watchedRepos.set(repoId, repo);
        logInfo(`Capability plugin metadata auto-maintenance watching ${repoId}.`);
    };

    const sync = (): void => {
        if (!getAutoMaintainEnabled() || !state.config) {
            for (const repoId of Array.from(watchedRepos.keys())) {
                disposeRepo(repoId);
            }
            return;
        }

        const { metadataRepos } = ensureMultiRepoConfig(state.config);
        const nextRepoIds = new Set<string>();

        for (const repo of metadataRepos) {
            if (repo.id === BUILT_IN_CAPABILITY_REPO_ID || !repo.localPath) {
                continue;
            }

            const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
            if (!fs.existsSync(repoRoot)) {
                continue;
            }

            nextRepoIds.add(repo.id);
            const excludePatterns = repo.discover?.exclude ?? [];
            const existing = watchedRepos.get(repo.id);
            const excludeKey = excludePatterns.join('\n');
            const existingExcludeKey = existing?.excludePatterns.join('\n');
            if (existing && existing.repoRoot === repoRoot && existingExcludeKey === excludeKey) {
                continue;
            }

            disposeRepo(repo.id);
            watchRepo(repo.id, repoRoot, excludePatterns);
        }

        for (const repoId of Array.from(watchedRepos.keys())) {
            if (!nextRepoIds.has(repoId)) {
                disposeRepo(repoId);
            }
        }
    };

    const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
        if (
            event.affectsConfiguration(`metaflow.${AUTO_MAINTAIN_SETTING_KEY}`) ||
            event.affectsConfiguration(`metaflow.${AUTO_MAINTAIN_DELAY_SETTING_KEY}`)
        ) {
            sync();
        }
    });

    return {
        sync,
        dispose: () => {
            configurationSubscription.dispose();
            for (const repoId of Array.from(watchedRepos.keys())) {
                disposeRepo(repoId);
            }
            core.dispose();
        },
    };
}
