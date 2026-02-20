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

## Minimum Coverage Rules

- Every enforced `REQ-*` maps to ≥1 `TC-*`.
- Every `TC-*` maps to ≥1 `REQ-*`.
- Every `TC-*` is covered by ≥1 `TP-*`.
- Every `TR-*` references executed `TC-*` and includes evidence.
- Validation equivalents follow the same rules.
