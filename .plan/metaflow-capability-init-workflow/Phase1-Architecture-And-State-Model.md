# Phase 1 - Architecture and State Model

## Objective

Define the architecture contract for hidden built-in capability activation, synthetic source projection, and toggle persistence so implementation remains deterministic and testable.

## Deliverables

- Extension workspace-state schema for built-in MetaFlow capability state.
- Runtime synthetic source/layer projection design for refresh/apply path.
- Read-only vs toggleable behavior matrix for synthetic source in Config/Layers views.
- Naming and UX copy baseline using capability terminology.

## Design Decisions

1. Built-in capability persistence uses extension `workspaceState` (workspace-scoped).
2. Built-in capability source is not written into `.metaflow/config.jsonc`.
3. Synthetic source/layer is projected in-memory during refresh.
4. Synthetic layer is toggleable and persisted in workspace state.
5. Source-management actions for synthetic source remain non-destructive (no pull/rescan/remove via repo-source actions).

## Tasks

- [x] Define state keys and payload shape for built-in capability mode and toggle state.
- [x] Define merge point where synthetic source/layers are appended to resolved config model in memory.
- [x] Define rules for effective-file attribution (`sourceRepo`, `sourceLayer`) for synthetic entries.
- [x] Define UI context values for synthetic nodes to support toggle while blocking destructive actions.
- [x] Define migration behavior when workspace state is absent or legacy.

## Acceptance Criteria

- Architecture doc-level decisions are explicit and aligned with current command/view patterns.
- Synthetic source behavior is deterministic and does not alter persisted config.
- Toggle model is unambiguous and can be verified through tests.

## Risks

- Hidden state can become opaque without clear UI cues and status messaging.
- Incorrect synthetic attribution may confuse diagnostics and file provenance views.
