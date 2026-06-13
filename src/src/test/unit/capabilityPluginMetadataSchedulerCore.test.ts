import * as assert from 'assert';
import {
    createCapabilityPluginMetadataSchedulerCore,
    DirtyCapabilityPluginMetadataRepo,
} from '../../capabilityPluginMetadataSchedulerCore';

suite('Capability plugin metadata scheduler core', () => {
    test('debounces dirty repo maintenance and keeps latest capability set', async () => {
        const callbacks: Array<() => void> = [];
        const cleared = new Set<number>();
        const maintained: DirtyCapabilityPluginMetadataRepo[] = [];

        const scheduler = createCapabilityPluginMetadataSchedulerCore({
            getDelayMs: () => 5000,
            maintainDirtyRepo: async (target) => {
                maintained.push(target);
            },
            setTimeoutFn: (callback) => {
                callbacks.push(callback);
                return callbacks.length - 1;
            },
            clearTimeoutFn: (handle) => {
                cleared.add(handle as number);
            },
        });

        scheduler.markDirty({
            repoId: 'metadata',
            repoRoot: '/repo',
            capabilityDirectoryPath: '/repo/capabilities/first',
        });
        scheduler.markDirty({
            repoId: 'metadata',
            repoRoot: '/repo',
            capabilityDirectoryPath: '/repo/capabilities/second',
        });

        assert.deepStrictEqual(Array.from(cleared), [0]);
        assert.strictEqual(maintained.length, 0);

        await scheduler.flush('metadata');

        assert.strictEqual(maintained.length, 1);
        assert.deepStrictEqual(maintained[0], {
            repoId: 'metadata',
            repoRoot: '/repo',
            capabilityDirectoryPaths: ['/repo/capabilities/first', '/repo/capabilities/second'],
        });

        scheduler.dispose();
    });

    test('reschedules dirty repo changes that arrive while maintenance is running', async () => {
        const callbacks: Array<() => void> = [];
        let releaseMaintenance: (() => void) | undefined;
        const maintained: DirtyCapabilityPluginMetadataRepo[] = [];

        const scheduler = createCapabilityPluginMetadataSchedulerCore({
            getDelayMs: () => 5000,
            maintainDirtyRepo: async (target) => {
                maintained.push(target);
                if (maintained.length === 1) {
                    await new Promise<void>((resolve) => {
                        releaseMaintenance = resolve;
                    });
                }
            },
            setTimeoutFn: (callback) => {
                callbacks.push(callback);
                return callbacks.length - 1;
            },
            clearTimeoutFn: () => {},
        });

        scheduler.markDirty({
            repoId: 'metadata',
            repoRoot: '/repo',
            capabilityDirectoryPath: '/repo/capabilities/first',
        });

        const firstFlush = scheduler.flush('metadata');
        await Promise.resolve();

        scheduler.markDirty({
            repoId: 'metadata',
            repoRoot: '/repo',
            capabilityDirectoryPath: '/repo/capabilities/second',
        });

        assert.strictEqual(maintained.length, 1);
        releaseMaintenance?.();
        await firstFlush;

        assert.strictEqual(callbacks.length, 3);
        await scheduler.flush('metadata');

        assert.strictEqual(maintained.length, 2);
        assert.deepStrictEqual(maintained[1].capabilityDirectoryPaths, [
            '/repo/capabilities/second',
        ]);

        scheduler.dispose();
    });
});
