# MetaFlow Capability Initialization Workflow Plan

## Overview

This plan refactors `MetaFlow: Initialize MetaFlow AI Metadata` into a capability-focused workflow with two explicit setup modes: (1) materialize MetaFlow capability files into workspace `.github/`, and (2) enable a built-in MetaFlow capability in settings-only mode without writing capability source entries into `.metaflow/config.jsonc`. The built-in mode is persisted in extension workspace state and shown as a synthetic, toggleable source/layer in the MetaFlow views.

## Problem / Goal

The current command only scaffolds files into `.github/` and does not support a non-materializing capability path. The goal is to provide a clearer initialization model that supports both file-based and settings-only operation, preserves user control via layer toggles, avoids leaking built-in capability wiring into config files, and adds a mirrored removal workflow.

## Scope

### In Scope

- Redesign `metaflow.initMetaFlowAiMetadata` as a two-mode capability initialization flow.
- Replace starter wording with capability wording in command UX/docs.
- Materialize mode: extension-owned overwrite behavior and managed removal support.
- Built-in mode: hidden persistence in extension `workspaceState` (not config file).
- Runtime synthetic source/layer injection for built-in mode.
- Synthetic built-in layer/source visible in UI and toggleable on/off.
- Mirrored removal command for both built-in mode and materialized files.
- Unit/integration test updates for command flow, toggling, and cleanup.
- Documentation and changelog updates.

### Out of Scope

- CLI behavior changes for this workflow.
- Introducing network clone/bootstrap behavior into this command.
- Changes to base engine schema for built-in capability persistence.
- New external repositories or metadata packaging format changes.

## Constraints

- Do not persist built-in capability source references in `.metaflow/config.jsonc`.
- Preserve existing MetaFlow overlay determinism and layer precedence behavior.
- Keep built-in capability state workspace-scoped and reload-safe.
- Ensure layer toggle behavior remains consistent with existing layer checkbox conventions.
- Keep settings injection and cleanup idempotent.
- Follow strict TypeScript and existing test conventions.

## Dependencies

- Command flow in `src/src/commands/commandHandlers.ts`.
- Starter materialization helper in `src/src/commands/starterMetadata.ts`.
- Tree view rendering/checkbox behavior in:
  - `src/src/views/configTreeView.ts`
  - `src/src/views/layersTreeView.ts`
- Extension lifecycle/context access in `src/src/extension.ts`.
- Existing apply/clean/settings injection behavior in command handlers + engine APIs.

## Owners

- Primary: TBD
- Reviewers: Extension maintainer, Engine maintainer, QA owner

## Phase Plan

| Phase | Document | Outcome |
|---|---|---|
| 1 | `Phase1-Architecture-And-State-Model.md` | Finalize hidden-state model, synthetic source contract, and command naming |
| 2 | `Phase2-Initialize-Command-Flow.md` | Implement initialization flow with materialize and built-in capability modes |
| 3 | `Phase3-Toggleable-Layers-And-Removal.md` | Deliver toggleable synthetic layer behavior and mirrored removal workflow |
| 4 | `Phase4-Validation-And-Docs.md` | Complete test coverage, docs/changelog updates, and release readiness checks |

## Success Criteria

- Users can choose materialize or built-in settings-only capability mode from one command.
- Built-in mode works without modifying `.metaflow/config.jsonc` capability source entries.
- Built-in capability appears in views and can be toggled active/inactive.
- Materialized capability files can be safely removed without touching unrelated `.github` files.
- Tests cover init, toggling, apply/settings impact, and removal paths.
- User-facing docs consistently use "MetaFlow capability" terminology.
