# Plan: Functional Testing Gap Closure (Authoritative-Artifact Driven)

## Problem Statement

MetaFlow currently has broad automated functional coverage, but several high-risk behaviors are validated by weak or indirect assertions. In addition, safety requirements and selected UI command contracts are not fully represented as first-class authoritative test records. This creates risk that behavior can regress without clear, evidence-backed detection.

## Goal

Close all critical and high-priority functional testing gaps required for deterministic automated release gating, and make any remaining validation-only/manual activities explicit non-blocking residual risk with owner/date.

Authoritative truth is maintained in:

- `doc/tcs/TCS-metaflow-ext.md` (what is testable)
- `doc/ftd/FTD-metaflow-ext.md` (how tests execute)
- `doc/ftr/FTR-metaflow-ext.md` (what actually ran and passed/failed)

Operational plans (including this one) coordinate execution but do not define authoritative pass/fail status.

## Scope

### In Scope

1. Convert weak integration assertions to contract-level checks.
2. Add missing critical/high `TC-*` coverage in `TCS` for safety and command behavior.
3. Add/update runnable `TP-*` procedures in `FTD` for all new/changed `TC-*` rows.
4. Implement automated tests to close targeted gaps.
5. Record execution evidence and closure outcomes in `FTR`.
6. Produce release-readiness recommendation tied to unresolved risk.

### Out of Scope

1. New feature development unrelated to testing gaps.
2. Broad refactors that do not directly improve functional verification.
3. Replacement of existing traceability ID conventions.

## Success Criteria

1. Zero open critical functional test gaps in scope for automated release gating.
2. All in-scope high gaps either closed with evidence or explicitly accepted risk with owner/date.
3. Every newly identified testable behavior represented in `TCS` as `TC-*`.
4. Every updated/new `TC-*` has executable `TP-*` mapping in `FTD`.
5. `FTR` contains run evidence for all changed/added high-risk `TC-*` rows.
6. Readiness decision documented in `FTR` with an explicit boundary statement clarifying what is and is not covered by automated release gating.

## Phase Plan

1. Phase 1: Authoritative Coverage Definition (`TCS` and `FTD` updates)
2. Phase 2: Test Implementation and Contract Hardening
3. Phase 3: Evidence Capture, Gap Burn-down, and Readiness Decision (`FTR`)
4. Phase 4: Critic-Driven Closure Loop (resolve remaining C1/C2/C3 findings or document accepted risk)

## Deliverables

- Updated `doc/tcs/TCS-metaflow-ext.md`
- Updated `doc/ftd/FTD-metaflow-ext.md`
- Updated test suites under `src/src/test/unit/` and `src/src/test/integration/`
- Updated `doc/ftr/FTR-metaflow-ext.md`
- Updated `.plan/functional-testing-gap-closure/Context.md`

## References

- `doc/srs/SRS-metaflow-ext.md`
- `doc/tcs/TCS-metaflow-ext.md`
- `doc/ftd/FTD-metaflow-ext.md`
- `doc/ftr/FTR-metaflow-ext.md`
- `.github/instructions/test-tcs.instructions.md`
- `.github/instructions/test-ftd.instructions.md`
- `.github/instructions/test-ftr.instructions.md`
- `.github/instructions/traceability-core.instructions.md`
- `doc/ftd/FTP-metaflow-ext-functional-gap-closure.md`
