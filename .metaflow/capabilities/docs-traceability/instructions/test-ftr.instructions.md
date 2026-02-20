---
description: "Rules for writing FTR documents that record test execution results and evidence for TC IDs."
applyTo: "doc/**/ftr/**/*.md"
---

# FTR authoring rules

- Start new documents from `instructions/resources/Template.FTR.md` (it encodes the expected header, run metadata, results table, and summary).

- Record results per run: date, environment, what was run, outcome (pass/fail/skip), and evidence.
- Evidence should be a durable artifact (e.g., `TestResult.xml`, logs, screenshots) with a stable path.
- Each result row should reference the relevant `TC-*` (and thus the validated `REQ-*` through TCS).

# Traceability direction

- FTR links back to TCS via `TC-*` and should not require any forward links from SRS.
