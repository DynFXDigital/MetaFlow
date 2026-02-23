---
description: "Core traceability rules and ID conventions across documentation and tests."
applyTo: "doc/**"
---

# Traceability Core Rules

## ID Conventions

- Requirements: `REQ-####`
- Design elements: `DES-####`
- Test cases: `TC-####`
- Procedures: `TP-####`
- Results: `TR-YYYYMMDD-nn`
- Validation equivalents: `VREQ-*`, `VTC-*`, `VTP-*`, `VTR-*`

## Traceability Direction

- SRS/VSRS never link forward to design/tests.
- Downstream artifacts must link back to upstream IDs.

## Authoritative Functional Testing Artifacts

- `TCS` is the authoritative definition of what is testable (`TC-*` scope and requirement coverage).
- `FTD` is the authoritative definition of how each `TC-*` is executed (`TP-*` procedures).
- `FTR` is the authoritative execution record of what actually ran and what passed/failed/skipped (`TR-*` evidence).
- Planning artifacts (for example FTP, gap closure plans, project plans) are operational guides and must not be treated as the source of truth for testability or execution status.
- Any gap identified in planning artifacts must be reflected by updates to `TCS`/`FTD` and then evidenced in `FTR`.

## Minimum Coverage Rules

- Every enforced `REQ-*` maps to ≥1 `TC-*`.
- Every `TC-*` maps to ≥1 `REQ-*`.
- Every `TC-*` is covered by ≥1 `TP-*`.
- Every `TR-*` references executed `TC-*` and includes evidence.
- Validation equivalents follow the same rules.
