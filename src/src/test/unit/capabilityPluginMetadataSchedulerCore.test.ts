import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    CAPABILITY_PLUGIN_METADATA_WATCH_PATTERNS,
    createCapabilityPluginMetadataSchedulerCore,
    DirtyCapabilityPluginMetadataRepo,
    findNearestCapabilityDirectory,
} from '../../capabilityPluginMetadataSchedulerCore';

suite('Capability plugin metadata scheduler core', () => {
    test('watches README and resolves README packages before legacy fallback', () => {
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-scheduler-'));
        try {
            const readmePackage = path.join(repoRoot, 'packages', 'readme-package');
            const legacyPackage = path.join(repoRoot, 'packages', 'legacy-package');
            fs.mkdirSync(path.join(readmePackage, '.github', 'instructions'), {
                recursive: true,
            });
            fs.mkdirSync(path.join(readmePackage, 'nested'), { recursive: true });
            fs.mkdirSync(path.join(legacyPackage, 'nested'), { recursive: true });
            fs.writeFileSync(
                path.join(readmePackage, 'README.md'),
                [
                    '---',
                    'id: 123e4567-e89b-42d3-a456-426614174000',
                    'name: README package',
                    'description: A valid package descriptor.',
                    '---',
                    '',
                    '# README package',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(legacyPackage, 'CAPABILITY.md'),
                '# Legacy package\n',
                'utf-8',
            );

            const ordinaryRepo = path.join(repoRoot, 'ordinary-repo');
            fs.mkdirSync(path.join(ordinaryRepo, 'docs', 'reference'), { recursive: true });
            fs.writeFileSync(
                path.join(ordinaryRepo, 'README.md'),
                '# Ordinary repository documentation\n',
                'utf-8',
            );
            fs.writeFileSync(
                path.join(ordinaryRepo, 'docs', 'reference', 'note.md'),
                '# Note\n',
                'utf-8',
            );

            assert.ok(CAPABILITY_PLUGIN_METADATA_WATCH_PATTERNS.includes('**/README.md'));
            assert.ok(CAPABILITY_PLUGIN_METADATA_WATCH_PATTERNS.includes('**/CAPABILITY.md'));
            assert.ok(CAPABILITY_PLUGIN_METADATA_WATCH_PATTERNS.includes('**/plugin.json'));
            assert.strictEqual(
                findNearestCapabilityDirectory(
                    repoRoot,
                    path.join(readmePackage, 'nested', 'changed.md'),
                ),
                readmePackage,
            );
            assert.strictEqual(
                findNearestCapabilityDirectory(
                    repoRoot,
                    path.join(legacyPackage, 'nested', 'changed.md'),
                ),
                legacyPackage,
            );
            assert.strictEqual(
                findNearestCapabilityDirectory(
                    repoRoot,
                    path.join(ordinaryRepo, 'docs', 'reference', 'note.md'),
                ),
                undefined,
            );
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

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
