# Phase 3 - Toggleable Layers and Removal

## Objective

Implement toggleable synthetic built-in layer behavior and a mirrored removal command for both built-in and materialized capability paths.

## Tasks

- [x] Project synthetic source in Config view with clear built-in labeling.
- [x] Project synthetic layer nodes in Layers view with checkbox support.
- [x] Wire checkbox toggles to workspace-state updates and immediate refresh.
- [x] Keep synthetic source protected from repo-source destructive actions.
- [x] Add `MetaFlow: Remove MetaFlow Capability` command with options:
  - disable built-in capability mode,
  - remove materialized capability files from `.github`.
- [x] Implement safe materialized-file removal using managed-target tracking.

## Behavior Rules

1. Toggling built-in layer off removes its effective files/settings impact.
2. Toggling built-in layer on restores synthetic-layer contribution.
3. Remove command does not touch unrelated `.github` assets.
4. Disabling built-in mode clears associated settings keys through existing clean/injection pathways.

## Acceptance Criteria

- Users can toggle built-in capability active/inactive in Layers view.
- Toggle state persists across reloads via workspace state.
- Removal command supports both modes and is idempotent.
- Existing config-backed repo source behavior is unchanged.

## Risks

- Synthetic toggle handling can conflict with existing layer index assumptions if not isolated.
- Removal safety depends on accurate tracking of managed materialized files.
