import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    apply,
    clean,
    disposeManagedFile,
    loadConfigFromPath,
    planSynchronization,
    preview,
    withReadOnlyRootSynchronizationAuthorization,
    withRootSynchronizationAuthorization,
    EffectiveFile,
} from '../src/index';

function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-wide-sync-'));
    fs.mkdirSync(path.join(root, '.metaflow'), { recursive: true });
    return root;
}

function rootFile(root: string): EffectiveFile {
    const source = path.join(root, 'source.md');
    fs.writeFileSync(source, '# instructions\n');
    return {
        relativePath: 'copilot-instructions.md',
        sourcePath: source,
        sourceLayer: 'primary/core',
        sourceRepo: 'primary',
        classification: 'synchronized',
    };
}

function writeConfig(root: string, policy: unknown, version = 5): string {
    const configPath = path.join(root, '.metaflow', 'config.jsonc');
    const synchronization =
        policy === undefined
            ? undefined
            : policy === 'empty'
              ? {}
              : { repoWideCopilotInstructions: policy };
    const value = {
        compatibilityVersion: version,
        metadataRepo: { localPath: 'metadata' },
        ...(synchronization === undefined ? {} : { synchronization }),
    };
    fs.writeFileSync(configPath, JSON.stringify(value, null, 2));
    return configPath;
}

function captureError(fn: () => unknown): string {
    try {
        fn();
        assert.fail('expected an error');
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

describe('repository-wide Copilot instruction synchronization policy', () => {
    it('omitted, empty, and false policy values suppress root planning without affecting other files', () => {
        for (const policy of [undefined, 'empty', false]) {
            const root = workspace();
            try {
                const file = rootFile(root);
                const configPath = writeConfig(root, policy);
                const loaded = loadConfigFromPath(configPath);
                assert.strictEqual(loaded.ok, true);
                const plan = planSynchronization({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: false,
                });
                assert.deepStrictEqual(plan.synchronizedFiles, []);
                assert.deepStrictEqual(plan.retainedFiles, []);
                const changes = preview(root, [file]) as ReturnType<typeof preview> & {
                    retained: unknown[];
                };
                assert.strictEqual(changes.length, 0);
                assert.deepStrictEqual(changes.retained, []);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    });

    it('requires a live path-bound current-version authorization for enabled root planning', () => {
        const root = workspace();
        try {
            const file = rootFile(root);
            const configPath = writeConfig(root, true);
            const message = captureError(() =>
                planSynchronization({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: {
                        kind: 'active-persisted-current',
                    },
                    rootSynchronizationConfigPath: configPath,
                }),
            );
            assert.match(message, /fresh active current-version authorization/);

            withRootSynchronizationAuthorization(configPath, (authorization) => {
                const plan = planSynchronization({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: authorization,
                    rootSynchronizationConfigPath: configPath,
                });
                assert.strictEqual(
                    plan.synchronizedFiles[0].destinationRelativePath,
                    'copilot-instructions.md',
                );
                assert.deepStrictEqual(plan.retainedFiles, []);
            });

            const reusedMessage = captureError(() =>
                planSynchronization({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: undefined,
                    rootSynchronizationConfigPath: configPath,
                }),
            );
            assert.match(reusedMessage, /fresh active current-version authorization/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps asynchronous authorization active until the callback settles', async () => {
        const root = workspace();
        try {
            const configPath = writeConfig(root, true);
            const result = await withRootSynchronizationAuthorization(
                configPath,
                async (authorization) => {
                    assert.ok(authorization);
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    const plan = planSynchronization({
                        workspaceRoot: root,
                        effectiveFiles: [],
                        synchronizationPolicy: true,
                        rootSynchronizationAuthorization: authorization,
                        rootSynchronizationConfigPath: configPath,
                    });
                    return plan.synchronizedFiles.length;
                },
            );
            assert.strictEqual(result, 0);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('migrates v3 only through mutating attestation and preserves JSONC comments', () => {
        const root = workspace();
        try {
            const file = rootFile(root);
            const configPath = path.join(root, '.metaflow', 'config.jsonc');
            fs.writeFileSync(
                configPath,
                '{\n  // keep this comment\n  "compatibilityVersion": 3,\n  "metadataRepo": { "localPath": "metadata" }\n}\n',
            );
            const before = fs.readFileSync(configPath, 'utf-8');
            const readOnly = loadConfigFromPath(configPath);
            assert.strictEqual(readOnly.ok, true);
            assert.strictEqual(readOnly.migrationRequired, true);
            assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);

            withRootSynchronizationAuthorization(configPath, (authorization, loaded) => {
                assert.strictEqual(
                    loaded.config.synchronization?.repoWideCopilotInstructions,
                    false,
                );
                const result = apply({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: false,
                    rootSynchronizationAuthorization: authorization,
                    rootSynchronizationConfigPath: configPath,
                });
                assert.deepStrictEqual(result.written, []);
            });

            const persisted = fs.readFileSync(configPath, 'utf-8');
            assert.match(persisted, /keep this comment/);
            assert.match(persisted, /"compatibilityVersion"\s*:\s*6/);
            assert.match(persisted, /"repoWideCopilotInstructions"\s*:\s*false/);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                false,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('read-only authorization rejects stale config without persisting migration', () => {
        const root = workspace();
        try {
            const configPath = writeConfig(root, true, 4);
            const before = fs.readFileSync(configPath, 'utf-8');

            const message = captureError(() =>
                withReadOnlyRootSynchronizationAuthorization(configPath, () => undefined),
            );

            assert.match(message, /compatibilityVersion v6 is not persisted/);
            assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('retains managed root ownership while disabled and clean removes only safe retained content', () => {
        const root = workspace();
        try {
            const file = rootFile(root);
            const configPath = writeConfig(root, true);
            withRootSynchronizationAuthorization(configPath, (authorization) => {
                const result = apply({
                    workspaceRoot: root,
                    effectiveFiles: [file],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: authorization,
                    rootSynchronizationConfigPath: configPath,
                });
                assert.deepStrictEqual(result.written, ['copilot-instructions.md']);
            });

            const disabled = planSynchronization({
                workspaceRoot: root,
                effectiveFiles: [file],
                synchronizationPolicy: false,
            });
            assert.deepStrictEqual(disabled.synchronizedFiles, []);
            assert.strictEqual(disabled.retainedFiles[0].status, 'in-sync');
            const applied = apply({
                workspaceRoot: root,
                effectiveFiles: [file],
                synchronizationPolicy: false,
            });
            assert.deepStrictEqual(applied.removed, []);
            assert.strictEqual(applied.retained[0].sourceLayer, 'primary/core');
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                true,
            );

            fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'user edit');
            const drifted = planSynchronization({
                workspaceRoot: root,
                effectiveFiles: [file],
                synchronizationPolicy: false,
            });
            assert.strictEqual(drifted.retainedFiles[0].status, 'drifted');
            const cleanResult = clean(root);
            assert.deepStrictEqual(cleanResult.removed, []);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                true,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('disposes only a source-matched root and preserves drift', () => {
        const root = workspace();
        try {
            const file = rootFile(root);
            const configPath = writeConfig(root, true);
            const builtInFile = {
                ...file,
                sourceLayer: '__metaflow_builtin__/.',
                sourceRepo: '__metaflow_builtin__',
            };
            withRootSynchronizationAuthorization(configPath, (authorization) => {
                apply({
                    workspaceRoot: root,
                    effectiveFiles: [builtInFile],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: authorization,
                    rootSynchronizationConfigPath: configPath,
                });
            });

            const mismatch = disposeManagedFile({
                workspaceRoot: root,
                relativePath: 'copilot-instructions.md',
                expectedSourceIdentity: {
                    sourceLayer: 'other/.',
                    sourceRelativePath: 'copilot-instructions.md',
                    sourceRepo: '__metaflow_builtin__',
                },
            });
            assert.strictEqual(mismatch.status, 'source-mismatch');
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                true,
            );

            const removed = disposeManagedFile({
                workspaceRoot: root,
                relativePath: 'copilot-instructions.md',
                expectedSourceIdentity: {
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRelativePath: 'copilot-instructions.md',
                    sourceRepo: '__metaflow_builtin__',
                },
            });
            assert.strictEqual(removed.status, 'removed');
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                false,
            );

            withRootSynchronizationAuthorization(configPath, (authorization) => {
                apply({
                    workspaceRoot: root,
                    effectiveFiles: [builtInFile],
                    synchronizationPolicy: true,
                    rootSynchronizationAuthorization: authorization,
                    rootSynchronizationConfigPath: configPath,
                });
            });
            fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), 'user edit');
            const preserved = disposeManagedFile({
                workspaceRoot: root,
                relativePath: 'copilot-instructions.md',
                expectedSourceIdentity: {
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRelativePath: 'copilot-instructions.md',
                    sourceRepo: '__metaflow_builtin__',
                },
            });
            assert.strictEqual(preserved.status, 'preserved-drifted');
            assert.strictEqual(
                fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')),
                true,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
