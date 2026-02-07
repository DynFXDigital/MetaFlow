---
description: "Rules for trace-model-first workflows when trace/ is present."
applyTo: "trace/**"
---

# Trace Model rules

- The trace model is authoritative when `trace/**` exists.
- Docs may reference trace IDs but must not introduce new IDs ad-hoc.
- Changes to IDs or relationships must be made in the model, then rendered to docs.
