---
description: "Rules for writing SDD documents that map requirements (REQ IDs) to design elements and code references."
applyTo: "doc/**/sdd/**/*.md"
---

# SDD authoring rules

- Start new documents from `.github/instructions/resources/Template.SDD.md` (it encodes the expected header, optional `DES-*` table, and change log).

- SDD must reference the related SRS doc ID(s) in the header.
- For every enforced `REQ-*` (anything not marked `Future` in the SRS), provide a concrete design mapping.
- Prefer a stable `DES-####` table for non-trivial elements; each `DES-*` row must list the `REQ-*` it realizes.
- Add code references for key elements when practical (type name and/or file+symbol references).

- If you include Mermaid diagrams, add a short “definitions/glossary” section immediately under each diagram that defines each node/actor and clarifies key edges.
- Under the definitions, add a brief narrative describing how data flows through the diagram (inputs/outputs, ordering, and degraded/error behavior when relevant).

# Traceability direction

- SDD links back to SRS via `REQ-*` references.
- Do not expect SRS to link forward to `DES-*` or code.
