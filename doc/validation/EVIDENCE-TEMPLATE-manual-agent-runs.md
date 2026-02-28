# Evidence Template — Manual Validation (Agent + Operator)

Use this template to capture evidence for agent-driven manual validation runs.

Authoritative validation artifacts:
- `doc/validation/srs/VSRS-metaflow-ext.md`
- `doc/validation/tcs/VTC-metaflow-ext.md`
- `doc/validation/ftd/VTP-metaflow-ext.md`
- `doc/validation/ftr/VTR-metaflow-ext.md`

---

## Run Metadata

- Run ID (VTR-YYYYMMDD-nn): __________
- Date/time (local): __________
- Operator (human): __________
- Agent (model/profile): __________
- Repo + branch: __________
- Commit SHA: __________
- VS Code version (stable/insiders): __________
- Extension build/VSIX: __________
- OS: __________
- Workspace path:
  - Fixture repo path (DFX clone): __________
  - Config path used: `.metaflow/config.jsonc`

## Evidence Storage

- Evidence root (repo-relative or external): __________
- Suggested convention (optional): `doc/validation/evidence/<Run ID>/...`

---

## Checks & Evidence

Fill one row per executed check (VTC/VTP or manual checklist section).

| Check ID | Expected | Actual | Result (P/F/S) | Evidence path(s) | Issue link |
|---|---|---|---|---|---|
| VTC-____ / VTP-____ / Manual-Section-__ |  |  |  |  |  |
|  |  |  |  |  |  |

Result codes:
- **P** = Pass
- **F** = Fail
- **S** = Skipped (must include reason in Actual/Issue)

## Notes (optional)

- __________
