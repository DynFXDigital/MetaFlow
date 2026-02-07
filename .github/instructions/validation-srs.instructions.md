---
description: "Rules for writing validation requirements documents (VREQ IDs) without forward links."
applyTo: "doc/validation/**/srs/**/*.md"
---

# Validation SRS authoring rules

- Use stable `VREQ-####` IDs; never reuse IDs.
- Validation requirements describe user intent and acceptance outcomes.
- Do not add forward links to validation tests (`VTC-*`) or procedures (`VTP-*`).
- Each requirement must include testable acceptance criteria.
