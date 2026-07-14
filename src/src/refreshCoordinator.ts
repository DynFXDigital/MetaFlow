export interface RefreshCoordinator<T> {
    request(request: T): Promise<void>;
    schedule(request: T): void;
    dispose(): void;
}

export interface RefreshCoordinatorOptions<T> {
    execute(request: T): Promise<void>;
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
    const setTimeoutFn = options.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    const merge = options.merge ?? ((_current, next) => next);

    let activeRequest: T | undefined;
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
                try {
                    await options.execute(request);
                } catch (error: unknown) {
                    lastError = error;
                }
            }
        } finally {
            running = false;
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

        activeRequest = activeRequest === undefined ? next : merge(activeRequest, next);
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

        activeRequest = activeRequest === undefined ? next : merge(activeRequest, next);
        if (scheduledHandle !== undefined) {
            clearTimeoutFn(scheduledHandle);
        }
        scheduledHandle = setTimeoutFn(() => {
            scheduledHandle = undefined;
            const scheduledRequest = activeRequest;
            activeRequest = undefined;
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
