---
description: "Traceability requirements for automated end-to-end and integration tests."
applyTo: "**/e2e/**,**/*.spec.*,**/*.e2e.*"
---

# Automated E2E test traceability rules

- Each automated test must reference a `TC-*` (verification) or `VTC-*` (validation).
- Trace tags should be in the test name or a nearby comment (e.g., `Trace: TC-0001`).
- Evidence artifacts (logs/screenshots/video) must be referenced in the related FTR/VFTR.
