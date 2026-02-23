# Functional Test Plan (Gap Closure)

## Document Header

| Doc ID | Scope | Related TCS | Owner | Status |
|---|---|---|---|---|
| FTP-metaflow-ext-functional-gap-closure | MetaFlow VS Code Extension functional lock-down | TCS-metaflow-ext | MetaFlow Maintainers | Active |

| Last Updated | Planned Window | Notes |
|---|---|---|
| 2026-02-22 | 2026-02-22 to 2026-03-15 | Focus on high-risk functional and integration gaps blocking release confidence |

## Goal

- Define the minimum functional test set required to close known coverage gaps and lock down release behavior.

## Functional Surface Inventory

| Area ID | Workflow / Behavior | REQ-ID(s) | Risk | Current Coverage | Notes |
|---|---|---|---|---|---|
| AREA-001 | Config lifecycle: valid, invalid, recovery | REQ-0001, REQ-0003, REQ-0004, REQ-0008, REQ-0400 | Critical | Partial | Diagnostics publish/clear covered; watcher-driven refresh path not explicitly tested end-to-end |
| AREA-002 | Overlay resolution and precedence across repos | REQ-0100, REQ-0101, REQ-0103, REQ-0113, REQ-0114, REQ-0117 | High | Partial | Core resolution heavily unit-tested; cross-repo precedence is not represented by a dedicated integration assertion |
| AREA-003 | Apply/clean/protect behavior under drift | REQ-0200, REQ-0205, REQ-0206, REQ-0207, REQ-0208, REQ-0402, REQ-0403, REQ-0409 | Critical | Partial | Materializer unit coverage strong; command-level integration checks still include weak no-throw assertions for status/promote flows |
| AREA-004 | UI view correctness and command outcomes | REQ-0303, REQ-0304, REQ-0305, REQ-0307, REQ-0308, REQ-0309, REQ-0404, REQ-0405, REQ-0406 | High | Partial | Tree provider tests strong; status/output/progress behavior lacks contract-level integration assertions |
| AREA-005 | Settings injection and cleanup | REQ-0211, REQ-0212, REQ-0500, REQ-0501, REQ-0502, REQ-0503, REQ-0504 | High | Partial | Instructions/prompts coverage present; skill/agent/hook edge combinations and hooksEnabled=false paths need explicit functional tests |
| AREA-006 | Safety and path protections | REQ-0600, REQ-0601, REQ-0602, REQ-0603 | Critical | Weak | Safety requirements are listed in SRS but have no explicit TC rows in current TCS |

## Entry / Exit Criteria

| Phase | Entry Criteria | Exit Criteria |
|---|---|---|
| Smoke | Integration/unit test harness runs in CI and workspace fixture is valid | Critical command workflows pass with assertions stronger than no-throw |
| Regression | Smoke phase complete, high-risk gaps prioritized and assigned | All critical/high gaps in this plan are either closed or formally accepted as deferred |
| Release Candidate | Regression phase complete; updated FTR evidence available | 0 open critical gaps, <=2 open high gaps with approved risk acceptance, readiness decision recorded |

## Execution Procedures

| TP-ID | Title | Type | Priority | How to Run | Evidence |
|---|---|---|---|---|---|
| TP-1001 | Config watcher auto-refresh behavior | Automated | Critical | Add integration test in `src/src/test/integration/commands.test.ts`; run `npm run test` in `src/` | Extension Host output + assertion log |
| TP-1002 | Cross-repo precedence integration contract | Automated | Critical | Add integration fixture + assertions in `src/src/test/integration/commands.test.ts`; run `npm run test` | Extension Host output + filesystem assertions |
| TP-1003 | Promote/status functional output assertions | Automated | High | Update `src/src/test/integration/commands.test.ts`; assert output channel content patterns; run `npm run test` | Output channel capture log |
| TP-1004 | Progress notification contract for apply/clean | Automated | High | Add integration instrumentation around notifications in `src/src/test/integration/commands.test.ts`; run `npm run test` | Captured notification events |
| TP-1005 | Settings injection matrix (skills/agents/hooks + hooks toggle) | Automated | High | Add integration cases in `src/src/test/integration/commands.test.ts` and unit add-ons in `src/src/test/unit/settingsInjector.test.ts`; run `npm run test:unit` and `npm run test` | Unit + integration logs |
| TP-1006 | Safety requirements formalization and tests | Mixed | Critical | Add TC rows to `doc/tcs/TCS-metaflow-ext.md`; implement unit/integration tests in `src/src/test/unit/configPathUtils.test.ts`, `src/src/test/unit/materializer.test.ts`, and `src/src/test/integration/commands.test.ts` | Updated TCS + test run logs |
| TP-1007 | Manual validation pass for remaining UI-only flows | Manual | Medium | Execute selected manual procedures from `doc/ftd/FTD-metaflow-ext.md` and record in FTR | Screenshots + operator log |

## Traceability Matrix (TP -> TC)

| TP-ID | TC-0310 | TC-0312 | TC-0313 | TC-0314 | TC-0315 | TC-0316 | TC-0329 | TC-0330 |
|---|---|---|---|---|---|---|---|---|
| TP-1001 | X |  |  |  |  |  | X | X |
| TP-1002 | X | X |  |  |  | X |  |  |
| TP-1003 |  |  |  | X | X |  |  |  |
| TP-1004 |  | X | X |  |  |  |  |  |
| TP-1005 |  | X | X |  |  |  |  |  |
| TP-1006 | X | X | X |  | X |  |  |  |
| TP-1007 |  |  |  | X | X |  |  |  |

## Open Gap Backlog

| Gap ID | TC-ID | Gap Type | Risk | Owner | Target Date | Closure Action | Status |
|---|---|---|---|---|---|---|---|
| GAP-001 | TC-0314 | Weak oracle | High | MetaFlow Maintainers | 2026-03-01 | Replace no-throw status test with output-channel contract assertions | Open |
| GAP-002 | TC-0315 | Weak oracle | High | MetaFlow Maintainers | 2026-03-01 | Replace no-throw promote test with drift-report assertions | Open |
| GAP-003 | TC-0310 | Missing watcher path coverage | Critical | MetaFlow Maintainers | 2026-03-04 | Add config create/change/delete watcher-triggered refresh test | Open |
| GAP-004 | TC-0312/TC-0313 | Missing progress contract assertions | High | MetaFlow Maintainers | 2026-03-04 | Assert progress notification behavior for apply and clean | Open |
| GAP-005 | TC-0312 | Incomplete settings matrix | High | MetaFlow Maintainers | 2026-03-08 | Add functional matrix for skills/agents/hooks injection and hooks disable | Open |
| GAP-006 | TC-(new) | Missing safety TCs for REQ-0601/0602/0603 | Critical | MetaFlow Maintainers | 2026-03-10 | Add new TC IDs and automated tests for safety constraints | Open |
| GAP-007 | TC-0101/TC-0116 | Integration gap for cross-repo precedence | High | MetaFlow Maintainers | 2026-03-10 | Add integration scenario proving global precedence across repos | Open |
| GAP-008 | TC-0307/TC-0308/TC-0309 | Manual-only UI lock-down evidence missing | Medium | QA Owner (TBD) | 2026-03-15 | Execute manual procedures and append evidence to FTR | Open |

## Coverage Gate Summary

| Gate | Rule | Current | Target | Status |
|---|---|---:|---:|---|
| REQ coverage | Enforced REQ has >=1 TC | 46 | 49 | Fail |
| TC procedure coverage | Each TC has >=1 TP | 70 | 70 | Pass |
| High-risk gaps | Unclosed high-risk gaps | 7 | 0 | Fail |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-22 | Initial gap-closure plan for functional lock-down | AI |
