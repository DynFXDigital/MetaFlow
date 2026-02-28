# FunctionalTestingGapClosure – Context

- **Last updated:** 2026-02-28
- **Status:** Phase 4 complete - critic-driven plan/goal refinement closed
- **Owner:** MetaFlow Maintainers

## Feature Overview

This effort closes functional testing gaps with a permanent governance model: `TCS` defines what is testable, `FTD` defines executable procedures, and `FTR` records authoritative execution results. The refined objective is to ensure automated release-gate sufficiency while explicitly documenting any residual manual/validation scope as non-blocking risk.

## Current Focus

1. Maintain CI/release/traceability enforcement aligned with `gate:quick` + `gate:integration` execution policy.
2. Maintain explicit boundary between automated release-gate readiness and manual validation track.
3. Track accepted-risk backlog items to target dates in FTP/FTR.

## Next Steps

- [x] Execute decoupled automated gates (`gate:quick`, `gate:integration`, `gate:full`) and capture evidence.
- [x] Upgrade command-level integration assertions for `clean` and `status` from no-throw checks to observable contracts.
- [x] Enforce integration execution in CI/release/traceability workflows.
- [x] Disposition remaining FTP high-risk gaps (`GAP-004`, `GAP-005`, `GAP-007`) as accepted non-blocking risk with owner/date in FTP/FTR.
- [x] Disposition activation-suite weak-oracle hardening as accepted non-blocking risk (`GAP-009`) and track in FTP/FTR.
- [x] Reconcile readiness language across FTP/FTR to eliminate governance ambiguity.

## References

- `.plan/functional-testing-gap-closure/README.md`
- `.plan/functional-testing-gap-closure/Phase1-Authoritative-Coverage.md`
- `.plan/functional-testing-gap-closure/Phase2-Implementation.md`
- `.plan/functional-testing-gap-closure/Phase3-Evidence-and-Readiness.md`
- `.plan/functional-testing-gap-closure/Phase4-Critic-Closure-Loop.md`
- `doc/ftd/FTP-metaflow-ext-functional-gap-closure.md`
- `doc/tcs/TCS-metaflow-ext.md`
- `doc/ftd/FTD-metaflow-ext.md`
- `doc/ftr/FTR-metaflow-ext.md`

## Decision Log

- **2026-02-22** - Plans are execution tools; authoritative closure status is only in `TCS`/`FTD`/`FTR`.
- **2026-02-28** - Automated gate model established: `gate:quick` + `gate:integration` + `gate:full`; integration decoupled from lint-coupled `pretest`.
- **2026-02-28** - CI, release, and traceability workflows now execute integration gate headlessly.
- **2026-02-28** - Command integration tests for `clean` and `status` now assert explicit behavioral contracts.
- **2026-02-28** - Remaining closure focus moved to critic-identified governance and residual high-risk backlog alignment.

## Open Questions & Risks

- Validation track (`doc/validation/**`) remains largely manual; full validation automation is not yet complete.
- VS Code update mutex noise can still appear during local integration runs; currently non-fatal but remains an operational risk.
