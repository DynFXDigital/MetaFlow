import {
    DEFAULT_REPO_UPDATE_CHECK_INTERVAL,
    getRepoUpdateCheckIntervalMs,
    normalizeRepoUpdateCheckInterval,
    type RepoUpdateCheckInterval,
} from './repoUpdateInterval';

const STARTUP_CHECK_DELAY_MS = 1500;

export interface RepoUpdateSchedulerCoreDeps {
    getConfiguredInterval: () => unknown;
    onConfigurationChange: (handler: () => void) => { dispose: () => void };
    runScheduledCheck: (reason: 'startup' | 'interval') => void;
    logScheduled: (interval: RepoUpdateCheckInterval) => void;
    setIntervalFn: (callback: () => void, delayMs: number) => unknown;
    clearIntervalFn: (handle: unknown) => void;
    setTimeoutFn: (callback: () => void, delayMs: number) => unknown;
    clearTimeoutFn: (handle: unknown) => void;
}

export interface RepoUpdateSchedulerCore {
    dispose: () => void;
}

export function createRepoUpdateSchedulerCore(
    deps: RepoUpdateSchedulerCoreDeps,
): RepoUpdateSchedulerCore {
    let intervalHandle: unknown;

    const schedule = () => {
        if (intervalHandle !== undefined) {
            deps.clearIntervalFn(intervalHandle);
            intervalHandle = undefined;
        }

        const configured = deps.getConfiguredInterval();
        const interval = normalizeRepoUpdateCheckInterval(configured);
        const intervalMs = getRepoUpdateCheckIntervalMs(interval);

        intervalHandle = deps.setIntervalFn(() => {
            deps.runScheduledCheck('interval');
        }, intervalMs);

        deps.logScheduled(interval);
    };

    schedule();

    const startupHandle = deps.setTimeoutFn(() => {
        deps.runScheduledCheck('startup');
    }, STARTUP_CHECK_DELAY_MS);

    const configSubscription = deps.onConfigurationChange(() => {
        schedule();
    });

    return {
        dispose: () => {
            if (intervalHandle !== undefined) {
                deps.clearIntervalFn(intervalHandle);
            }
            if (startupHandle !== undefined) {
                deps.clearTimeoutFn(startupHandle);
            }
            configSubscription.dispose();
        },
    };
}

export { DEFAULT_REPO_UPDATE_CHECK_INTERVAL };
