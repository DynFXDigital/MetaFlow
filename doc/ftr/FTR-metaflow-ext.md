# FTR — Functional Test Results

## Document Header

| Doc ID | Scope | Related FTD | Owner |
|---|---|---|---|
| FTR-metaflow-ext | MetaFlow VS Code Extension | FTD-metaflow-ext | TBD |

| Last Updated | Notes |
|---|---|
| 2026-02-07 | Automated test results recorded |

## Run

| Run ID | Executor | Date | Build/Commit | Environment |
|---|---|---|---|---|
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
| TC-0300–TC-0305 | TP-A013 | Pass (6/6) | HEAD | `npm test` output | Extension activation |
| TC-0310–TC-0315 | TP-A014 | Pass (6/6) | HEAD | `npm test` output | Command execution |
| TC-0320–TC-0328 | TP-A015 | Pass (9/9) | HEAD | `npm test` output | TreeView providers |

## Results — Manual Tests

| TC-ID | TP-ID | Result | Build/Commit | Evidence Link(s) | Notes |
|---|---|---|---|---|---|
| _Pending_ | TP-M001–TP-M012 | _Not Yet Executed_ | — | — | Requires manual validation |

## Summary

| Metric | Value |
|---|---:|
| Automated Pass | 132 |
| Automated Fail | 0 |
| Manual Pass | 0 |
| Manual Pending | 12 |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Recorded automated test results: 111 unit + 21 integration = 132 passing | AI |
