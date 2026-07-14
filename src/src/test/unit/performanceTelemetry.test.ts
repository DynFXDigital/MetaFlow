import * as assert from 'assert';
import { createPerformanceTimer } from '../../performanceTelemetry';

suite('performanceTelemetry', () => {
    test('records monotonic phase timings without exposing payload data', () => {
        let now = 100;
        const timer = createPerformanceTimer(() => now);

        now = 125;
        assert.deepStrictEqual(timer.mark('config-load'), {
            label: 'config-load',
            durationMs: 25,
        });
        now = 150;
        assert.strictEqual(timer.elapsedMs(), 50);
        assert.deepStrictEqual(timer.records(), [
            { label: 'config-load', durationMs: 25 },
        ]);
    });
});
