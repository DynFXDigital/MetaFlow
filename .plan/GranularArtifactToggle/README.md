# GranularArtifactToggle – Plan

## Overview

This plan implements per-artifact and per-directory on/off toggles in the MetaFlow
Effective Files view, allowing users to selectively suppress individual files,
artifact-type directories (`instructions/`, `prompts/`, `agents/`, `skills/`), or
specific skill subdirectories from the overlay output — without disabling an entire
layer.

Toggled state is persisted to `config.jsonc` in a new `filters.disabled` array that
is clearly separate from user-authored `filters.exclude` entries.

See the feasibility analysis in the conversation that spawned this plan (2026-02-17)
and the existing overlay architecture in
[doc/sdd/SDD-metaflow-ext.md](../../doc/sdd/SDD-metaflow-ext.md).

## Goals

- Introduce `filters.disabled` to `FilterConfig` (schema-additive, non-breaking).
- Extend `applyFilters` in the engine to honour the new field.
- Implement a JSONC-safe `ConfigWriter` module for write-back.
- Surface checkbox toggles on `FolderItem` and `FileItem` nodes in Effective Files.
- Provide a reset command to clear all UI-managed suppressions.
- Maintain full test coverage: engine unit, config-writer unit, UI integration, and
  manual validation checklist entries.

## Scope

### In-scope

- `FilterConfig.disabled` schema field and engine enforcement.
- `ConfigWriter` module (JSONC-safe, watcher re-entrancy guard).
- Effective Files tree: checkbox state derivation + `onDidChangeCheckboxState` → command.
- Toggle granularities: file, artifact-type folder, skill subdirectory.
- `metaflow.resetDisabledArtifacts` command.
- SRS / SDD / TCS / FTD doc updates.

### Out-of-scope

- Changes to profile-based `enable`/`disable` patterns.
- `filters.exclude` (hand-authored); the new `disabled` array is strictly UI-managed.
- Per-layer granularity (separate concern; layers already have `enabled`).
- Any CLI surface changes.

## Constraints

- Engine modules must remain free of `vscode` imports.
- `jsonc-parser` (already a dependency) used for all JSONC mutations — no raw string
  manipulation.
- `strict: true` TypeScript throughout.
- C# 7.3 note is irrelevant here (pure TS project).
- Backward-compatible: configs without `filters.disabled` behave identically to today.

## Success Criteria

1. Toggling a folder or file in the Effective Files view writes the correct glob to
   `filters.disabled` and the item disappears from the rendered tree.
2. Un-toggling removes the glob and the item reappears.
3. `metaflow.resetDisabledArtifacts` clears the array and all suppressed items
   reappear.
4. All existing unit and integration tests continue to pass.
5. New unit tests cover: engine filter merge, config writer add/remove, round-trip.
6. Manual validation checklist updated with toggle scenarios.

## Phase Overview

| Phase | Name | Key deliverable |
|---|---|---|
| 1 | Schema & Engine | `FilterConfig.disabled` + updated `applyFilters` + unit tests |
| 2 | Config Writer | `configWriter.ts` module with JSONC-safe add/remove + unit tests |
| 3 | UI – Checkboxes | `FilesTreeView` checkbox state, command handler, package.json wiring |
| 4 | Polish & Reset | Reset command, tooltip indicator, SRS/SDD/TCS/FTD/FTR doc updates |
