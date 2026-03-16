import * as assert from 'assert';
import {
    normalizeRepoUpdateCheckInterval,
    getRepoUpdateCheckIntervalMs,
} from '../../repoUpdateInterval';

suite('repoUpdateScheduler', () => {
    test('normalizeRepoUpdateCheckInterval accepts known values', () => {
        assert.strictEqual(normalizeRepoUpdateCheckInterval('hourly'), 'hourly');
        assert.strictEqual(normalizeRepoUpdateCheckInterval('daily'), 'daily');
        assert.strictEqual(normalizeRepoUpdateCheckInterval('weekly'), 'weekly');
        assert.strictEqual(normalizeRepoUpdateCheckInterval('monthly'), 'monthly');
    });

    test('normalizeRepoUpdateCheckInterval falls back to daily for unknown values', () => {
        assert.strictEqual(normalizeRepoUpdateCheckInterval('other'), 'daily');
        assert.strictEqual(normalizeRepoUpdateCheckInterval(undefined), 'daily');
    });

    test('getRepoUpdateCheckIntervalMs maps intervals to expected durations', () => {
        const hourMs = 60 * 60 * 1000;
        assert.strictEqual(getRepoUpdateCheckIntervalMs('hourly'), hourMs);
        assert.strictEqual(getRepoUpdateCheckIntervalMs('daily'), 24 * hourMs);
        assert.strictEqual(getRepoUpdateCheckIntervalMs('weekly'), 7 * 24 * hourMs);
        assert.strictEqual(getRepoUpdateCheckIntervalMs('monthly'), 30 * 24 * hourMs);
    });

    test('getRepoUpdateCheckIntervalMs defaults to daily for unrecognized value', () => {
        const hourMs = 60 * 60 * 1000;
        // Cast required to exercise the unreachable default branch at runtime
        assert.strictEqual(getRepoUpdateCheckIntervalMs('unknown' as never), 24 * hourMs);
    });
});
