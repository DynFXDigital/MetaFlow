import * as assert from 'assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
    ensureIntegrationUserSettings,
    findUnexpectedIntegrationLogLines,
    main,
    runWithArgs,
    RunTestDeps,
    shouldSuppressKnownIntegrationOutputLine,
} from '../runTest';

type RunTestInternals = {
    withFilteredIntegrationOutput: (run: () => Promise<void>) => Promise<void>;
    withIntegrationTestSandbox: (
        run: (dirs: { userDataDir: string; extensionsDir: string }) => Promise<void>,
    ) => Promise<void>;
};

function createDeps(overrides?: Partial<RunTestDeps>): {
    deps: RunTestDeps;
    calls: { unit: number; integration: number; errors: Array<{ message: string; err: unknown }> };
} {
    const calls = {
        unit: 0,
        integration: 0,
        errors: [] as Array<{ message: string; err: unknown }>,
    };

    const deps: RunTestDeps = {
        runUnit: async (): Promise<void> => {
            calls.unit += 1;
        },
        runIntegration: async (): Promise<void> => {
            calls.integration += 1;
        },
        logError: (message: string, err: unknown): void => {
            calls.errors.push({ message, err });
        },
        ...overrides,
    };

    return { deps, calls };
}

function loadRunTestInternals(): RunTestInternals {
    const moduleInternals = require('module') as {
        _extensions: Record<
            string,
            (
                module: NodeModule & {
                    _compile: (content: string, filename: string) => void;
                },
                filename: string,
            ) => void
        >;
    };
    const modulePath = require.resolve('../runTest');
    const originalJsExtension = moduleInternals._extensions['.js'];

    moduleInternals._extensions['.js'] = function patchedExtension(
        module: NodeModule & {
            _compile: (content: string, filename: string) => void;
        },
        filename: string,
    ): void {
        if (path.resolve(filename) === path.resolve(modulePath)) {
            const source = fs.readFileSync(filename, 'utf8');
            module._compile(
                `${source}\nmodule.exports.__test__ = { withFilteredIntegrationOutput, withIntegrationTestSandbox };\n`,
                filename,
            );
            return;
        }

        originalJsExtension(module, filename);
    };

    delete require.cache[modulePath];

    try {
        const loaded = require(modulePath) as { __test__?: RunTestInternals };
        assert.ok(loaded.__test__, 'Expected runTest internals to be exposed for test coverage');
        return loaded.__test__;
    } finally {
        moduleInternals._extensions['.js'] = originalJsExtension;
        delete require.cache[modulePath];
    }
}

async function withPatchedPlatform<T>(
    platformName: NodeJS.Platform,
    run: () => Promise<T>,
): Promise<T> {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    assert.ok(descriptor, 'Expected process.platform descriptor to exist');
    Object.defineProperty(process, 'platform', { value: platformName });

    try {
        return await run();
    } finally {
        Object.defineProperty(process, 'platform', descriptor);
    }
}

function captureProcessWrites(): {
    stdout: string[];
    stderr: string[];
    stdoutWrite: typeof process.stdout.write;
    stderrWrite: typeof process.stderr.write;
    restore: () => void;
} {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    const stdoutWrite = function (
        this: NodeJS.WriteStream,
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        callback?: (error?: Error | null) => void,
    ): boolean {
        const resolvedCallback = typeof encoding === 'function' ? encoding : callback;
        stdout.push(
            typeof chunk === 'string'
                ? chunk
                : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8'),
        );
        resolvedCallback?.(null);
        return true;
    } as typeof process.stdout.write;

    const stderrWrite = function (
        this: NodeJS.WriteStream,
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        callback?: (error?: Error | null) => void,
    ): boolean {
        const resolvedCallback = typeof encoding === 'function' ? encoding : callback;
        stderr.push(
            typeof chunk === 'string'
                ? chunk
                : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8'),
        );
        resolvedCallback?.(null);
        return true;
    } as typeof process.stderr.write;

    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;

    return {
        stdout,
        stderr,
        stdoutWrite,
        stderrWrite,
        restore: (): void => {
            process.stdout.write = originalStdoutWrite;
            process.stderr.write = originalStderrWrite;
        },
    };
}

suite('Test Runner Entry', () => {
    test('ensureIntegrationUserSettings creates integration-safe settings when missing', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'metaflow-runTest-'));

        try {
            await ensureIntegrationUserSettings(tempDir);

            const settingsPath = path.join(tempDir, 'User', 'settings.json');
            const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<
                string,
                unknown
            >;

            assert.strictEqual(settings['terminal.integrated.gpuAcceleration'], 'off');
            assert.strictEqual(settings['git.enabled'], false);
            assert.strictEqual(settings['git.autoRepositoryDetection'], false);
            assert.strictEqual(settings['git.openRepositoryInParentFolders'], 'never');
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    test('ensureIntegrationUserSettings preserves existing settings', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'metaflow-runTest-'));

        try {
            const userDir = path.join(tempDir, 'User');
            const settingsPath = path.join(userDir, 'settings.json');
            await mkdir(userDir, { recursive: true });
            await writeFile(
                settingsPath,
                `${JSON.stringify(
                    {
                        'files.autoSave': 'off',
                    },
                    null,
                    4,
                )}\n`,
                'utf8',
            );

            await ensureIntegrationUserSettings(tempDir);

            const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<
                string,
                unknown
            >;

            assert.strictEqual(settings['files.autoSave'], 'off');
            assert.strictEqual(settings['terminal.integrated.gpuAcceleration'], 'off');
            assert.strictEqual(settings['git.enabled'], false);
            assert.strictEqual(settings['git.autoRepositoryDetection'], false);
            assert.strictEqual(settings['git.openRepositoryInParentFolders'], 'never');
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    test('findUnexpectedIntegrationLogLines reports masked integration host failures', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'metaflow-runTest-'));

        try {
            const logDir = path.join(tempDir, 'logs', '20260311T000000', 'window1');
            await mkdir(logDir, { recursive: true });
            await writeFile(
                path.join(logDir, 'renderer.log'),
                [
                    '2026-03-11 10:45:28.146 [error] Error: spawn C:\\Program Files\\Git\\cmd\\git.exe ENOENT',
                    '2026-03-11 10:45:29.324 [warning] rejected promise not handled within 1 second: Error: spawn C:\\Program Files\\Git\\cmd\\git.exe ENOENT',
                    '2026-03-11 10:45:29.325 [error] An unknown error occurred. Please consult the log for more details.',
                ].join('\n'),
                'utf8',
            );

            const findings = await findUnexpectedIntegrationLogLines(tempDir);

            assert.strictEqual(findings.length, 3);
            assert.ok(
                findings.some((line) =>
                    line.includes('spawn C:\\Program Files\\Git\\cmd\\git.exe ENOENT'),
                ),
            );
            assert.ok(
                findings.some((line) =>
                    line.includes('rejected promise not handled within 1 second'),
                ),
            );
            assert.ok(
                findings.some((line) =>
                    line.includes(
                        'An unknown error occurred. Please consult the log for more details.',
                    ),
                ),
            );
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    test('shouldSuppressKnownIntegrationOutputLine filters the benign VS Code mutex startup warning and stack', () => {
        const state = { suppressMutexStack: false };

        assert.strictEqual(
            shouldSuppressKnownIntegrationOutputLine(
                '[main 2026-03-11T19:04:07.434Z] Error: Error mutex already exists',
                state,
            ),
            true,
        );
        assert.strictEqual(state.suppressMutexStack, true);
        assert.strictEqual(
            shouldSuppressKnownIntegrationOutputLine(
                '    at ls.installMutex (file:///C:/Users/cyates/gitwork/AI/MetaFlow/src/.vscode-test/resources/app/out/main.js:550:23404)',
                state,
            ),
            true,
        );
        assert.strictEqual(
            shouldSuppressKnownIntegrationOutputLine(
                '[main 2026-03-11T19:04:07.469Z] update#setState disabled',
                state,
            ),
            false,
        );
        assert.strictEqual(state.suppressMutexStack, false);
    });

    test('shouldSuppressKnownIntegrationOutputLine leaves unrelated output untouched', () => {
        const state = { suppressMutexStack: false };

        assert.strictEqual(
            shouldSuppressKnownIntegrationOutputLine(
                '[main 2026-03-11T19:04:07.469Z] update#setState disabled',
                state,
            ),
            false,
        );
        assert.strictEqual(
            shouldSuppressKnownIntegrationOutputLine(
                '2026-03-11 10:45:28.146 [error] Error: spawn C:\\Program Files\\Git\\cmd\\git.exe ENOENT',
                state,
            ),
            false,
        );
    });

    test('withFilteredIntegrationOutput filters benign Windows mutex output and flushes visible trailing writes', async () => {
        const { withFilteredIntegrationOutput } = loadRunTestInternals();
        const capture = captureProcessWrites();

        try {
            await withPatchedPlatform('win32', async () => {
                await withFilteredIntegrationOutput(async () => {
                    assert.notStrictEqual(process.stdout.write, capture.stdoutWrite);
                    assert.notStrictEqual(process.stderr.write, capture.stderrWrite);

                    process.stdout.write(
                        '[main 2026-03-11T19:04:07.434Z] Error: Error mutex already exists\r\n',
                    );
                    process.stdout.write(
                        '    at ls.installMutex (file:///C:/Users/cyates/gitwork/AI/MetaFlow/src/.vscode-test/resources/app/out/main.js:550:23404)\r\n',
                    );
                    process.stdout.write('visible stdout line\r\n');
                    process.stderr.write('visible stderr remainder');
                });
            });

            process.stdout.write('after helper stdout');
            process.stderr.write('after helper stderr');

            assert.deepStrictEqual(capture.stdout, [
                'visible stdout line\n',
                'after helper stdout',
            ]);
            assert.deepStrictEqual(capture.stderr, [
                'visible stderr remainder',
                'after helper stderr',
            ]);
        } finally {
            capture.restore();
        }
    });

    test('withFilteredIntegrationOutput flushes remainders and restores writes after runner failure', async () => {
        const { withFilteredIntegrationOutput } = loadRunTestInternals();
        const capture = captureProcessWrites();
        const failure = new Error('filtered failure');

        try {
            await assert.rejects(
                () =>
                    withPatchedPlatform('win32', async () => {
                        await withFilteredIntegrationOutput(async () => {
                            process.stdout.write('partial stdout');
                            process.stderr.write('partial stderr');
                            throw failure;
                        });
                    }),
                /filtered failure/,
            );

            process.stdout.write('after failure stdout');
            process.stderr.write('after failure stderr');

            assert.deepStrictEqual(capture.stdout, ['partial stdout', 'after failure stdout']);
            assert.deepStrictEqual(capture.stderr, ['partial stderr', 'after failure stderr']);
        } finally {
            capture.restore();
        }
    });

    test('withIntegrationTestSandbox creates sandbox dirs and removes them after success', async () => {
        const { withIntegrationTestSandbox } = loadRunTestInternals();
        let sandboxRoot = '';

        await withIntegrationTestSandbox(async ({ userDataDir, extensionsDir }) => {
            sandboxRoot = path.dirname(userDataDir);
            assert.ok(fs.existsSync(userDataDir));
            assert.ok(fs.existsSync(extensionsDir));
            assert.strictEqual(path.basename(userDataDir), 'user-data');
            assert.strictEqual(path.basename(extensionsDir), 'extensions');
        });

        assert.notStrictEqual(sandboxRoot, '');
        assert.strictEqual(fs.existsSync(sandboxRoot), false);
    });

    test('withIntegrationTestSandbox removes sandbox after unexpected integration logs', async () => {
        const { withIntegrationTestSandbox } = loadRunTestInternals();
        let sandboxRoot = '';

        await assert.rejects(
            () =>
                withIntegrationTestSandbox(async ({ userDataDir }) => {
                    sandboxRoot = path.dirname(userDataDir);
                    const logDir = path.join(userDataDir, 'logs', '20260313T000000', 'window1');
                    await mkdir(logDir, { recursive: true });
                    await writeFile(
                        path.join(logDir, 'renderer.log'),
                        'An unknown error occurred. Please consult the log for more details.\n',
                        'utf8',
                    );
                }),
            /Unexpected integration host errors detected/,
        );

        assert.notStrictEqual(sandboxRoot, '');
        assert.strictEqual(fs.existsSync(sandboxRoot), false);
    });

    test('runWithArgs selects unit runner for --unit', async () => {
        const { deps, calls } = createDeps();

        await runWithArgs(['--unit'], deps);

        assert.strictEqual(calls.unit, 1);
        assert.strictEqual(calls.integration, 0);
    });

    test('runWithArgs selects integration runner by default', async () => {
        const { deps, calls } = createDeps();

        await runWithArgs([], deps);

        assert.strictEqual(calls.unit, 0);
        assert.strictEqual(calls.integration, 1);
    });

    test('main returns 0 on success', async () => {
        const { deps, calls } = createDeps();

        const exitCode = await main(['--unit'], deps);

        assert.strictEqual(exitCode, 0);
        assert.strictEqual(calls.errors.length, 0);
    });

    test('main returns 1 and logs when runner throws', async () => {
        const failure = new Error('boom');
        const { deps, calls } = createDeps({
            runIntegration: async (): Promise<void> => {
                throw failure;
            },
        });

        const exitCode = await main([], deps);

        assert.strictEqual(exitCode, 1);
        assert.strictEqual(calls.errors.length, 1);
        assert.strictEqual(calls.errors[0].message, 'Failed to run tests:');
        assert.strictEqual(calls.errors[0].err, failure);
    });

    test('default deps invoke runTests for integration mode', async () => {
        const moduleInternals = require('module') as {
            _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
        };
        const originalLoad = moduleInternals._load;
        const runTestsCalls: Array<Record<string, unknown>> = [];

        moduleInternals._load = function patchedLoad(
            request: string,
            parent: NodeModule | null,
            isMain: boolean,
        ): unknown {
            if (request === '@vscode/test-electron') {
                return {
                    runTests: async (options: Record<string, unknown>): Promise<void> => {
                        runTestsCalls.push(options);
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const modulePath = require.resolve('../runTest');
        delete require.cache[modulePath];

        try {
            const fresh = require(modulePath) as {
                runWithArgs: (args: string[]) => Promise<void>;
            };
            await fresh.runWithArgs([]);
        } finally {
            moduleInternals._load = originalLoad;
        }

        assert.strictEqual(runTestsCalls.length, 1);
        assert.ok(Array.isArray(runTestsCalls[0].launchArgs));

        const launchArgs = runTestsCalls[0].launchArgs as string[];
        assert.ok(launchArgs.includes('--disable-gpu'));
        assert.ok(launchArgs.includes('--disable-extension'));
        assert.ok(launchArgs.includes('vscode.git'));
        assert.ok(launchArgs.includes('vscode.git-base'));

        const userDataDirIndex = launchArgs.indexOf('--user-data-dir');
        assert.ok(userDataDirIndex >= 0, 'Integration launch args should specify a user-data-dir');
        assert.ok(
            userDataDirIndex + 1 < launchArgs.length,
            'user-data-dir should be followed by a path',
        );
        assert.strictEqual(
            fs.existsSync(launchArgs[userDataDirIndex + 1]),
            false,
            'Integration sandbox should be cleaned up after runTests completes',
        );
    });

    test('default deps main logs error when runTests fails', async () => {
        const moduleInternals = require('module') as {
            _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
        };
        const originalLoad = moduleInternals._load;
        const failure = new Error('integration failed');

        moduleInternals._load = function patchedLoad(
            request: string,
            parent: NodeModule | null,
            isMain: boolean,
        ): unknown {
            if (request === '@vscode/test-electron') {
                return {
                    runTests: async (): Promise<void> => {
                        throw failure;
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const errors: Array<{ message: unknown; err: unknown }> = [];
        const originalConsoleError = console.error;
        console.error = ((message: unknown, err: unknown): void => {
            errors.push({ message, err });
        }) as typeof console.error;

        const modulePath = require.resolve('../runTest');
        delete require.cache[modulePath];

        try {
            const fresh = require(modulePath) as {
                main: (args?: string[]) => Promise<number>;
            };
            const exitCode = await fresh.main([]);
            assert.strictEqual(exitCode, 1);
        } finally {
            moduleInternals._load = originalLoad;
            console.error = originalConsoleError;
        }

        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].message, 'Failed to run tests:');
        assert.strictEqual(errors[0].err, failure);
    });
});
