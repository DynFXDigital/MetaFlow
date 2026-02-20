---
description: "Rules for writing TCS documents defining TC IDs and mapping them back to requirements (REQ IDs)."
applyTo: "doc/**/tcs/**/*.md"
---

# TCS authoring rules

- Start new documents from `.github/instructions/resources/Template.TCS.md` (it encodes the expected header, TC table shape, TC→REQ matrix, and gap analysis).

- Use stable `TC-####` IDs. Never reuse IDs; reserve ranges per subsystem/feature/capability when helpful.
- Every `TC-*` must validate at least one `REQ-*`.
- For enforced `REQ-*`, ensure there is at least one validating `TC-*`.
- Keep steps brief here; detailed execution instructions belong in FTD.

# Traceability format (preferred)

- Prefer a separate traceability matrix section mapping `TC-*` rows to `REQ-*` columns (mark with `X`).
- Keep the narrative details (preconditions/steps/expected, location/implementation) in the Test Cases table.

# Traceability direction

- TCS links back to SRS via `Validates REQ-ID(s)`.
- Do not add `TC-*` references into SRS.
