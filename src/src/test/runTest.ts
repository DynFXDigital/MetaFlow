/**
 * Test runner entry point for VS Code extension tests.
 *
 * Launches the Extension Host (for integration tests) and a standalone
 * Node.js runner (for unit tests).
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

export interface RunTestDeps {
    runUnit: () => Promise<void>;
    runIntegration: () => Promise<void>;
    logError: (message: string, err: unknown) => void;
}

function createDefaultDeps(): RunTestDeps {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './integration/index');
    const testWorkspace = path.resolve(__dirname, '../../test-workspace');
    const integrationUserDataDir = path.resolve(__dirname, '../../.vscode-test-user-data');
    const integrationExtensionsDir = path.resolve(__dirname, '../../.vscode-test-extensions');

    return {
        runUnit: async (): Promise<void> => {
            const unitIndex = path.resolve(__dirname, './unit/index');
            const { run } = await import(unitIndex);
            await run();
        },
        runIntegration: async (): Promise<void> => {
            await runTests({
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [
                    testWorkspace,
                    '--disable-extensions',
                    '--disable-updates',
                    '--user-data-dir', integrationUserDataDir,
                    '--extensions-dir', integrationExtensionsDir,
                ],
            });
        },
        logError: (message: string, err: unknown): void => {
            console.error(message, err);
        },
    };
}

export async function runWithArgs(args: string[], deps: RunTestDeps = createDefaultDeps()): Promise<void> {
    const unitOnly = args.includes('--unit');
    if (unitOnly) {
        await deps.runUnit();
    } else {
        await deps.runIntegration();
    }
}

export async function main(args: string[] = process.argv.slice(2), deps: RunTestDeps = createDefaultDeps()): Promise<number> {
    try {
        await runWithArgs(args, deps);
        return 0;
    } catch (err) {
        deps.logError('Failed to run tests:', err);
        return 1;
    }
}

/* c8 ignore start */
if (require.main === module) {
    void main().then(exitCode => {
        if (exitCode !== 0) {
            process.exit(exitCode);
        }
    });
}
/* c8 ignore stop */
