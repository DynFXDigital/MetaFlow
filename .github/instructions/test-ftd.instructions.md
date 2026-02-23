---
description: "Rules for writing FTD documents that turn TC IDs into executable procedures (manual and/or automated)."
applyTo: "doc/**/ftd/**/*.md"
---

# FTD authoring rules

- Start new documents from `.github/instructions/resources/Template.FTD.md` (it encodes the expected header, TP→TC matrix, and gap analysis tables).
- For functional gap closure plans, prefer `.github/instructions/resources/Template.FunctionalTestPlan.md`.
- `FTD` is the authoritative source for executable functional procedures. Plans may propose work, but runnable `TP-*` definitions must live in `FTD`.

- FTD must reference the related TCS doc ID(s) and cover each `TC-*` with runnable steps.
- Include prerequisites and environment notes that make the procedure executable.
- For automated coverage, include the concrete entrypoint (task/command/fixture/test name) and any required flags.
- Include risk-based prioritization for uncovered or weakly-covered `TC-*` cases (`Critical`, `High`, `Medium`, `Low`).
- Include explicit closure ownership and target date for each open gap.
- Include entry and exit criteria for each test phase (for example: smoke, regression, release-candidate).
- Do not treat FTP/gap-plan procedures as complete until corresponding `TP-*` coverage is reflected in `FTD`.

# Traceability format (preferred)

- Prefer stable procedure IDs `TP-*` and a TP→TC traceability matrix.
- Every `TC-*` should be covered by at least one `TP-*` (no empty columns in the matrix).
- Add a dedicated "Open Gaps" section that lists uncovered `TC-*`, blocked `TP-*`, and rationale.

# Traceability direction

- FTD links back to TCS via `TC-*` and indirectly to SRS via the `REQ-*` mapping in TCS.
