---
description: "Rules for writing SRS requirements documents (REQ IDs) without forward links to design/tests."
applyTo: "doc/**/srs/**/*.md"
---

# SRS authoring rules

- Start new documents from `instructions/resources/Template.SRS.md` (it encodes the expected header, tables, and traceability policy).

- Write requirements as verb-first behavior statements; avoid implementation details.
- One behavior per `REQ-*`; keep wording testable and unambiguous.

- SRS is requirements-only. Do not add forward links to design docs, test docs, `DES-*`, `TC-*`, or code references.
- Use stable `REQ-####` IDs. Never reuse IDs; reserve ranges per subsystem/feature/capability when helpful.
- Each requirement must include testable acceptance criteria.
- Use `Enforcement` to signal delivery timing: `Now`, `Phase-<n>`, or `Future`.
- When using a requirements table, place `Priority` immediately before `Status`.

# Traceability direction

- Downstream docs carry traceability:
  - SDD maps `REQ-*` -> design elements (`DES-*`) and code references.
  - TCS/FTD map `REQ-*` -> `TC-*` and executable procedures.
  - FTR records execution results and evidence for `TC-*`.
