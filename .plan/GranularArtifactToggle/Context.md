# GranularArtifactToggle – Context

- **Last updated:** 2026-02-18
- **Status:** Planning complete – ready to start Phase 1
- **Owner:** TBD

## Feature Overview

Users want to selectively suppress individual files, artifact-type directories
(`instructions/`, `prompts/`, `agents/`, `skills/`), or specific skill
subdirectories from the MetaFlow overlay output without disabling an entire layer.
The solution introduces a `filters.disabled` array in `config.jsonc` (kept separate
from hand-authored `filters.exclude`) and surfaces it as checkboxes in the Effective
Files tree view.  A reset command clears all UI-managed suppressions.

## Current Focus

1. Plan artifacts created; awaiting kickoff of Phase 1 (schema + engine changes).

## Next Steps

- [ ] Phase 1: Add `FilterConfig.disabled` to `configSchema.ts` and update
      `applyFilters` in `filterEngine.ts`.
- [ ] Phase 1: Write unit tests FE-D-01 through FE-D-07 in engine test suite.
- [ ] Phase 1: Verify `npm -w @metaflow/engine test` passes clean.
- [ ] Phase 2: Implement `configWriter.ts` with `addDisabledGlob`, `removeDisabledGlob`,
      `clearDisabledGlobs` + watcher re-entrancy guard.
- [ ] Phase 2: Write unit tests CW-01 through CW-11.
- [ ] Phase 3: Add checkbox state to `FolderItem` / `FileItem` in `filesTreeView.ts`.
- [ ] Phase 3: Implement `toggleArtifactDisabled` command + glob derivation util.
- [ ] Phase 3: Implement `resetDisabledArtifacts` command + status bar badge (stretch).
- [ ] Phase 4: Add integration tests IT-GAT-01 through IT-GAT-07.
- [ ] Phase 4: Update SRS, SDD, TCS, FTD, FTR, and validation checklist.

## References

- `.plan/GranularArtifactToggle/README.md` – scope, goals, and phase overview.
- `.plan/GranularArtifactToggle/Phase1-Schema-Engine.md` – engine changes + FE-D-* tests.
- `.plan/GranularArtifactToggle/Phase2-ConfigWriter.md` – JSONC writer + CW-* tests.
- `.plan/GranularArtifactToggle/Phase3-UI-Checkboxes.md` – tree view + commands.
- `.plan/GranularArtifactToggle/Phase4-Testing-Docs.md` – integration tests + doc updates.
- `packages/engine/src/config/configSchema.ts` – current `FilterConfig` interface.
- `packages/engine/src/engine/filterEngine.ts` – `applyFilters` to be extended.
- `src/src/views/filesTreeView.ts` – tree view to receive checkbox support.
- `src/src/commands/commandHandlers.ts` – new commands land here.
- `doc/srs/SRS-metaflow-ext.md` – REQ IDs to add: REQ-FILTER-DISABLED-01 through -04.

## Decision Log

- **2026-02-17** – Use `filters.disabled` (new field) rather than polluting
  `filters.exclude`; preserves semantic intent separation between user-authored and
  UI-managed exclusions.
- **2026-02-17** – Resolve writes in the extension layer (has VS Code fs access)
  rather than the pure engine package; engine stays free of `vscode` imports.
- **2026-02-17** – Profiles remain the named-preset mechanism; this feature is for
  ephemeral/ad-hoc suppression only.
- **2026-02-18** – `onBeforeWrite`/`onAfterWrite` hooks on writer functions (rather
  than a global flag) to isolate re-entrancy guard logic in the command handler.

## Open Questions & Risks

- **Partial folder state (indeterminate checkboxes):** VS Code `TreeItemCheckboxState`
  may not expose a "mixed" state; defer to Phase 3 investigation.
- **Cross-layer same-path files:** When the same relative path appears in multiple
  layers, a glob suppresses *all* occurrences.  Is per-layer granularity ever needed
  here?  Deferred — out of scope for this plan.
- **Config writer location:** Extension-side is simpler but means CLI cannot leverage
  the writer.  Evaluate moving to `packages/engine` in a follow-up if CLI needs it.
- **Test-workspace fixture:** `disabled-artifacts/` fixture needs to match the format
  of the production config loader; confirm `ai-sync.json` vs `.metaflow/config.jsonc`
  naming before creating the fixture.
