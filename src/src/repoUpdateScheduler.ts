import * as vscode from 'vscode';
import { logInfo, logWarn } from './views/outputChannel';
import {
    DEFAULT_REPO_UPDATE_CHECK_INTERVAL,
    createRepoUpdateSchedulerCore,
} from './repoUpdateSchedulerCore';

const CHECK_INTERVAL_SETTING_KEY = 'repoUpdateCheckInterval';

interface RepoUpdateCheckCommandResult {
    executed?: boolean;
    reason?: string;
}

async function runScheduledRepoCheck(reason: 'startup' | 'interval'): Promise<void> {
    try {
        const result = await vscode.commands.executeCommand<RepoUpdateCheckCommandResult>(
            'metaflow.checkRepoUpdates',
            {
                allRepos: true,
                silent: true,
            },
        );

        if (result?.executed === false) {
            logInfo(`Repository update check skipped (${reason}): ${result.reason ?? 'unknown'}.`);
        } else {
            logInfo(`Repository update check completed (${reason}).`);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`Repository update check failed (${reason}): ${message}`);
    }
}

export function createRepoUpdateScheduler(): vscode.Disposable {
    const core = createRepoUpdateSchedulerCore({
        getConfiguredInterval: () =>
            vscode.workspace
                .getConfiguration('metaflow')
                .get<unknown>(CHECK_INTERVAL_SETTING_KEY, DEFAULT_REPO_UPDATE_CHECK_INTERVAL),
        onConfigurationChange: (handler) =>
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(`metaflow.${CHECK_INTERVAL_SETTING_KEY}`)) {
                    handler();
                }
            }),
        runScheduledCheck: (reason) => {
            void runScheduledRepoCheck(reason);
        },
        logScheduled: (interval) => {
            logInfo(`Repository update checks scheduled (${interval}).`);
        },
        setIntervalFn: (callback, delayMs) => setInterval(callback, delayMs),
        clearIntervalFn: (handle) => clearInterval(handle as NodeJS.Timeout),
        setTimeoutFn: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeoutFn: (handle) => clearTimeout(handle as NodeJS.Timeout),
    });

    return { dispose: () => core.dispose() };
}
