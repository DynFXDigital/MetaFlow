import * as assert from 'assert';
import { collectTestFiles, runMocha, createMocha } from './index';

suite('Unit Runner Index', () => {
    test('createMocha returns configured mocha instance', () => {
        const mocha = createMocha() as unknown as {
            options: { timeout: number; ui: string; color: boolean };
        };

        assert.strictEqual(mocha.options.ui, 'tdd');
        assert.strictEqual(mocha.options.color, true);
        assert.strictEqual(mocha.options.timeout, 10000);
    });

    test('collectTestFiles uses glob pattern in provided cwd', async () => {
        const calls: Array<{ pattern: string; cwd: string }> = [];
        const files = await collectTestFiles('/tmp/tests', async (pattern, options) => {
            calls.push({ pattern, cwd: options.cwd });
            return ['a.test.js', 'nested/b.test.js'];
        });

        assert.deepStrictEqual(files, ['a.test.js', 'nested/b.test.js']);
        assert.deepStrictEqual(calls, [{ pattern: '**/*.test.js', cwd: '/tmp/tests' }]);
    });

    test('runMocha resolves when there are no failures', async () => {
        const fakeMocha = {
            run: (callback: (failures: number) => void): void => callback(0),
        };

        await assert.doesNotReject(() => runMocha(fakeMocha as never));
    });

    test('runMocha rejects when failures are reported', async () => {
        const fakeMocha = {
            run: (callback: (failures: number) => void): void => callback(2),
        };

        await assert.rejects(() => runMocha(fakeMocha as never), /2 test\(s\) failed\./);
    });
});
