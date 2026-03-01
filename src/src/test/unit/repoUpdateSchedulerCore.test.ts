import * as assert from 'assert';
import {
    createRepoUpdateSchedulerCore,
    type RepoUpdateSchedulerCoreDeps,
} from '../../repoUpdateSchedulerCore';

type Callback = () => void;

suite('repoUpdateSchedulerCore', () => {
    test('runs startup check and interval check callbacks', () => {
        const checks: Array<'startup' | 'interval'> = [];
        let intervalCallback: Callback | undefined;
        let timeoutCallback: Callback | undefined;

        const deps: RepoUpdateSchedulerCoreDeps = {
            getConfiguredInterval: () => 'hourly',
            onConfigurationChange: () => ({ dispose: () => { } }),
            runScheduledCheck: (reason) => {
                checks.push(reason);
            },
            logScheduled: () => { },
            setIntervalFn: (callback) => {
                intervalCallback = callback;
                return 1;
            },
            clearIntervalFn: () => { },
            setTimeoutFn: (callback) => {
                timeoutCallback = callback;
                return 2;
            },
            clearTimeoutFn: () => { },
        };

        createRepoUpdateSchedulerCore(deps);

        assert.ok(timeoutCallback, 'Startup callback should be registered');
        timeoutCallback?.();
        assert.ok(intervalCallback, 'Interval callback should be registered');
        intervalCallback?.();

        assert.deepStrictEqual(checks, ['startup', 'interval']);
    });

    test('reschedules interval when configuration changes', () => {
        let onConfigChange: Callback | undefined;
        const cleared: unknown[] = [];
        const createdDelays: number[] = [];

        const deps: RepoUpdateSchedulerCoreDeps = {
            getConfiguredInterval: () => createdDelays.length === 0 ? 'daily' : 'weekly',
            onConfigurationChange: (handler) => {
                onConfigChange = handler;
                return { dispose: () => { } };
            },
            runScheduledCheck: () => { },
            logScheduled: () => { },
            setIntervalFn: (_callback, delayMs) => {
                createdDelays.push(delayMs);
                return createdDelays.length;
            },
            clearIntervalFn: (handle) => {
                cleared.push(handle);
            },
            setTimeoutFn: () => 99,
            clearTimeoutFn: () => { },
        };

        createRepoUpdateSchedulerCore(deps);
        onConfigChange?.();

        const hourMs = 60 * 60 * 1000;
        assert.deepStrictEqual(createdDelays, [24 * hourMs, 7 * 24 * hourMs]);
        assert.deepStrictEqual(cleared, [1]);
    });

    test('dispose clears timers and subscription', () => {
        const clearedIntervals: unknown[] = [];
        const clearedTimeouts: unknown[] = [];
        let disposed = false;

        const scheduler = createRepoUpdateSchedulerCore({
            getConfiguredInterval: () => 'daily',
            onConfigurationChange: () => ({
                dispose: () => {
                    disposed = true;
                },
            }),
            runScheduledCheck: () => { },
            logScheduled: () => { },
            setIntervalFn: () => 123,
            clearIntervalFn: (handle) => {
                clearedIntervals.push(handle);
            },
            setTimeoutFn: () => 456,
            clearTimeoutFn: (handle) => {
                clearedTimeouts.push(handle);
            },
        });

        scheduler.dispose();

        assert.deepStrictEqual(clearedIntervals, [123]);
        assert.deepStrictEqual(clearedTimeouts, [456]);
        assert.strictEqual(disposed, true);
    });
});
