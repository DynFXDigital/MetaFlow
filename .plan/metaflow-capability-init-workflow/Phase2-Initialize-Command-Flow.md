# Phase 2 - Initialize Command Flow

## Objective

Refactor the initialize command into a two-path capability workflow and implement built-in mode activation without config mutation.

## UX Flow (MVP)

1. Run `MetaFlow: Initialize MetaFlow Capability`.
2. QuickPick option:
   - `Materialize MetaFlow capability files into .github`
   - `Enable built-in MetaFlow capability (settings-only)`
3. Materialize path:
   - Execute overwrite-first materialization of managed capability files.
   - Show clear message that files are extension-owned outputs.
4. Built-in path:
   - Persist enablement and toggle defaults in `workspaceState`.
   - Trigger refresh/apply path so settings-backed effects are visible.

## Tasks

- [x] Rename command surface/title and update in `src/package.json`.
- [x] Update command handler branch logic in `src/src/commands/commandHandlers.ts`.
- [x] Keep existing scaffolding helper but enforce overwrite-first mode for materialize path.
- [x] Add built-in mode enablement writes to extension workspace state.
- [x] Ensure cancel-safe behavior at each prompt (no side effects on cancel).
- [x] Add user feedback messages with capability terminology.

## Acceptance Criteria

- Initialize command offers both modes and completes successfully for each.
- Built-in mode activation works without editing `.metaflow/config.jsonc`.
- Materialize mode overwrites managed capability files deterministically.
- Canceling prompts leaves workspace and state unchanged.

## Risks

- Overwrite-first behavior can surprise users without strong confirmation text.
- Built-in mode may appear inactive if refresh/apply timing or state reads are incorrect.
