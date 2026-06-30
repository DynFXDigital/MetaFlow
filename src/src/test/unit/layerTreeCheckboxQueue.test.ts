import * as assert from 'assert';
import { createLayerTreeCheckboxQueue } from '../../layerTreeCheckboxQueue';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function tick(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitFor(assertion: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (assertion()) {
            return;
        }
        await tick();
    }
    assert.ok(assertion(), 'condition was not reached before timeout');
}

suite('Layer tree checkbox queue', () => {
    test('coalesces rapid mutations before the settlement timer fires', async () => {
        const events: string[] = [];
        const queue = createLayerTreeCheckboxQueue({
            settle: async () => {
                events.push('settle');
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onSettleError: (error) => {
                throw error;
            },
        });

        void queue.enqueueMutation(async () => {
            events.push('mutation-1');
        });
        queue.scheduleSettlement(1);
        void queue.enqueueMutation(async () => {
            events.push('mutation-2');
        });
        queue.scheduleSettlement(2);

        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, ['mutation-1', 'mutation-2', 'settle', 'clear-2']);
    });

    test('serializes mutations that arrive while settlement is running', async () => {
        const events: string[] = [];
        const firstSettlement = deferred();
        let settlementCount = 0;
        const queue = createLayerTreeCheckboxQueue({
            settle: async () => {
                settlementCount += 1;
                events.push(`settle-${settlementCount}-start`);
                if (settlementCount === 1) {
                    await firstSettlement.promise;
                }
                events.push(`settle-${settlementCount}-end`);
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onSettleError: (error) => {
                throw error;
            },
        });

        void queue.enqueueMutation(async () => {
            events.push('mutation-1');
        });
        queue.scheduleSettlement(1);

        await waitFor(() => events.includes('settle-1-start'));

        void queue.enqueueMutation(async () => {
            events.push('mutation-2');
        });
        queue.scheduleSettlement(2);
        await tick();

        assert.deepStrictEqual(events, ['mutation-1', 'settle-1-start']);

        firstSettlement.resolve();
        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, [
            'mutation-1',
            'settle-1-start',
            'settle-1-end',
            'clear-1',
            'mutation-2',
            'settle-2-start',
            'settle-2-end',
            'clear-2',
        ]);
    });

    test('continues queued work after a mutation rejects', async () => {
        const events: string[] = [];
        const queue = createLayerTreeCheckboxQueue({
            settle: async () => {
                events.push('settle');
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onSettleError: (error) => {
                throw error;
            },
        });

        void queue.enqueueMutation(async () => {
            events.push('mutation-1');
            throw new Error('failed mutation');
        });
        void queue.enqueueMutation(async () => {
            events.push('mutation-2');
        });
        queue.scheduleSettlement(2);

        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, ['mutation-1', 'mutation-2', 'settle', 'clear-2']);
    });
});
