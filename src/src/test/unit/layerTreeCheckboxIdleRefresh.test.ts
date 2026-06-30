import * as assert from 'assert';
import {
    createLayerTreeCheckboxIdleRefreshScheduler,
    LAYER_TREE_CHECKBOX_IDLE_REFRESH_OPTIONS,
} from '../../layerTreeCheckboxIdleRefresh';

type TimerCallback = () => void;

class FakeTimers {
    private nextHandle = 1;
    private readonly pending = new Map<number, { callback: TimerCallback; delayMs: number }>();

    readonly timers = {
        setTimeout: (callback: TimerCallback, delayMs: number): number => {
            const handle = this.nextHandle;
            this.nextHandle += 1;
            this.pending.set(handle, { callback, delayMs });
            return handle;
        },
        clearTimeout: (handle: unknown): void => {
            this.pending.delete(handle as number);
        },
    };

    get pendingCount(): number {
        return this.pending.size;
    }

    get pendingDelayMs(): number | undefined {
        return Array.from(this.pending.values())[0]?.delayMs;
    }

    fireNext(): void {
        const nextEntry = this.pending.entries().next().value as
            | [number, { callback: TimerCallback; delayMs: number }]
            | undefined;
        if (!nextEntry) {
            assert.fail('expected a pending timer');
        }
        const [handle, timer] = nextEntry;
        this.pending.delete(handle);
        timer.callback();
    }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
    }
}

suite('Layer tree checkbox idle refresh', () => {
    test('debounces rapid settlement requests into one idle refresh', async () => {
        const fakeTimers = new FakeTimers();
        const refreshOptions: unknown[] = [];
        let stateChangeCount = 0;
        const scheduler = createLayerTreeCheckboxIdleRefreshScheduler({
            idleMs: 123,
            timers: fakeTimers.timers,
            executeRefresh: async (options) => {
                refreshOptions.push(options);
            },
            fireStateChanged: () => {
                stateChangeCount += 1;
            },
            onRefreshError: (error) => {
                throw error;
            },
        });

        scheduler.schedule();
        scheduler.schedule();
        scheduler.schedule();

        assert.strictEqual(fakeTimers.pendingCount, 1);
        assert.strictEqual(fakeTimers.pendingDelayMs, 123);
        assert.deepStrictEqual(refreshOptions, []);

        fakeTimers.fireNext();
        await flushMicrotasks();

        assert.deepStrictEqual(refreshOptions, [LAYER_TREE_CHECKBOX_IDLE_REFRESH_OPTIONS]);
        assert.strictEqual(stateChangeCount, 1);
        assert.strictEqual(fakeTimers.pendingCount, 0);
    });

    test('uses non-blocking refresh options that avoid checkbox reset behavior', async () => {
        const fakeTimers = new FakeTimers();
        let receivedOptions: unknown;
        const scheduler = createLayerTreeCheckboxIdleRefreshScheduler({
            timers: fakeTimers.timers,
            executeRefresh: async (options) => {
                receivedOptions = options;
            },
            fireStateChanged: () => undefined,
            onRefreshError: (error) => {
                throw error;
            },
        });

        scheduler.schedule();
        fakeTimers.fireNext();
        await flushMicrotasks();

        assert.deepStrictEqual(receivedOptions, {
            skipRepoSync: true,
            skipConfigMaintenance: true,
            preferStateConfig: true,
            skipLoadingState: true,
            skipStateChangeEvent: true,
        });
    });

    test('preserves a refresh request that arrives while refresh is running', async () => {
        const fakeTimers = new FakeTimers();
        const firstRefresh = deferred();
        let refreshCount = 0;
        let stateChangeCount = 0;
        const scheduler = createLayerTreeCheckboxIdleRefreshScheduler({
            idleMs: 7,
            timers: fakeTimers.timers,
            executeRefresh: async () => {
                refreshCount += 1;
                if (refreshCount === 1) {
                    await firstRefresh.promise;
                }
            },
            fireStateChanged: () => {
                stateChangeCount += 1;
            },
            onRefreshError: (error) => {
                throw error;
            },
        });

        scheduler.schedule();
        fakeTimers.fireNext();
        await flushMicrotasks();
        assert.strictEqual(refreshCount, 1);

        scheduler.schedule();
        assert.strictEqual(fakeTimers.pendingCount, 1);
        fakeTimers.fireNext();
        await flushMicrotasks();
        assert.strictEqual(refreshCount, 1);

        firstRefresh.resolve();
        await flushMicrotasks();
        assert.strictEqual(stateChangeCount, 1);
        assert.strictEqual(fakeTimers.pendingCount, 1);
        assert.strictEqual(fakeTimers.pendingDelayMs, 7);

        fakeTimers.fireNext();
        await flushMicrotasks();
        assert.strictEqual(refreshCount, 2);
        assert.strictEqual(stateChangeCount, 2);
    });

    test('clears a pending refresh when disposed', async () => {
        const fakeTimers = new FakeTimers();
        let refreshCount = 0;
        const scheduler = createLayerTreeCheckboxIdleRefreshScheduler({
            timers: fakeTimers.timers,
            executeRefresh: async () => {
                refreshCount += 1;
            },
            fireStateChanged: () => undefined,
            onRefreshError: (error) => {
                throw error;
            },
        });

        scheduler.schedule();
        scheduler.dispose();

        assert.strictEqual(fakeTimers.pendingCount, 0);
        await flushMicrotasks();
        assert.strictEqual(refreshCount, 0);
    });
});
