---
description: "Rules for writing FTD documents that turn TC IDs into executable procedures (manual and/or automated)."
applyTo: "doc/**/ftd/**/*.md"
---

# FTD authoring rules

- Start new documents from `instructions/resources/Template.FTD.md` (it encodes the expected header, TP→TC matrix, and gap analysis tables).

- FTD must reference the related TCS doc ID(s) and cover each `TC-*` with runnable steps.
- Include prerequisites and environment notes that make the procedure executable.
- For automated coverage, include the concrete entrypoint (task/command/fixture/test name) and any required flags.

# Traceability format (preferred)

- Prefer stable procedure IDs `TP-*` and a TP→TC traceability matrix.
- Every `TC-*` should be covered by at least one `TP-*` (no empty columns in the matrix).

# Traceability direction

- FTD links back to TCS via `TC-*` and indirectly to SRS via the `REQ-*` mapping in TCS.
