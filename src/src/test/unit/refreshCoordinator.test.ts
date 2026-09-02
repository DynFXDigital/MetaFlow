import * as assert from 'assert';
import { createRefreshCoordinator } from '../../refreshCoordinator';

suite('refreshCoordinator', () => {
    test('does not merge idle scheduled work with itself when its timer fires', async () => {
        let callback!: () => void;
        const executions: string[] = [];
        const coordinator = createRefreshCoordinator<string>({
            execute: async (value) => {
                executions.push(value);
            },
            merge: (left, right) => `${left}+${right}`,
            setTimeoutFn: (next) => {
                callback = next;
                return next;
            },
            clearTimeoutFn: () => {},
        });
        coordinator.schedule('one');
        callback();
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepStrictEqual(executions, ['one']);
        coordinator.dispose();
    });

    test('explicit requests override inherited background policy and completion waits for the batch', async () => {
        const executions: boolean[] = [];
        const releases: Array<() => void> = [];
        let completions = 0;
        let timer: (() => void) | undefined;
        const coordinator = createRefreshCoordinator<{ skipConfigMaintenance?: boolean }>({
            execute: async (options) => {
                executions.push(options.skipConfigMaintenance === true);
                await new Promise<void>((resolve) => {
                    releases.push(resolve);
                });
            },
            merge: (left, right) => ({
                skipConfigMaintenance: left.skipConfigMaintenance || right.skipConfigMaintenance,
            }),
            onSettled: () => {
                completions++;
            },
            setTimeoutFn: (callback) => {
                timer = callback;
                return callback;
            },
            clearTimeoutFn: () => {},
        });
        const first = coordinator.request({ skipConfigMaintenance: true });
        coordinator.schedule({});
        timer!(); // A timer that fires while executing must remain background work.
        const second = coordinator.request({});
        coordinator.schedule({});
        releases[0]();
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepStrictEqual(executions, [true, false]);
        assert.strictEqual(completions, 0, 'completion must not be signaled between executions');
        releases[1]();
        await Promise.all([first, second]);
        assert.strictEqual(completions, 1);
        coordinator.dispose();
    });

    test('rejects waiters if completion notification fails instead of leaving them pending', async () => {
        const coordinator = createRefreshCoordinator<string>({
            execute: async () => {},
            onSettled: () => {
                throw new Error('completion failed');
            },
        });
        await assert.rejects(coordinator.request('refresh'), /completion failed/);
        coordinator.dispose();
    });

    test('coalesces pending background work into an explicit restricted refresh', async () => {
        const executions: boolean[] = [];
        let callback: (() => void) | undefined;
        let cleared = false;
        const coordinator = createRefreshCoordinator<{ skipConfigMaintenance?: boolean }>({
            execute: async (options) => {
                executions.push(options.skipConfigMaintenance === true);
            },
            merge: (left, right) => ({
                skipConfigMaintenance: left.skipConfigMaintenance || right.skipConfigMaintenance,
            }),
            setTimeoutFn: (next) => {
                callback = next;
                return next;
            },
            clearTimeoutFn: () => {
                cleared = true;
            },
        });
        coordinator.schedule({});
        await coordinator.request({ skipConfigMaintenance: true });
        assert.strictEqual(cleared, true, 'the pending timer must be cancelled');
        callback!();
        assert.deepStrictEqual(executions, [true]);
        coordinator.dispose();
    });

    test('keeps maintenance disabled for background work arriving during a restricted refresh', async () => {
        const executions: boolean[] = [];
        let release!: () => void;
        const paused = new Promise<void>((resolve) => {
            release = resolve;
        });
        let legacyPresent = true;
        const coordinator = createRefreshCoordinator<{ skipConfigMaintenance?: boolean }>({
            execute: async (options) => {
                executions.push(options.skipConfigMaintenance === true);
                if (executions.length === 1) {
                    await paused;
                }
                if (!options.skipConfigMaintenance) {
                    legacyPresent = false;
                }
            },
            merge: (left, right) => ({
                skipConfigMaintenance: left.skipConfigMaintenance || right.skipConfigMaintenance,
            }),
        });
        try {
            const explicit = coordinator.request({ skipConfigMaintenance: true });
            coordinator.schedule({});
            release();
            await explicit;
            assert.strictEqual(
                legacyPresent,
                true,
                'background refresh must not clean legacy config before the restricted caller returns',
            );
            assert.deepStrictEqual(executions, [true, true]);
            await coordinator.request({});
            assert.strictEqual(
                legacyPresent,
                false,
                'a subsequent explicit refresh must still perform maintenance',
            );
            assert.deepStrictEqual(executions, [true, true, false]);
        } finally {
            coordinator.dispose();
        }
    });

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
