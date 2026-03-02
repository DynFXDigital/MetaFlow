import * as assert from 'assert';
import { createRepoUpdateSchedulerLifecycleController } from '../../extensionSchedulerLifecycle';

suite('extensionSchedulerLifecycle', () => {
    test('starts, stops, and restarts scheduler when config presence changes', () => {
        let hasConfig = false;
        let createCount = 0;
        let disposeCount = 0;

        const lifecycle = createRepoUpdateSchedulerLifecycleController({
            workspaceHasConfig: () => hasConfig,
            createScheduler: () => {
                createCount += 1;
                return {
                    dispose: () => {
                        disposeCount += 1;
                    },
                };
            },
        });

        lifecycle.sync();
        assert.strictEqual(createCount, 0);
        assert.strictEqual(disposeCount, 0);

        hasConfig = true;
        lifecycle.sync();
        assert.strictEqual(createCount, 1);
        assert.strictEqual(disposeCount, 0);

        lifecycle.sync();
        assert.strictEqual(createCount, 1);
        assert.strictEqual(disposeCount, 0);

        hasConfig = false;
        lifecycle.sync();
        assert.strictEqual(createCount, 1);
        assert.strictEqual(disposeCount, 1);

        hasConfig = true;
        lifecycle.sync();
        assert.strictEqual(createCount, 2);
        assert.strictEqual(disposeCount, 1);
    });

    test('dispose tears down active scheduler once', () => {
        let hasConfig = true;
        let createCount = 0;
        let disposeCount = 0;

        const lifecycle = createRepoUpdateSchedulerLifecycleController({
            workspaceHasConfig: () => hasConfig,
            createScheduler: () => {
                createCount += 1;
                return {
                    dispose: () => {
                        disposeCount += 1;
                    },
                };
            },
        });

        lifecycle.sync();
        assert.strictEqual(createCount, 1);
        assert.strictEqual(disposeCount, 0);

        lifecycle.dispose();
        assert.strictEqual(disposeCount, 1);

        lifecycle.dispose();
        assert.strictEqual(disposeCount, 1);

        hasConfig = false;
        lifecycle.sync();
        assert.strictEqual(createCount, 1);
        assert.strictEqual(disposeCount, 1);
    });
});
