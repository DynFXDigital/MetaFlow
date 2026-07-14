import * as assert from 'assert';
import { createRefreshCoordinator } from '../../refreshCoordinator';

suite('refreshCoordinator', () => {
    test('serializes overlapping requests and runs a trailing request', async () => {
        const started: string[] = [];
        const releaseFirst = (() => {
            let release!: () => void;
            const promise = new Promise<void>((resolve) => {
                release = resolve;
            });
            return { promise, release };
        })();

        const coordinator = createRefreshCoordinator<string>({
            execute: async (request) => {
                started.push(request);
                if (request === 'first') {
                    await releaseFirst.promise;
                }
            },
            merge: (current, next) => `${current}+${next}`,
        });

        const first = coordinator.request('first');
        await new Promise((resolve) => setImmediate(resolve));
        const second = coordinator.request('second');
        releaseFirst.release();

        await Promise.all([first, second]);
        assert.deepStrictEqual(started, ['first', 'second']);
        coordinator.dispose();
    });

    test('debounces scheduled requests', async () => {
        let scheduledCallback: (() => void) | undefined;
        let executions = 0;
        const coordinator = createRefreshCoordinator<string>({
            execute: async (request) => {
                executions += request.length;
            },
            debounceMs: 10,
            setTimeoutFn: (callback) => {
                scheduledCallback = callback;
                return callback;
            },
            clearTimeoutFn: () => {},
        });

        coordinator.schedule('a');
        coordinator.schedule('bb');
        assert.strictEqual(executions, 0);
        scheduledCallback!();
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(executions, 2);
        coordinator.dispose();
    });
});
