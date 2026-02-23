/**
 * Unit test runner index — collects and runs all unit test suites.
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function createMocha(): Mocha {
    return new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
    });
}

export async function collectTestFiles(
    testsRoot: string,
    globFn: (pattern: string, options: { cwd: string }) => Promise<string[]> = (pattern, options) => glob(pattern, options)
): Promise<string[]> {
    return globFn('**/**.test.js', { cwd: testsRoot });
}

export function runMocha(mocha: Mocha): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}

export async function run(): Promise<void> {
    const mocha = createMocha();

    const testsRoot = path.resolve(__dirname, '.');
    const files = await collectTestFiles(testsRoot);

    for (const f of files) {
        mocha.addFile(path.resolve(testsRoot, f));
    }

    return runMocha(mocha);
}
