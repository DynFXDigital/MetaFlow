---
'metaflow-ai': patch
'@metaflow/engine': patch
'@metaflow/cli': patch
---

Improve refresh responsiveness by avoiding redundant Git/network work, coalescing refresh bursts, skipping unchanged synchronization writes, reusing overlay resolution work, and trimming unused extension assets.
