# Phase 3 – Realization + Provenance

**Status:** Not started

## Objective

Implement hybrid realization (live-ref vs materialization), provenance header injection, and managed-state tracking. After this phase the engine can produce the correct output files in `.github/` and track what it owns.

## Tasks

- [ ] Implement live-reference output:
  - For instructions/prompts: record the resolved source path (no file copy)
  - Output path format: `.ai/ai-metadata/<resolved-path>`
- [ ] Implement materialized output:
  - For skills/agents: copy content to `.github/skills/_shared_<name>.md` (or `agents/`)
  - Apply `_shared_` prefix per rendering rules
  - Delete all previously managed files before re-render (clean-before-write)
- [ ] Implement provenance injection:
  - Inject HTML comment header into each materialized file:
    ```
    <!--
    synced: true
    source-repo: <url>
    source-commit: <commit>
    scope: <layers joined>
    layers: [<layer list>]
    profile: <active profile>
    -->
    ```
  - Provenance must be machine-parseable for drift detection
- [ ] Implement managed-state tracking:
  - Record managed file paths + content hashes in `.ai/.sync-state/managed.json`
  - On re-render: compare hashes to detect local modifications
  - State file is deterministic (sorted keys, stable serialization)
- [ ] Implement drift detection:
  - Compare current file content hash against managed-state record
  - Report: unmodified, locally-modified, missing, new-unmanaged
- [ ] Write unit tests:
  - Live-ref produces no file copies
  - Materialization writes correct paths with prefix
  - Provenance header is present and parseable
  - Managed state creates/updates correctly
  - Drift detection: clean, modified, missing, and new files
  - Re-render is idempotent (same input → same output)
  - Clean-before-write removes only managed files

## Deliverables

- `metaflow/render.py` — realization, provenance, managed-state.
- `.ai/.sync-state/managed.json` schema and writer.
- ≥90% branch coverage on render module.

## Reference

- [Hybrid Realization Strategy](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#hybrid-realization-strategy)
- [Provenance and Traceability](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#provenance-and-traceability)
- [Rendering Rules](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#rendering-rules)
