# FunctionalTestingGapClosure – Context

- **Last updated:** 2026-02-22
- **Status:** Phase 3 in progress - authoritative docs updated; integration rerun blocked by environment lock
- **Owner:** MetaFlow Maintainers

## Feature Overview

This effort closes functional testing gaps with a permanent governance model: `TCS` defines what is testable, `FTD` defines executable procedures, and `FTR` records authoritative execution results. Planning artifacts coordinate work but do not define official pass/fail status.

## Current Focus

1. Keep TP-A017 ready for immediate rerun once VS Code Extension Host update lock clears.
2. Convert TC-0331 through TC-0334 from Skip to Pass evidence in `FTR` as the sole remaining closure task.

## Next Steps

- [x] Add high-rigor unit tests for extension support modules (`outputChannel`, `statusBar`, `configDiagnostics`, `workspaceSelection`).
- [x] Refactor test runners (`src/src/test/runTest.ts`, `src/src/test/unit/index.ts`) for deterministic branch-level unit coverage.
- [x] Re-run unit suite + coverage and capture evidence (`npm run test:unit`, `npx c8 --reporter=text node ./out/test/runTest.js --unit`).
- [x] Define and execute extraction tranche for `commandHandlers.ts` and `initConfig.ts` via `commandHelpers.ts` and `initConfigHelpers.ts`.
- [x] Add high-rigor unit suites for extracted helper modules and runner seams.
- [x] Capture evidence: `npm run test:unit` => 173 passing; `npx c8 --reporter=text node ./out/test/runTest.js --unit` => 100/100/100/100.
- [x] Promote/align authoritative traceability updates (`TCS`/`FTD`/`FTR`) for watcher/settings/promote contract coverage.
- [ ] Re-run integration suite after VS Code host update completes; update `FTR` to close TP-A017 skip status. (RUN-004 retry still blocked)

## References

- `.plan/functional-testing-gap-closure/README.md`
- `.plan/functional-testing-gap-closure/Phase1-Authoritative-Coverage.md`
- `.plan/functional-testing-gap-closure/Phase2-Implementation.md`
- `.plan/functional-testing-gap-closure/Phase3-Evidence-and-Readiness.md`
- `doc/ftd/FTP-metaflow-ext-functional-gap-closure.md`
- `doc/tcs/TCS-metaflow-ext.md`
- `doc/ftd/FTD-metaflow-ext.md`
- `doc/ftr/FTR-metaflow-ext.md`

## Decision Log

- **2026-02-22** - Plans are execution tools; authoritative closure status is only in `TCS`/`FTD`/`FTR`.
- **2026-02-22** - Critical and high-risk functional gaps must be completed before medium-priority expansions.
- **2026-02-22** - Unit test runner modules were refactored to expose deterministic seams (`runWithArgs`, `main`, `collectTestFiles`, `runMocha`) to support complete branch coverage.
- **2026-02-22** - Temporary command-handler export seams were removed; next coverage tranche will use extraction-first refactor instead of partial in-file instrumentation.
- **2026-02-22** - Extracted `commandHelpers.ts` and `initConfigHelpers.ts` to make command/init normalization and parsing logic unit-testable without VS Code host dependencies.
- **2026-02-22** - Latest unit coverage snapshot reached 100% statement/branch/function/line on instrumented extension support modules.
- **2026-02-22** - Promoted high-risk command coverage into authoritative artifacts (`TC-0331`..`TC-0334`, `TP-A017`, `RUN-003`).
- **2026-02-22** - Integration execution currently blocked by VS Code test-host update-lock message during launch.
- **2026-02-22** - RUN-004 retried integration after `.vscode-test` reset and `--disable-updates` launch mitigation; update-lock persisted.

## Open Questions & Risks

- Extension Host test execution remains blocked by: "Code is currently being updated. Please wait for the update to complete before launching." after two rerun windows and cache-reset mitigation.
- Some UI-oriented checks may require manual evidence supplements if extension host automation cannot reliably assert them.
