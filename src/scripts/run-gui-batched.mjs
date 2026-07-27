/**
 * Batched production GUI test runner.
 *
 * Runs the ExTester (Selenium) GUI suites in small batches instead of one long
 * `setup-and-run` session. A single VS Code host that runs all ~30 suites
 * back-to-back degrades over time — later suites fail with spurious
 * "element not visible" / click-intercepted timeouts as workbench state (stray
 * notifications, modal backdrops) accumulates. Running ~6 suites per fresh host
 * keeps each session short enough to stay stable while still exercising the
 * whole suite.
 *
 * Usage:
 *   node ./scripts/run-gui-batched.mjs            # all suites, batches of 6
 *   GUI_BATCH_SIZE=4 node ./scripts/run-gui-batched.mjs
 *   GUI_VSCODE_VERSION=1.110.0 node ./scripts/run-gui-batched.mjs
 *   node ./scripts/run-gui-batched.mjs 12 19 22   # only suites whose basename
 *                                                 # starts with these prefixes
 *
 * Assumes the VSIX has been built (npm run package:gui). VS Code + chromedriver
 * are downloaded on first run and reused thereafter.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..'); // .../src
const guiRel = path.join('out', 'test', 'gui');
const guiDir = path.join(srcRoot, guiRel);
const testWorkspace = path.join(srcRoot, 'test-workspace');
const extestCli = require.resolve('vscode-extension-tester/out/cli.js');

const STORAGE = '.vscode-test/gui';
const EXTENSIONS = '.vscode-test/gui/extensions';
const VSIX = 'metaflow-test.vsix';

const batchSize = Math.max(1, Number(process.env.GUI_BATCH_SIZE ?? '6'));
const codeVersion = process.env.GUI_VSCODE_VERSION ?? '1.110.0';
const prefixes = process.argv.slice(2);

function parseTimeoutMs(value, fallbackMs) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(60_000, parsed) : fallbackMs;
}

const setupTimeoutMs = parseTimeoutMs(process.env.GUI_SETUP_TIMEOUT_MS, 10 * 60 * 1_000);
const batchTimeoutMs = parseTimeoutMs(process.env.GUI_BATCH_TIMEOUT_MS, 5 * 60 * 1_000);

function runExtest(args, label, timeoutMs) {
    console.log(`\n>>> extest ${args[0]} ${label ?? ''}`.trimEnd());
    const startedAt = Date.now();
    const res = spawnSync(process.execPath, [extestCli, ...args], {
        cwd: srcRoot,
        encoding: 'utf-8',
        stdio: ['inherit', 'pipe', 'pipe'],
        timeout: timeoutMs,
        killSignal: 'SIGTERM',
    });
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    process.stdout.write(out);
    const elapsedMs = Date.now() - startedAt;
    const timedOut = res.error?.code === 'ETIMEDOUT';
    if (timedOut) {
        console.error(
            `\nExTester timed out after ${Math.round(elapsedMs / 1_000)}s ` +
                `(${label ?? args[0]}).`,
        );
    }
    return {
        status: res.status ?? 1,
        out,
        timedOut,
    };
}

// ── Setup: download VS Code + chromedriver (idempotent) and install the VSIX ──
const setupSteps = [
    [['get-vscode', '-s', STORAGE, '-c', codeVersion], `download VS Code ${codeVersion}`],
    [
        ['get-chromedriver', '-s', STORAGE, '-c', codeVersion],
        `download chromedriver for VS Code ${codeVersion}`,
    ],
    [['install-vsix', '-s', STORAGE, '-e', EXTENSIONS, '-f', VSIX], 'install VSIX'],
];
for (const [args, label] of setupSteps) {
    const { status, timedOut } = runExtest(args, label, setupTimeoutMs);
    if (status !== 0) {
        console.error(`\nSetup step ${timedOut ? 'timed out' : 'failed'} (${label}). Aborting.`);
        process.exit(1);
    }
}

// ── Collect compiled suite files ──────────────────────────────────────────────
let suites = readdirSync(guiDir)
    .filter((f) => f.endsWith('.test.js'))
    .sort();
if (prefixes.length > 0) {
    suites = suites.filter((f) => prefixes.some((p) => f.startsWith(p)));
}
if (suites.length === 0) {
    console.error('No GUI suite files matched.');
    process.exit(1);
}

const batches = [];
for (let i = 0; i < suites.length; i += batchSize) {
    batches.push(suites.slice(i, i + batchSize));
}

// ── Run each batch in its own VS Code host ────────────────────────────────────
let totalPass = 0;
let totalFail = 0;
const failedBatches = [];

for (const [idx, batch] of batches.entries()) {
    const files = batch.map((f) => path.posix.join('out/test/gui', f));
    const label = `batch ${idx + 1}/${batches.length}: ${batch.join(', ')}`;
    const { status, out, timedOut } = runExtest(
        [
            'run-tests',
            ...files,
            '-s',
            STORAGE,
            '-e',
            EXTENSIONS,
            '-c',
            codeVersion,
            '-r',
            testWorkspace,
            '-m',
            '.mocharc-gui.js',
            '-o',
            '.vscode-test-gui-settings.json',
        ],
        label,
        batchTimeoutMs,
    );
    const pass = Number(out.match(/(\d+) passing/)?.[1] ?? '0');
    const fail = Number(out.match(/(\d+) failing/)?.[1] ?? '0');
    totalPass += pass;
    totalFail += fail;
    if (fail > 0 || status !== 0 || timedOut) {
        failedBatches.push(label);
    }
    if (timedOut) {
        console.error('\nAborting remaining GUI batches after a timed-out host.');
        break;
    }
}

console.log(
    `\n=== GUI batched summary: ${totalPass} passing, ${totalFail} failing ` +
        `across ${batches.length} batch(es) of ${batchSize} ===`,
);
if (failedBatches.length > 0) {
    console.log('Batches with failures:');
    for (const b of failedBatches) {
        console.log(`  - ${b}`);
    }
}
process.exit(totalFail > 0 || failedBatches.length > 0 ? 1 : 0);
