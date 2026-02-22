---
mode: 'agent'
description: 'Audit traceability coverage across doc artifacts and report concrete REQ/TC/TP/TR (and validation) gaps.'
---

# Audit Traceability Coverage

Analyze traceability across documentation artifacts under `doc/` and produce an actionable gap report.

## Scope

- Verification docs: `doc/srs`, `doc/sdd`, `doc/tcs`, `doc/ftd`, `doc/ftr`
- Validation docs: `doc/validation/srs`, `doc/validation/tcs`, `doc/validation/ftd`, `doc/validation/ftr`

## Checks

1. Every enforced `REQ-*` maps to at least one `TC-*`.
2. Every `TC-*` maps to at least one `TP-*`.
3. `TR-*` entries reference executed `TC-*` and include evidence.
4. Validation chain coverage for `VREQ-* -> VTC-* -> VTP-* -> VTR-*`.
5. Detect duplicate IDs and broken or missing references.

## Output Format

Produce a concise report with:

- **Coverage Summary**
- **Gaps by ID Type** (`REQ`, `TC`, `TP`, `TR`, `VREQ`, `VTC`, `VTP`, `VTR`)
- **Broken References**
- **Suggested Fix Order** (highest-risk first)

Include exact file paths for each finding.
