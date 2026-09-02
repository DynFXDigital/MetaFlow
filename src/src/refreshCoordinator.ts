export interface RefreshCoordinator<T> {
    request(request: T): Promise<void>;
    schedule(request: T): void;
    dispose(): void;
}

export interface RefreshCoordinatorOptions<T> {
    execute(request: T): Promise<void>;
    onSettled?(): void;
    merge?(current: T, next: T): T;
    debounceMs?: number;
    setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
    clearTimeoutFn?: (handle: unknown) => void;
}

interface Waiter {
    resolve(): void;
    reject(error: unknown): void;
}

const DEFAULT_DEBOUNCE_MS = 200;

export function createRefreshCoordinator<T>(
    options: RefreshCoordinatorOptions<T>,
): RefreshCoordinator<T> {
    const setTimeoutFn =
        options.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const clearTimeoutFn =
        options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    const merge = options.merge ?? ((_current, next) => next);

    let activeRequest: T | undefined;
    let runningRequest: T | undefined;
    let backgroundOnly = false;
    let backgroundRequest: T | undefined;
    let running = false;
    let scheduledHandle: unknown;
    let disposed = false;
    const waiters: Waiter[] = [];

    const settleWaiters = (error?: unknown): void => {
        const pendingWaiters = waiters.splice(0, waiters.length);
        for (const waiter of pendingWaiters) {
            if (error === undefined) {
                waiter.resolve();
            } else {
                waiter.reject(error);
            }
        }
    };

    const drain = async (): Promise<void> => {
        if (running || disposed) {
            return;
        }

        running = true;
        let lastError: unknown;
        try {
            while (activeRequest !== undefined && !disposed) {
                const request = activeRequest;
                activeRequest = undefined;
                backgroundOnly = false;
                backgroundRequest = undefined;
                runningRequest = request;
                try {
                    await options.execute(request);
                } catch (error: unknown) {
                    lastError = error;
                } finally {
                    runningRequest = undefined;
                }
            }
        } finally {
            running = false;
            try {
                options.onSettled?.();
            } catch (error: unknown) {
                lastError = error;
            }
            if (disposed) {
                settleWaiters(new Error('MetaFlow refresh coordinator disposed.'));
            } else {
                settleWaiters(lastError);
            }
        }
    };

    const request = (next: T): Promise<void> => {
        if (disposed) {
            return Promise.reject(new Error('MetaFlow refresh coordinator disposed.'));
        }

        if (scheduledHandle !== undefined) {
            clearTimeoutFn(scheduledHandle);
            scheduledHandle = undefined;
        }

        const pending = backgroundOnly ? backgroundRequest : activeRequest;
        activeRequest = pending === undefined ? next : merge(pending, next);
        backgroundOnly = false;
        backgroundRequest = undefined;
        const promise = new Promise<void>((resolve, reject) => {
            waiters.push({ resolve, reject });
        });
        void drain();
        return promise;
    };

    const schedule = (next: T): void => {
        if (disposed) {
            return;
        }

        // Background work belongs to the active refresh batch. Keep that
        // batch's restrictions; a later explicit request retains its own policy.
        if (activeRequest === undefined || backgroundOnly) {
            backgroundRequest =
                backgroundRequest === undefined ? next : merge(backgroundRequest, next);
            activeRequest =
                runningRequest === undefined
                    ? backgroundRequest
                    : merge(runningRequest, backgroundRequest);
            backgroundOnly = true;
        } else {
            // An explicitly queued request, not the current background batch,
            // owns the policy of the next execution.
            activeRequest = merge(activeRequest, next);
        }
        if (scheduledHandle !== undefined) {
            clearTimeoutFn(scheduledHandle);
        }
        scheduledHandle = setTimeoutFn(() => {
            scheduledHandle = undefined;
            if (running) {
                return; // The active drain consumes pending work before settling.
            }
            const scheduledRequest = activeRequest;
            activeRequest = undefined;
            backgroundOnly = false;
            backgroundRequest = undefined;
            if (scheduledRequest !== undefined) {
                void request(scheduledRequest);
            }
        }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    };

    return {
        request,
        schedule,
        dispose: () => {
            disposed = true;
            if (scheduledHandle !== undefined) {
                clearTimeoutFn(scheduledHandle);
                scheduledHandle = undefined;
            }
            activeRequest = undefined;
        },
    };
}
