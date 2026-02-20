---
mode: 'agent'
description: 'Author or update traceable SDLC docs (SRS/SDD/TCS/FTD/FTR/UC and validation) with correct ID mapping and evidence structure.'
---

# Author Traceability Docs

Create or update documentation artifacts in `doc/` (and `doc/validation/` when requested) while preserving strict traceability chains.

## Inputs

- Scope to update (for example: `doc/srs/SRS-metaflow-ext.md`, `doc/tcs/TCS-metaflow-ext.md`)
- Change intent (new requirement, revised requirement, test updates, evidence updates)
- IDs impacted (`REQ-*`, `DES-*`, `TC-*`, `TP-*`, `TR-*`, `VREQ-*`, `VTC-*`, `VTP-*`, `VTR-*`)

## Required Behavior

1. Enforce mapping chain:
   - verification: `REQ -> DES -> TC -> TP -> TR`
   - validation: `VREQ -> VTC -> VTP -> VTR`
2. Avoid forward links from SRS/VSRS into design/tests unless repo rules explicitly allow it.
3. Keep IDs stable unless explicitly asked to rename.
4. When adding tests, ensure at least one procedure/evidence path is defined.
5. Keep edits minimal and localized to requested scope.

## Output

- Updated docs with valid IDs and links.
- Brief summary listing:
  - files changed
  - IDs added/updated
  - remaining traceability gaps (if any)
