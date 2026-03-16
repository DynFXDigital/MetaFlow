/**
 * Test runner entry point for VS Code extension tests.
 *
 * Launches the Extension Host (for integration tests) and a standalone
 * Node.js runner (for unit tests).
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const INTEGRATION_TEST_SETTINGS = Object.freeze({
    'terminal.integrated.gpuAcceleration': 'off',
    'git.enabled': false,
    'git.autoRepositoryDetection': false,
    'git.openRepositoryInParentFolders': 'never',
});

const UNEXPECTED_INTEGRATION_LOG_PATTERNS = Object.freeze([
    /rejected promise not handled within 1 second/i,
    /An unknown error occurred\. Please consult the log for more details\./i,
    /spawn .*git(?:\.exe)? ENOENT/i,
]);

export interface RunTestDeps {
    runUnit: () => Promise<void>;
    runIntegration: () => Promise<void>;
    logError: (message: string, err: unknown) => void;
}

type WritableWrite = typeof process.stdout.write;

const BENIGN_INTEGRATION_OUTPUT_PATTERNS = Object.freeze({
    mutexLine: /^\[main .*\] Error: Error mutex already exists$/i,
    mutexStackFrame: /^\s+at .*installMutex.*$/i,
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function ensureIntegrationUserSettings(userDataDir: string): Promise<void> {
    const userDir = path.join(userDataDir, 'User');
    const settingsPath = path.join(userDir, 'settings.json');

    let currentSettings: Record<string, unknown> = {};
    try {
        const raw = await readFile(settingsPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) {
            throw new Error(`Expected ${settingsPath} to contain a JSON object.`);
        }
        currentSettings = parsed;
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code !== 'ENOENT') {
            throw err;
        }
    }

    const nextSettings = {
        ...currentSettings,
        ...INTEGRATION_TEST_SETTINGS,
    };
    const changed = Object.entries(INTEGRATION_TEST_SETTINGS).some(
        ([key, value]) => currentSettings[key] !== value,
    );
    if (!changed) {
        return;
    }

    await mkdir(userDir, { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 4)}\n`, 'utf8');
}

async function collectLogFiles(rootDir: string): Promise<string[]> {
    try {
        const entries = await readdir(rootDir, { withFileTypes: true });
        const files = await Promise.all(
            entries.map(async (entry) => {
                const entryPath = path.join(rootDir, entry.name);
                if (entry.isDirectory()) {
                    return await collectLogFiles(entryPath);
                }
                return entry.isFile() ? [entryPath] : [];
            }),
        );
        return files.flat();
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw err;
    }
}

export async function findUnexpectedIntegrationLogLines(userDataDir: string): Promise<string[]> {
    const logFiles = (await collectLogFiles(path.join(userDataDir, 'logs'))).filter((filePath) =>
        filePath.endsWith('.log'),
    );
    const findings: string[] = [];

    for (const logFile of logFiles) {
        const content = await readFile(logFile, 'utf8');
        const relativePath = path.relative(userDataDir, logFile).replace(/\\/g, '/');

        for (const [index, line] of content.split(/\r?\n/).entries()) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            if (UNEXPECTED_INTEGRATION_LOG_PATTERNS.some((pattern) => pattern.test(trimmed))) {
                findings.push(`${relativePath}:${index + 1}: ${trimmed}`);
            }
        }
    }

    return findings;
}

export async function assertNoUnexpectedIntegrationErrors(userDataDir: string): Promise<void> {
    const findings = await findUnexpectedIntegrationLogLines(userDataDir);
    if (findings.length === 0) {
        return;
    }

    throw new Error(`Unexpected integration host errors detected:\n- ${findings.join('\n- ')}`);
}

interface KnownIntegrationOutputFilterState {
    suppressMutexStack: boolean;
}

export function shouldSuppressKnownIntegrationOutputLine(
    line: string,
    state: KnownIntegrationOutputFilterState,
): boolean {
    if (BENIGN_INTEGRATION_OUTPUT_PATTERNS.mutexLine.test(line)) {
        state.suppressMutexStack = true;
        return true;
    }

    if (state.suppressMutexStack) {
        if (BENIGN_INTEGRATION_OUTPUT_PATTERNS.mutexStackFrame.test(line)) {
            return true;
        }

        state.suppressMutexStack = false;
    }

    return false;
}

function createFilteredWriter(
    originalWrite: WritableWrite,
    state: KnownIntegrationOutputFilterState,
): WritableWrite {
    let buffered = '';

    const flushCompleteLines = (): void => {
        let newlineIndex = buffered.search(/\r?\n/);
        while (newlineIndex >= 0) {
            const line = buffered.slice(0, newlineIndex);
            const newlineLength =
                buffered[newlineIndex] === '\r' && buffered[newlineIndex + 1] === '\n' ? 2 : 1;
            buffered = buffered.slice(newlineIndex + newlineLength);

            if (!shouldSuppressKnownIntegrationOutputLine(line, state)) {
                originalWrite.call(process.stdout, `${line}\n`);
            }

            newlineIndex = buffered.search(/\r?\n/);
        }
    };

    const flushRemainder = (): void => {
        if (!buffered) {
            return;
        }

        if (!shouldSuppressKnownIntegrationOutputLine(buffered, state)) {
            originalWrite.call(process.stdout, buffered);
        }
        buffered = '';
    };

    const filteredWrite = function (
        this: NodeJS.WriteStream,
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        callback?: (error?: Error | null) => void,
    ): boolean {
        const resolvedCallback = typeof encoding === 'function' ? encoding : callback;
        buffered +=
            typeof chunk === 'string'
                ? chunk
                : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8');
        flushCompleteLines();
        resolvedCallback?.(null);
        return true;
    } as WritableWrite;

    Object.defineProperty(filteredWrite, 'flushRemainder', {
        value: flushRemainder,
    });

    return filteredWrite;
}

async function withFilteredIntegrationOutput(run: () => Promise<void>): Promise<void> {
    if (process.platform !== 'win32') {
        await run();
        return;
    }

    const state: KnownIntegrationOutputFilterState = { suppressMutexStack: false };
    const originalStdoutWrite = process.stdout.write.bind(process.stdout) as WritableWrite;
    const originalStderrWrite = process.stderr.write.bind(process.stderr) as WritableWrite;
    const filteredStdoutWrite = createFilteredWriter(
        originalStdoutWrite,
        state,
    ) as WritableWrite & { flushRemainder?: () => void };
    const filteredStderrWrite = createFilteredWriter(
        originalStderrWrite,
        state,
    ) as WritableWrite & { flushRemainder?: () => void };

    process.stdout.write = filteredStdoutWrite;
    process.stderr.write = filteredStderrWrite;

    try {
        await run();
    } finally {
        filteredStdoutWrite.flushRemainder?.();
        filteredStderrWrite.flushRemainder?.();
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    }
}

async function withIntegrationTestSandbox(
    run: (dirs: { userDataDir: string; extensionsDir: string }) => Promise<void>,
): Promise<void> {
    const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'metaflow-vscode-test-'));
    const userDataDir = path.join(sandboxRoot, 'user-data');
    const extensionsDir = path.join(sandboxRoot, 'extensions');

    await mkdir(userDataDir, { recursive: true });
    await mkdir(extensionsDir, { recursive: true });

    try {
        await run({ userDataDir, extensionsDir });
        await assertNoUnexpectedIntegrationErrors(userDataDir);
    } finally {
        await rm(sandboxRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
}

function createDefaultDeps(): RunTestDeps {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './integration/index');
    const testWorkspace = path.resolve(__dirname, '../../test-workspace');

    return {
        runUnit: async (): Promise<void> => {
            const unitIndex = path.resolve(__dirname, './unit/index');
            const { run } = await import(unitIndex);
            await run();
        },
        runIntegration: async (): Promise<void> => {
            await withIntegrationTestSandbox(async ({ userDataDir, extensionsDir }) => {
                await ensureIntegrationUserSettings(userDataDir);
                await withFilteredIntegrationOutput(async () => {
                    await runTests({
                        extensionDevelopmentPath,
                        extensionTestsPath,
                        launchArgs: [
                            testWorkspace,
                            '--disable-gpu',
                            '--disable-extensions',
                            '--disable-extension',
                            'vscode.git',
                            '--disable-extension',
                            'vscode.git-base',
                            '--disable-updates',
                            '--user-data-dir',
                            userDataDir,
                            '--extensions-dir',
                            extensionsDir,
                        ],
                    });
                });
            });
        },
        logError: (message: string, err: unknown): void => {
            console.error(message, err);
        },
    };
}

export async function runWithArgs(
    args: string[],
    deps: RunTestDeps = createDefaultDeps(),
): Promise<void> {
    const unitOnly = args.includes('--unit');
    if (unitOnly) {
        await deps.runUnit();
    } else {
        await deps.runIntegration();
    }
}

export async function main(
    args: string[] = process.argv.slice(2),
    deps: RunTestDeps = createDefaultDeps(),
): Promise<number> {
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
    void main().then((exitCode) => {
        if (exitCode !== 0) {
            process.exit(exitCode);
        }
    });
}
/* c8 ignore stop */
