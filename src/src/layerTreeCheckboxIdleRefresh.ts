export const LAYER_TREE_CHECKBOX_REFRESH_IDLE_MS = 3000;

export const LAYER_TREE_CHECKBOX_IDLE_REFRESH_OPTIONS = {
    skipRepoSync: true,
    preferStateConfig: true,
    skipLoadingState: true,
    skipStateChangeEvent: true,
} as const;

export type LayerTreeCheckboxIdleRefreshOptions =
    typeof LAYER_TREE_CHECKBOX_IDLE_REFRESH_OPTIONS;

type TimerHandle = unknown;

export interface LayerTreeCheckboxIdleRefreshTimers {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}

export interface LayerTreeCheckboxIdleRefreshSchedulerOptions {
    idleMs?: number;
    timers?: LayerTreeCheckboxIdleRefreshTimers;
    executeRefresh(options: LayerTreeCheckboxIdleRefreshOptions): PromiseLike<unknown> | unknown;
    fireStateChanged(): void;
    onRefreshError(error: unknown): void;
}

export interface LayerTreeCheckboxIdleRefreshScheduler {
    schedule(): void;
    dispose(): void;
}

const defaultTimers: LayerTreeCheckboxIdleRefreshTimers = {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createLayerTreeCheckboxIdleRefreshScheduler(
    options: LayerTreeCheckboxIdleRefreshSchedulerOptions,
): LayerTreeCheckboxIdleRefreshScheduler {
    const idleMs = options.idleMs ?? LAYER_TREE_CHECKBOX_REFRESH_IDLE_MS;
    const timers = options.timers ?? defaultTimers;
    let refreshTimer: TimerHandle | undefined;
    let refreshRunning = false;
    let refreshRequested = false;
    let disposed = false;

    function clearRefreshTimer(): void {
        if (refreshTimer !== undefined) {
            timers.clearTimeout(refreshTimer);
            refreshTimer = undefined;
        }
    }

    function runRefresh(): void {
        refreshTimer = undefined;
        if (disposed || refreshRunning || !refreshRequested) {
            return;
        }

        refreshRunning = true;
        refreshRequested = false;
        void Promise.resolve(options.executeRefresh(LAYER_TREE_CHECKBOX_IDLE_REFRESH_OPTIONS))
            .then(() => {
                if (!disposed) {
                    options.fireStateChanged();
                }
            })
            .catch((error: unknown) => {
                if (!disposed) {
                    options.onRefreshError(error);
                }
            })
            .finally(() => {
                refreshRunning = false;
                if (!disposed && refreshRequested) {
                    schedule();
                }
            });
    }

    function schedule(): void {
        if (disposed) {
            return;
        }
        refreshRequested = true;
        clearRefreshTimer();
        refreshTimer = timers.setTimeout(runRefresh, idleMs);
    }

    return {
        schedule,
        dispose: () => {
            disposed = true;
            refreshRequested = false;
            clearRefreshTimer();
        },
    };
}
