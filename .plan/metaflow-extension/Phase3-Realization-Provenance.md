# Phase 3 — Realization + Provenance

## Objectives

- Materialize classified files into `.github/` when required by Copilot.
- Inject machine-readable provenance headers into all materialized files.
- Maintain managed state for safe re-render and drift detection.
- Deliver unit tests for all materialization logic.
- Update SDD and TCS with materializer design elements and test cases.

## Scope

**In scope**
- `src/engine/materializer.ts` — write/delete materialized files, apply `_shared_` prefix
- `src/engine/provenanceHeader.ts` — generate/parse provenance comment blocks
- `src/engine/managedState.ts` — load/save managed-state JSON, compute content hashes
- `src/engine/driftDetector.ts` — compare file content against managed-state hashes
- `src/engine/settingsInjector.ts` — inject/remove VS Code settings for settings-classified directories and hook file paths
- `src/test/unit/materializer.test.ts`
- `src/test/unit/provenanceHeader.test.ts`
- `src/test/unit/managedState.test.ts`
- `src/test/unit/driftDetector.test.ts`
- `src/test/unit/settingsInjector.test.ts`
- `test-workspace/` — extended fixture with expected materialization outputs

**Out of scope**
- Extension UI integration (Phase 4)
- Promotion automation (detection only)

## Tasks

### T3.1 — Provenance Header

1. Implement writer: generate HTML comment block with `synced`, `source-repo`, `source-commit`, `scope`, `layers`, `profile`, `content-hash`.
2. Implement parser: extract provenance from existing file content.
3. Round-trip guarantee: write → parse → compare yields identity.

### T3.2 — Managed State

1. Define managed-state JSON schema:
   ```json
   {
     "version": 1,
     "lastApply": "ISO-8601",
     "files": {
       "<relative-path>": {
         "contentHash": "sha256:...",
         "sourceLayer": "...",
         "sourceCommit": "..."
       }
     }
   }
   ```
2. Implement load/save at `.ai/.sync-state/overlay_managed.json`.
3. Implement content hash computation (SHA-256 of file content after provenance header removal).

### T3.3 — Drift Detector

1. Compare current file content hash against managed-state hash.
2. Classification:
   - **In-sync** — hashes match.
   - **Drifted** — hashes differ (local edit detected).
   - **Missing** — file absent but tracked in managed state.
   - **Untracked** — file present but not in managed state.

### T3.4 — Materializer

1. **Apply workflow:**
   a. Resolve overlay (Phase 2 engine).
   b. For each materialized file:
      - Check drift detector; if drifted, **skip and warn**.
      - If in-sync or missing, write file with provenance header and `_shared_` prefix.
   c. Update managed state.
2. **Clean workflow:**
   a. Read managed state.
   b. Delete every tracked file that is still in-sync (matches hash).
   c. Warn about drifted files.
   d. Clear managed state.
3. **Preview workflow:**
   a. Resolve overlay.
   b. Return effective file list + pending changes (add/update/skip/remove) without writing.

### T3.5 — Settings Injector

1. For settings-backed content, compute VS Code settings paths for:
   - Instructions directory
   - Prompts directory
   - Skills directory (Insiders)
   - Agents directory (Insiders)
   - Hook file paths (Insiders)
2. Inject/remove settings for all configured paths.
3. Implement removal of injected settings during clean.

### T3.6 — Unit Tests

1. **Provenance header tests:**
   - Write and parse round-trip.
   - Parse file without provenance (returns null).
   - Provenance with all fields.
   - Provenance with optional fields missing.
2. **Managed state tests:**
   - Save and load round-trip.
   - Empty state.
   - State with multiple files.
   - Corrupted state file (graceful fallback).
3. **Drift detector tests:**
   - In-sync file.
   - Drifted file.
   - Missing file.
   - Untracked file.
4. **Materializer tests:**
   - Apply with no conflicts.
   - Apply with drifted file (skip + warn).
   - Clean removes only in-sync files.
   - Clean warns about drifted files.
   - Preview returns correct pending changes.
   - Apply is deterministic (run twice, same result).
   - Apply with `_shared_` prefix naming.
5. **Settings injector tests:**
   - Inject settings for instructions/prompts/skills/agents paths.
   - Inject settings for hook file paths.
   - Remove settings on clean.
   - No-op when settings already correct.

### T3.7 — Update Traceability Docs

1. Add DES-* entries to SDD for materializer, provenance, managed state, drift detector, settings injector.
2. Add TC-* entries to TCS for each test category.
3. Update traceability matrix.

## Deliverables

- Deterministic materialization with provenance headers
- Safe cleanup with drift protection
- Managed-state tracking
- Settings injection for settings-backed artifacts
- Comprehensive unit tests
- Updated SDD and TCS

## Exit Criteria

- All materializer unit tests pass.
- Apply/clean are deterministic (verified by repeat execution tests).
- Drifted files are never overwritten.
- ≥80% line coverage for Phase 3 modules.
- SDD has DES-* for all Phase 3 components.
- TCS has TC-* for all Phase 3 test cases.

