# Phase 2 - Docs and Traceability Reconciliation

## Objective

Fix release-readiness document integrity issues and close traceability gaps that affect auditability.

## Tasks

- [ ] Correct arithmetic and summary statements in `doc/ftr/FTR-metaflow-ext.md`.
- [ ] Reconcile readiness statement conflicts between `FTR` and `FTP` and declare a clear authority model.
- [ ] Refresh operational counts and command inventory in `AGENTS.md` and `src/CHANGELOG.md`.
- [ ] Confirm requirement naming/path consistency where critiques identified mismatch candidates.
- [ ] For REQ-060x:
  - [ ] Add/confirm `TC-*` entries in `doc/tcs/TCS-metaflow-ext.md`.
  - [ ] Add/confirm executable `TP-*` procedures in `doc/ftd/FTD-metaflow-ext.md`.
  - [ ] Record pass/fail evidence linkage in `doc/ftr/FTR-metaflow-ext.md`.
- [ ] Ensure docs maintain required traceability constraints (no forward-links in SRS; complete downstream links).

## Deliverables

1. Updated `FTR`, `FTP`, `TCS`, and `FTD` with reconciled readiness and trace chain.
2. Updated `AGENTS.md` and `src/CHANGELOG.md` reflecting current verified operational claims.
3. A short reconciliation note summarizing what changed and why.

## Completion Criteria

- No unresolved arithmetic or authority contradictions across readiness docs.
- REQ-060x is traceable from requirement to executable evidence.
