export interface LayerTreeCheckboxQueueOptions {
    settle: () => Promise<void>;
    clearPendingStates: (maxSequence: number) => void;
    onSettleError: (error: unknown) => void;
}

export interface LayerTreeCheckboxQueue {
    enqueueMutation: (mutation: () => Promise<void>) => Promise<void>;
    scheduleSettlement: (clearThroughSequence: number) => void;
}

export function createLayerTreeCheckboxQueue(
    options: LayerTreeCheckboxQueueOptions,
): LayerTreeCheckboxQueue {
    let operationQueue = Promise.resolve();
    let pendingSettlementTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingSettlementClearSequence = 0;
    let deferredSettlementClearSequence = 0;
    let settlementQueuedOrRunning = false;

    const enqueueOperation = (operation: () => Promise<void>): Promise<void> => {
        const run = operationQueue.then(operation, operation);
        operationQueue = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    };

    const enqueueSettlement = (clearThroughSequence: number): void => {
        if (settlementQueuedOrRunning) {
            deferredSettlementClearSequence = Math.max(
                deferredSettlementClearSequence,
                clearThroughSequence,
            );
            return;
        }

        settlementQueuedOrRunning = true;
        void enqueueOperation(async () => {
            try {
                await options.settle();
            } catch (error: unknown) {
                options.onSettleError(error);
            } finally {
                options.clearPendingStates(clearThroughSequence);
                settlementQueuedOrRunning = false;

                if (deferredSettlementClearSequence > 0) {
                    const deferredClearSequence = deferredSettlementClearSequence;
                    deferredSettlementClearSequence = 0;
                    enqueueSettlement(deferredClearSequence);
                }
            }
        });
    };

    return {
        enqueueMutation: (mutation) => enqueueOperation(mutation),
        scheduleSettlement: (clearThroughSequence) => {
            pendingSettlementClearSequence = Math.max(
                pendingSettlementClearSequence,
                clearThroughSequence,
            );
            if (pendingSettlementTimer) {
                clearTimeout(pendingSettlementTimer);
            }
            pendingSettlementTimer = setTimeout(() => {
                const sequenceToClear = pendingSettlementClearSequence;
                pendingSettlementClearSequence = 0;
                pendingSettlementTimer = undefined;

                enqueueSettlement(sequenceToClear);
            });
        },
    };
}
