export interface LayerTreeCheckboxQueueOptions {
    refresh: () => Promise<void>;
    clearPendingStates: (maxSequence: number) => void;
    onRefreshError: (error: unknown) => void;
}

export interface LayerTreeCheckboxQueue {
    enqueueMutation: (mutation: () => Promise<void>) => Promise<void>;
    scheduleRefresh: (clearThroughSequence: number) => void;
}

export function createLayerTreeCheckboxQueue(
    options: LayerTreeCheckboxQueueOptions,
): LayerTreeCheckboxQueue {
    let operationQueue = Promise.resolve();
    let pendingRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingRefreshClearSequence = 0;
    let deferredRefreshClearSequence = 0;
    let refreshQueuedOrRunning = false;

    const enqueueOperation = (operation: () => Promise<void>): Promise<void> => {
        const run = operationQueue.then(operation, operation);
        operationQueue = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    };

    const enqueueRefresh = (clearThroughSequence: number): void => {
        if (refreshQueuedOrRunning) {
            deferredRefreshClearSequence = Math.max(
                deferredRefreshClearSequence,
                clearThroughSequence,
            );
            return;
        }

        refreshQueuedOrRunning = true;
        void enqueueOperation(async () => {
            try {
                await options.refresh();
            } catch (error: unknown) {
                options.onRefreshError(error);
            } finally {
                options.clearPendingStates(clearThroughSequence);
                refreshQueuedOrRunning = false;

                if (deferredRefreshClearSequence > 0) {
                    const deferredClearSequence = deferredRefreshClearSequence;
                    deferredRefreshClearSequence = 0;
                    enqueueRefresh(deferredClearSequence);
                }
            }
        });
    };

    return {
        enqueueMutation: (mutation) => enqueueOperation(mutation),
        scheduleRefresh: (clearThroughSequence) => {
            pendingRefreshClearSequence = Math.max(
                pendingRefreshClearSequence,
                clearThroughSequence,
            );
            if (pendingRefreshTimer) {
                clearTimeout(pendingRefreshTimer);
            }
            pendingRefreshTimer = setTimeout(() => {
                const sequenceToClear = pendingRefreshClearSequence;
                pendingRefreshClearSequence = 0;
                pendingRefreshTimer = undefined;

                enqueueRefresh(sequenceToClear);
            });
        },
    };
}
