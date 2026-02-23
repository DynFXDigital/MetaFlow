---
description: "Rules for writing FTR documents that record test execution results and evidence for TC IDs."
applyTo: "doc/**/ftr/**/*.md"
---

# FTR authoring rules

- Start new documents from `.github/instructions/resources/Template.FTR.md` (it encodes the expected header, run metadata, results table, and summary).
- For functional gap closure reporting, prefer `.github/instructions/resources/Template.FunctionalTestResults.md`.
- `FTR` is the authoritative source for execution truth (what ran, evidence, and outcomes). Plans must not be used as pass/fail status records.

- Record results per run: date, environment, what was run, outcome (pass/fail/skip), and evidence.
- Evidence should be a durable artifact (e.g., `TestResult.xml`, logs, screenshots) with a stable path.
- Each result row should reference the relevant `TC-*` (and thus the validated `REQ-*` through TCS).
- Each `Fail` or `Skip` row must include a concrete reason and a linked issue/defect ID.
- Include a per-run gap burn-down section: newly closed gaps, still-open gaps, and newly discovered gaps.
- Include a closure recommendation (`Ready`, `Conditionally Ready`, `Not Ready`) with rationale tied to unresolved high-risk gaps.
- A gap is not considered closed until `FTR` records a passing result for the related `TC-*` with evidence.

# Traceability direction

- FTR links back to TCS via `TC-*` and should not require any forward links from SRS.
