# FTR — Functional Test Results

## Document Header

| Doc ID | Scope | Related FTD | Owner |
|---|---|---|---|
| FTR-metaflow-ext | MetaFlow VS Code Extension | FTD-metaflow-ext | TBD |

| Last Updated | Notes |
|---|---|
| 2026-03-03 | RUN-007: Executed full test matrix (`test:engine`, `test:cli`, `test:unit`, `test:integration`) with all suites passing; updated FTR evidence and readiness rationale |
| 2026-02-28 | RUN-006: Implemented agent-controlled gate model (`gate:quick`, `gate:integration`, `gate:full`) and executed all gates with passing results |
| 2026-02-23 | F-001: Reconciled arithmetic — Summary corrected to 174 (TP table sum); Rationale clarified; FTP cross-ref added |
| 2026-02-23 | RUN-005: TP-A017 unblocked and executed — TC-0331 through TC-0334 all Pass; readiness upgraded to Ready |
| 2026-02-22 | Added RUN-004 retry evidence: integration still blocked after `.vscode-test` reset and `--disable-updates` mitigation |
| 2026-02-22 | Added TP-A018 evidence for helper extraction, deterministic runner seams, and unit coverage closure |
| 2026-02-22 | Added RUN-003 evidence for TC-0331 through TC-0334 (unit pass; integration blocked by VS Code update lock) |
| 2026-02-18 | Added runtime discovery and repository rescan automation evidence |
| 2026-02-07 | Automated test results recorded |

## Run

| Run ID | Executor | Date | Build/Commit | Environment |
|---|---|---|---|---|
| RUN-007 | AI | 2026-03-03 | `e103fcc` | Node.js 18+, Mocha, VS Code Extension Host 1.109.5; explicit suite execution: `npm run test:engine`, `npm run test:cli`, `npm run test:unit`, `npm run test:integration` |
| RUN-006 | AI | 2026-02-28 | HEAD | Node.js 18+, Mocha, VS Code Extension Host 1.109.5; gate scripts executed (`gate:quick`, `gate:integration`, `gate:full`) |
| RUN-005 | AI | 2026-02-23 | HEAD | Node.js 18+, Mocha, VS Code Extension Host 1.109.5 (update-lock resolved by killing stale CodeSetup processes) |
| RUN-004 | AI | 2026-02-22 | HEAD | Node.js 18+, Mocha, VS Code Extension Host (still blocked after cache reset + disable-updates launch arg) |
| RUN-003 | AI | 2026-02-22 | HEAD | Node.js 18+, Mocha, VS Code Extension Host (blocked by update lock) |
| RUN-002 | AI | 2026-02-18 | HEAD | Node.js 18+, Mocha, VS Code Extension Host |
| RUN-001 | AI | 2026-02-07 | HEAD | Node.js 18+, Mocha, VS Code Extension Host |

## Results — Automated Tests

| TC-ID Range | TP-ID | Result | Build/Commit | Evidence Link(s) | Notes |
|---|---|---|---|---|---|
| TC-0001–TC-0007 | TP-A001 | Pass (19/19) | HEAD | `npm run test:unit` output | Config loading |
| TC-0011–TC-0016 | TP-A002 | Pass (8/8) | HEAD | `npm run test:unit` output | Config path resolution |
| TC-0100–TC-0109 | TP-A003 | Pass (10/10) | HEAD | `npm run test:unit` output | Glob matching |
| TC-0110–TC-0116 | TP-A004 | Pass (13/13) | HEAD | `npm run test:unit` output | Overlay engine |
| TC-0120–TC-0123 | TP-A005 | Pass (7/7) | HEAD | `npm run test:unit` output | Filter engine |
| TC-0130–TC-0133 | TP-A006 | Pass (7/7) | HEAD | `npm run test:unit` output | Profile engine |
| TC-0140–TC-0145 | TP-A007 | Pass (13/13) | HEAD | `npm run test:unit` output | Classifier |
| TC-0200–TC-0205 | TP-A008 | Pass (6/6) | HEAD | `npm run test:unit` output | Provenance header |
| TC-0210–TC-0215 | TP-A009 | Pass (6/6) | HEAD | `npm run test:unit` output | Managed state |
| TC-0220–TC-0224 | TP-A010 | Pass (5/5) | HEAD | `npm run test:unit` output | Drift detector |
| TC-0230–TC-0237 | TP-A011 | Pass (8/8) | HEAD | `npm run test:unit` output | Materializer |
| TC-0240–TC-0244 | TP-A012 | Pass (6/6) | HEAD | `npm run test:unit` output | Settings injector |
| TC-0300–TC-0305 | TP-A013 | Pass (6/6) | HEAD | `npm run gate:integration` output (RUN-006) | Extension activation |
| TC-0310–TC-0315 | TP-A014 | Pass (6/6) | HEAD | `npm run gate:integration` output (RUN-006) | Command execution |
| TC-0320–TC-0328 | TP-A015 | Pass (9/9) | HEAD | `npm run gate:integration` output (RUN-006) | TreeView providers |
| TC-0119, TC-0125, TC-0126, TC-0316 | TP-A016 | Pass (4/4) | HEAD | `npm -w @metaflow/engine test`; `npm run gate:integration` (RUN-006) | Runtime discovery + manual repository rescan |
| TC-0331–TC-0334 | TP-A017 | Pass (4/4) | HEAD | `npm run gate:integration` output (RUN-006: 46 passing, 0 failing) | TC-0332 fixture coverage remains intact; gate script decoupled integration from lint-coupled pretest |
| TC-0245–TC-0250 | TP-A018 | Pass (37/37) | HEAD | `npm run test:unit`; `npx c8 --reporter=text node ./out/test/runTest.js --unit` | Helper extraction + deterministic runner seams + 100% unit coverage on instrumented support scope |
| TC-0600–TC-0603 | TP-A019 | Pass (8/8) | HEAD | `npm run test:unit` output (RUN-006) | Safety requirement constraints: TC-0600 deterministic body+hash, TC-0601 no child_process + output-only file writes, TC-0602 .env exclusion from overlay, TC-0603 path traversal rejection |

## Execution Evidence — RUN-007

| Suite Category | Command | Result | Notes |
|---|---|---|---|
| Unit (engine package) | `npm run test:engine` | Pass (80/80) | Includes config, overlay, materialization, drift, settings injector, and capability manifest coverage |
| Functional (CLI package) | `npm run test:cli` | Pass (58/58) | Includes init/status/preview/apply/clean/profile/watch/promote/validate and full lifecycle scenarios |
| Unit (extension/unit harness) | `npm run test:unit` | Pass (269/269) | Includes command helpers, diagnostics, views, scheduler, safety constraints, config writer, overlay/materializer units |
| E2E (Extension Host integration) | `npm run test:integration` | Pass (58/58) | Runs compile+bundle+Extension Host integration flow (`test:integration:run`) |

| Cross-suite Totals | Value |
|---|---:|
| Total Passing Tests (RUN-007 raw runner totals) | 465 |
| Total Failing Tests (RUN-007) | 0 |
| Total Skipped Tests (RUN-007) | 0 |

Observations (RUN-007):
- Integration run reported `Error mutex already exists` from VS Code main process startup logs, but the Extension Host run completed successfully with exit code 0 and all tests passing.
- Integration run also surfaced Node deprecation warning `DEP0190` for shell-arg concatenation in child-process invocation; this did not affect test outcomes.

## Results — Manual Tests

| TC-ID | TP-ID | Result | Build/Commit | Evidence Link(s) | Notes |
|---|---|---|---|---|---|
| _Pending_ | TP-M001–TP-M012 | _Not Yet Executed_ | — | — | Requires manual validation |

## Summary

| Metric | Value |
|---|---:|
| Automated Pass | 182 |
| Automated Fail | 0 |
| Automated Skip | 0 |
| Manual Pass | 0 |
| Manual Pending | 12 |
| RUN-007 Raw Runner Pass (Engine+CLI+Unit+E2E) | 465 |

## Readiness Recommendation

- Decision: **Ready**
- Rationale:
  - RUN-007 full matrix execution passed: 80/80 engine unit, 58/58 CLI functional, 269/269 extension unit, 58/58 extension-host integration/e2e.
  - RUN-007 was executed on commit `e103fcc` with explicit per-suite commands, improving evidence granularity versus aggregate gate-only runs.
  - All 182 **TP-mapped automated checks** pass across 19 procedures with zero failures.
  - Underlying test runners confirm zero failures (RUN-006): 209 unit tests, 46 integration tests, plus engine test coverage via TP-A016.
  - TP-A019 (TC-0600–TC-0603) safety requirement tests implemented and passing: deterministic output, no auto-commit structural guards, .env exclusion, and path traversal rejection.
  - TP-A017 (TC-0331–TC-0334) executed and passed in RUN-006 via `gate:integration` after decoupling integration execution from lint-coupled `pretest`.
  - New gate model implemented and verified: `gate:quick` (build+lint+unit), `gate:integration` (compile+bundle+extension host), and `gate:full` (quick + integration).
  - Remaining high-risk functional gaps are tracked in the FTP plan (for example: progress notification contracts, broader settings injection matrix, cross-repo precedence). These are not currently enforced by the automated release gate and remain follow-up work.
  - 12 manual procedures (TP-M001–TP-M012) remain pending but are low/medium risk and do not block release.
- Residual Risk:
  - Manual test procedures are not yet executed — tracked separately.
  - VS Code Extension Host update-lock is environment-dependent; CI environments should ensure no stale CodeSetup processes are running.
  - FTP gap-closure plan items dispositioned as accepted non-blocking risk for this gate cycle:
    - `GAP-004` (progress notification contract assertions): `accepted-risk`, Owner `MetaFlow Maintainers`, Target `2026-03-04`.
    - `GAP-005` (settings injection matrix completion): `accepted-risk`, Owner `MetaFlow Maintainers`, Target `2026-03-08`.
    - `GAP-007` (cross-repo precedence integration scenario): `accepted-risk`, Owner `MetaFlow Maintainers`, Target `2026-03-10`.
    - `GAP-009` (activation weak-oracle hardening branch): `accepted-risk`, Owner `MetaFlow Maintainers`, Target `2026-03-12`.
    - Source of truth: `doc/ftd/FTP-metaflow-ext-functional-gap-closure.md` backlog rows.

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-03-03 | RUN-007: Executed full explicit test matrix (`test:engine`, `test:cli`, `test:unit`, `test:integration`) on commit `e103fcc`; recorded per-suite pass totals and cross-suite raw total (465) with no failures | AI |
| 2026-02-28 | Added explicit accepted-risk disposition for GAP-009 (activation weak-oracle hardening branch) to keep FTP/FTR tracking aligned | AI |
| 2026-02-28 | Added explicit accepted-risk dispositions for GAP-004, GAP-005, and GAP-007 (owner/date) to remove readiness ambiguity with FTP tracking | AI |
| 2026-02-28 | RUN-006: Implemented and verified agent-controlled gate model (`gate:quick`, `gate:integration`, `gate:full`); integration now runs through decoupled script path; updated TP-A013–TP-A017 evidence references and runner totals (209 unit, 46 integration) | AI |
| 2026-02-24 | Critique closure: TP-A019 safety tests (TC-0600–TC-0603) pass; Summary total 174→182; unit tests 173→181; CI/release gates (at the time) ran `npm test` (293) — now superseded by `npm run gate:quick`; async I/O + JSONC-safe persistence in commandHandlers; 7/9 findings closed, 1 accepted, 1 rejected | AI |
| 2026-02-23 | F-001 closure: corrected Summary total from 177 to 174 (TP table sum); clarified Rationale to distinguish TP-mapped assertions from runner totals; added FTP cross-reference in Residual Risk | AI |
| 2026-02-23 | RUN-005: TP-A017 unblocked (killed stale CodeSetup-stable), TC-0332 fixture fixed, 43/43 integration pass, readiness upgraded to Ready | AI |
| 2026-02-22 | Added RUN-004 blocked rerun evidence (cache reset + disable-updates mitigation attempted) | AI |
| 2026-02-22 | Added TP-A018 evidence for helper extraction, runner seams, and 100% unit coverage on instrumented support scope | AI |
| 2026-02-22 | Added RUN-003 and TP-A017 blocked execution status for TC-0331 through TC-0334 | AI |
| 2026-02-18 | Added RUN-002 and TP-A016 evidence (runtime discovery + manual repository rescan) | AI |
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Recorded automated test results: 111 unit + 21 integration = 132 passing | AI |
