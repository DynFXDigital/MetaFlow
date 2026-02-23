/* eslint-disable @typescript-eslint/no-var-requires */

import * as assert from 'assert';
import { main, runWithArgs, RunTestDeps } from '../runTest';

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

suite('Test Runner Entry', () => {
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

        moduleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
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
    });

    test('default deps main logs error when runTests fails', async () => {
        const moduleInternals = require('module') as {
            _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
        };
        const originalLoad = moduleInternals._load;
        const failure = new Error('integration failed');

        moduleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
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
