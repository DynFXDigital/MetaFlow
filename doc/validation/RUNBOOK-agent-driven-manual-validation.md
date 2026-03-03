# Runbook — Agent-Driven Manual Validation (MetaFlow)

This runbook defines a lightweight protocol for executing manual validation with an **operator** (human running VS Code) and an **agent** (recording outcomes and producing traceable evidence).

Authoritative validation docs:
- Requirements: `doc/validation/srs/VSRS-metaflow-ext.md`
- Test cases: `doc/validation/tcs/VTC-metaflow-ext.md`
- Procedures: `doc/validation/ftd/VTP-metaflow-ext.md`
- Results log: `doc/validation/ftr/VTR-metaflow-ext.md`
- Manual UX checklist: `doc/validation/ftd/MANUAL-VALIDATION-CHECKLIST-metaflow-ext.md`

Reusable evidence template:
- `doc/validation/EVIDENCE-TEMPLATE-manual-agent-runs.md`

---

## Roles

- **Operator**: Executes steps in VS Code, captures screenshots/output snippets, and provides paths/attachments.
- **Agent**: Directs the run, assigns check IDs, records results consistently, and updates validation evidence/logs.

## Protocol

1. **Select scope**
   - Default scope is `VTP-metaflow-ext` (VTP-0001..VTP-0006).
   - Use the manual checklist for human-judgment UX items and environment-sensitive behavior.

2. **Prepare the environment (operator)**
   - Use a workspace containing `.metaflow/config.jsonc` pointing to the DFX-AI-Metadata fixture.
   - Ensure the extension build/VSIX is known and the commit SHA is recorded.

3. **Create a run record (agent)**
   - Assign a run ID using `VTR-YYYYMMDD-nn`.
   - Start an evidence sheet using `doc/validation/EVIDENCE-TEMPLATE-manual-agent-runs.md`.

4. **Execute checks (operator + agent)**
   - Operator performs each VTP/manual checklist item.
   - Agent confirms the intended expected result before moving on (avoid silent scope drift).
   - Operator captures evidence for each check (screenshots, output snippets, file diffs).

5. **Record outcomes (agent)**
   - For each check row: fill Expected, Actual, Result, Evidence path(s), Issue link.
   - Failures must include repro notes and a tracked issue.

6. **Update the authoritative results log (agent)**
   - Update `doc/validation/ftr/VTR-metaflow-ext.md` with the run ID, executor, build/commit, and per-VTC results.
   - Link evidence paths/locations in the VTR rows.

## Evidence expectations

- Every **Fail** should have: a clear expected vs actual, a minimal repro, and an issue link.
- Every **Pass** should still have at least one durable artifact (e.g., screenshot, output excerpt, settings excerpt).
- Keep evidence paths stable: prefer repo-relative paths when feasible.

## Additional checks for MetaFlow AI metadata

When validating MetaFlow AI metadata scaffolding, capture at least one run covering the item below:

1. MetaFlow AI metadata scaffold command
   - Run `MetaFlow: Initialize MetaFlow AI Metadata`.
   - Verify starter templates are created under `.github/instructions`, `.github/prompts`, `.github/skills`, and `.github/agents`.
   - Re-run the command and select `Keep Existing` when prompted.
   - Evidence: command output + resulting starter files + confirmation local edits remain unchanged.

