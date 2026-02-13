/**
 * Integration test runner index — collects and runs all integration test suites.
 *
 * Runs inside the VS Code Extension Host via @vscode/test-electron.
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 30000, // wider timeout for Extension Host start-up
    });

    const testsRoot = path.resolve(__dirname, '.');

    const files = await glob('**/**.test.js', { cwd: testsRoot });

    for (const f of files) {
        mocha.addFile(path.resolve(testsRoot, f));
    }

    return new Promise<void>((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} integration test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
