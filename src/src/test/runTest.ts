/**
 * Test runner entry point for VS Code extension tests.
 *
 * Launches the Extension Host (for integration tests) and a standalone
 * Node.js runner (for unit tests).
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // Determine which test suite to run
        const args = process.argv.slice(2);
        const unitOnly = args.includes('--unit');

        if (unitOnly) {
            // Unit tests: run directly in Node (no Extension Host)
            const unitIndex = path.resolve(__dirname, './unit/index');
            const { run } = await import(unitIndex);
            await run();
        } else {
            // Integration tests: run in Extension Host
            const extensionTestsPath = path.resolve(__dirname, './integration/index');
            const testWorkspace = path.resolve(__dirname, '../../test-workspace');

            await runTests({
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [testWorkspace, '--disable-extensions'],
            });
        }
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
