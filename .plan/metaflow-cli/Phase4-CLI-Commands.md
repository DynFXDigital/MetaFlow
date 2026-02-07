# Phase 4 – CLI Commands

**Status:** Not started

## Objective

Wire the config model, overlay engine, and rendering engine into user-facing CLI commands that cover the full reference architecture workflow.

## Commands

### `metaflow status`
- Show: metadata repo URL, commit, active profile, layer list, file counts (live-ref vs materialized).
- Requires: config loader (Phase 1).

### `metaflow preview`
- Show the effective file tree after composition + filtering + profile activation.
- Indicate realization mode (live-ref / materialize) per file.
- Optionally show diffs against current workspace state.
- Requires: engine (Phase 2).

### `metaflow apply`
- Render materialized outputs to `.github/`.
- Update managed-state tracking.
- Print summary: files written, files removed, files unchanged.
- Requires: render (Phase 3).

### `metaflow clean`
- Remove all managed files recorded in `.ai/.sync-state/managed.json`.
- Clear managed-state file.
- Print summary of removed files.

### `metaflow profile set <name>`
- Update `activeProfile` in `ai-sync.json`.
- Show new effective file counts.

### `metaflow promote`
- Detect locally modified materialized files (via drift detection).
- Present options per file: discard, save as repo override, promote to shared layer.
- Detection only in v1 — no automated git operations.

### `metaflow init`
- Generate a starter `ai-sync.json` interactively or from defaults.
- Validate metadata repo accessibility (if URL provided).

## Tasks

- [ ] Implement `metaflow status` command.
- [ ] Implement `metaflow preview` command.
- [ ] Implement `metaflow apply` command.
- [ ] Implement `metaflow clean` command.
- [ ] Implement `metaflow profile set` command.
- [ ] Implement `metaflow promote` command (detection only).
- [ ] Implement `metaflow init` command.
- [ ] Integration tests:
  - End-to-end: init → apply → status → modify file → promote detection → clean.
  - Profile switch → re-apply produces different output set.
  - Apply is idempotent.
- [ ] CLI help text and `--help` for all commands.
- [ ] Exit code conventions (0 = success, 1 = error, 2 = drift detected).

## Deliverables

- `metaflow/cli.py` — Click-based CLI with all commands.
- Integration test suite covering full workflow.
- ≥90% branch coverage on CLI module.

## Reference

- [CLI Responsibilities](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#cli-responsibilities)
- [Editing and Promotion Workflow](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#editing-and-promotion-workflow)
