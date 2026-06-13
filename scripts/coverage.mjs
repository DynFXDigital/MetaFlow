// Cross-platform coverage runner that drives c8's library API directly.
//
// c8's bundled CLI (yargs 17.7.2) fails to load under Node >= 26 because Node's
// synchronous require-of-ESM path mis-handles yargs' extensionless `./yargs`
// entry. c8's Report class never touches yargs, so we collect coverage with
// Node's native NODE_V8_COVERAGE and render reports through this script.
//
// Usage (run from a package directory):
//   node ../../scripts/coverage.mjs --tests "out/test/**/*.test.js" --include "out/src/**"
// Or drive a custom runner instead of the mocha CLI:
//   node ../scripts/coverage.mjs --script out/test/runTest.js --script-arg --unit --include "out/**"
// Optional: --reporter <name> (repeatable), --reports-dir <dir>, --timeout <ms>,
//           --exclude <glob> (repeatable),
//           --check-coverage --lines N --branches N --functions N --statements N

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const mfRoot = path.join(scriptDir, '..')
const reportFactory = require(path.join(mfRoot, 'node_modules', 'c8')).Report
const defaultExclude = require(path.join(mfRoot, 'node_modules', '@istanbuljs', 'schema', 'default-exclude'))
const defaultExtension = require(path.join(mfRoot, 'node_modules', '@istanbuljs', 'schema', 'default-extension'))

function parseArgs (argv) {
  const opts = { tests: [], include: [], reporter: [], excludeExtra: [], scriptArgs: [], timeout: '10000' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '--tests': opts.tests.push(next()); break
      case '--include': opts.include.push(next()); break
      case '--reporter': opts.reporter.push(next()); break
      case '--exclude': opts.excludeExtra.push(next()); break
      case '--script': opts.script = next(); break
      case '--script-arg': opts.scriptArgs.push(next()); break
      case '--reports-dir': opts.reportsDir = next(); break
      case '--timeout': opts.timeout = next(); break
      case '--check-coverage': opts.checkCoverage = true; break
      case '--lines': opts.lines = Number(next()); break
      case '--branches': opts.branches = Number(next()); break
      case '--functions': opts.functions = Number(next()); break
      case '--statements': opts.statements = Number(next()); break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!opts.script && !opts.tests.length) opts.tests = ['out/test/**/*.test.js']
  if (!opts.include.length) opts.include = ['out/src/**']
  if (!opts.reporter.length) opts.reporter = ['text', 'lcov']
  if (!opts.reportsDir) opts.reportsDir = './coverage'
  return opts
}

const opts = parseArgs(process.argv.slice(2))
const tempDirectory = mkdtempSync(path.join(tmpdir(), 'mf-cov-'))

const spawnArgs = opts.script
  ? [path.resolve(process.cwd(), opts.script), ...opts.scriptArgs]
  : [require.resolve('mocha/bin/mocha.js', { paths: [process.cwd(), mfRoot] }), ...opts.tests, '--timeout', opts.timeout]
const result = spawnSync(
  process.execPath,
  spawnArgs,
  { stdio: 'inherit', env: { ...process.env, NODE_V8_COVERAGE: tempDirectory } }
)

let exitCode = result.status ?? 1
try {
  const report = reportFactory({
    include: opts.include,
    exclude: [...defaultExclude, ...opts.excludeExtra],
    extension: defaultExtension,
    excludeNodeModules: true,
    excludeAfterRemap: false,
    reporter: opts.reporter,
    reportsDirectory: opts.reportsDir,
    tempDirectory,
    omitRelative: true,
    resolve: '',
    all: false,
    skipFull: false
  })
  await report.run()

  if (opts.checkCoverage && exitCode === 0) {
    const libCoverage = require(path.join(mfRoot, 'node_modules', 'istanbul-lib-coverage'))
    const map = await report.getCoverageMapFromAllCoverageFiles()
    const summary = libCoverage.createCoverageSummary()
    map.files().forEach((f) => summary.merge(map.fileCoverageFor(f).toSummary()))
    const thresholds = { lines: opts.lines, branches: opts.branches, functions: opts.functions, statements: opts.statements }
    for (const key of Object.keys(thresholds)) {
      const min = thresholds[key]
      if (min && summary.data[key].pct < min) {
        console.error(`coverage: ${key} ${summary.data[key].pct}% < threshold ${min}%`)
        exitCode = 1
      }
    }
  }
} finally {
  rmSync(tempDirectory, { recursive: true, force: true })
}

process.exit(exitCode)
