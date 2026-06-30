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
    test('coalesces rapid mutations before the refresh timer fires', async () => {
        const events: string[] = [];
        const queue = createLayerTreeCheckboxQueue({
            refresh: async () => {
                events.push('refresh');
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onRefreshError: (error) => {
                throw error;
            },
        });

        void queue.enqueueMutation(async () => {
            events.push('mutation-1');
        });
        queue.scheduleRefresh(1);
        void queue.enqueueMutation(async () => {
            events.push('mutation-2');
        });
        queue.scheduleRefresh(2);

        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, ['mutation-1', 'mutation-2', 'refresh', 'clear-2']);
    });

    test('serializes mutations that arrive while refresh is running', async () => {
        const events: string[] = [];
        const firstRefresh = deferred();
        let refreshCount = 0;
        const queue = createLayerTreeCheckboxQueue({
            refresh: async () => {
                refreshCount += 1;
                events.push(`refresh-${refreshCount}-start`);
                if (refreshCount === 1) {
                    await firstRefresh.promise;
                }
                events.push(`refresh-${refreshCount}-end`);
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onRefreshError: (error) => {
                throw error;
            },
        });

        void queue.enqueueMutation(async () => {
            events.push('mutation-1');
        });
        queue.scheduleRefresh(1);

        await waitFor(() => events.includes('refresh-1-start'));

        void queue.enqueueMutation(async () => {
            events.push('mutation-2');
        });
        queue.scheduleRefresh(2);
        await tick();

        assert.deepStrictEqual(events, ['mutation-1', 'refresh-1-start']);

        firstRefresh.resolve();
        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, [
            'mutation-1',
            'refresh-1-start',
            'refresh-1-end',
            'clear-1',
            'mutation-2',
            'refresh-2-start',
            'refresh-2-end',
            'clear-2',
        ]);
    });

    test('continues queued work after a mutation rejects', async () => {
        const events: string[] = [];
        const queue = createLayerTreeCheckboxQueue({
            refresh: async () => {
                events.push('refresh');
            },
            clearPendingStates: (sequence) => {
                events.push(`clear-${sequence}`);
            },
            onRefreshError: (error) => {
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
        queue.scheduleRefresh(2);

        await waitFor(() => events.includes('clear-2'));

        assert.deepStrictEqual(events, ['mutation-1', 'mutation-2', 'refresh', 'clear-2']);
    });
});
