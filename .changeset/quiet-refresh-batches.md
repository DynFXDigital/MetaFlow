---
'metaflow-ai': patch
---

Coordinate background refreshes with explicit refresh requests so queued watcher or settings work cannot perform config maintenance during a maintenance-skipping refresh. Preserve later explicit refresh policy and signal GUI completion only after the refresh batch settles.
