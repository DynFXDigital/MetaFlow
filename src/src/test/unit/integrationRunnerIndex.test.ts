/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS require needed for Mocha module rewiring */

import * as assert from 'assert';
import * as path from 'path';
import { collectIntegrationTestFiles } from '../integration/index';

type IntegrationRunnerModule = {
    run: () => Promise<void>;
};

type FakeMochaInstance = {
    options: { ui: string; color: boolean; timeout: number };
    addFileCalls: string[];
    addFile: (filePath: string) => void;
    run: (callback: (failures: number) => void) => void;
};

function loadIntegrationRunnerWithMocks(options?: { files?: string[]; failures?: number }): {
    module: IntegrationRunnerModule;
    modulePath: string;
    globCalls: Array<{ pattern: string; cwd: string }>;
    mochaInstances: FakeMochaInstance[];
} {
    const globCalls: Array<{ pattern: string; cwd: string }> = [];
    const mochaInstances: FakeMochaInstance[] = [];
    const files = options?.files ?? [];
    const failures = options?.failures ?? 0;

    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;

    moduleInternals._load = function patchedLoad(
        request: string,
        parent: NodeModule | null,
        isMain: boolean,
    ): unknown {
        if (request === 'glob') {
            return {
                glob: async (pattern: string, globOptions: { cwd: string }): Promise<string[]> => {
                    globCalls.push({ pattern, cwd: globOptions.cwd });
                    return files;
                },
            };
        }

        if (request === 'mocha') {
            return class FakeMocha {
                public options: { ui: string; color: boolean; timeout: number };
                public addFileCalls: string[] = [];

                constructor(mochaOptions: { ui: string; color: boolean; timeout: number }) {
                    this.options = mochaOptions;
                    mochaInstances.push(this);
                }

                addFile(filePath: string): void {
                    this.addFileCalls.push(filePath);
                }

                run(callback: (reportedFailures: number) => void): void {
                    callback(failures);
                }
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    const modulePath = require.resolve('../integration/index');
    delete require.cache[modulePath];

    try {
        return {
            module: require(modulePath) as IntegrationRunnerModule,
            modulePath,
            globCalls,
            mochaInstances,
        };
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('Integration Runner Index', () => {
    test('collectIntegrationTestFiles uses a pattern that matches top-level tests', async () => {
        const calls: Array<{ pattern: string; cwd: string }> = [];
        const files = await collectIntegrationTestFiles(
            '/tmp/integration-tests',
            async (pattern, options) => {
                calls.push({ pattern, cwd: options.cwd });
                return ['extension.test.js', 'nested/treeViews.test.js'];
            },
        );

        assert.deepStrictEqual(files, ['extension.test.js', 'nested/treeViews.test.js']);
        assert.deepStrictEqual(calls, [{ pattern: '**/*.test.js', cwd: '/tmp/integration-tests' }]);
    });

    test('run resolves after adding discovered files to mocha', async () => {
        const loaded = loadIntegrationRunnerWithMocks({
            files: ['extension.test.js', 'nested/treeViews.test.js'],
        });

        await assert.doesNotReject(() => loaded.module.run());

        assert.strictEqual(loaded.mochaInstances.length, 1);
        assert.deepStrictEqual(loaded.globCalls, [
            { pattern: '**/*.test.js', cwd: path.dirname(loaded.modulePath) },
        ]);
        assert.deepStrictEqual(loaded.mochaInstances[0].options, {
            ui: 'tdd',
            color: true,
            timeout: 30000,
        });
        assert.deepStrictEqual(loaded.mochaInstances[0].addFileCalls, [
            path.resolve(path.dirname(loaded.modulePath), 'extension.test.js'),
            path.resolve(path.dirname(loaded.modulePath), 'nested/treeViews.test.js'),
        ]);
    });

    test('run rejects when mocha reports failures', async () => {
        const loaded = loadIntegrationRunnerWithMocks({
            files: ['extension.test.js'],
            failures: 2,
        });

        await assert.rejects(() => loaded.module.run(), /2 integration test\(s\) failed\./);

        assert.strictEqual(loaded.mochaInstances.length, 1);
        assert.deepStrictEqual(loaded.mochaInstances[0].addFileCalls, [
            path.resolve(path.dirname(loaded.modulePath), 'extension.test.js'),
        ]);
    });
});
