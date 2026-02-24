# ArtifactTypeViewReorg – Context

- **Last updated:** 2026-02-23
- **Status:** Phase 2 complete
- **Owner:** TBD

## Feature Overview

The Effective Files view currently groups content by layer path, which is a
control-plane concept that obscures the simple output question: "what instructions,
prompts, agents, and skills are active?"  Simultaneously, the Layers view — which
already owns checkbox semantics — stops at the layer level and does not expose the
artifact-type breakdown that users want to toggle.  This plan reorganises both views:
Phase 1 refactors Effective Files to group by artifact type (pure view change, no
engine work); Phase 2 extends the Layers tree one level deeper with per-artifact-type
checkboxes backed by a new `excludedTypes` config field.

## Current Focus

1. Phase 2 complete — Layers tree view now shows artifact-type children with checkboxes in tree mode.
2. Awaiting UX feedback before any follow-up work.

## Next Steps

- [x] Phase 1: Add `getArtifactType` helper and `ArtifactTypeItem` class to
      `src/src/views/filesTreeView.ts`.
- [x] Phase 1: Update `getChildren` for both `unified` and `repoTree` modes to use
      artifact-type grouping.
- [x] Phase 1: Write unit tests FTV-AT-01 through FTV-AT-07; 194 tests pass.
- [x] Phase 2: Extract shared `getArtifactType` into
      `packages/engine/src/engine/artifactType.ts`.
- [x] Phase 2: Add `LayerSource.excludedTypes` to schema and engine filter.
- [x] Phase 2: Add `ArtifactTypeLayerItem` and expand `LayerItem` children in
      `layersTreeView.ts`.
- [x] Phase 2: Implement `metaflow.toggleLayerArtifactType` command + ConfigWriter
      extension.
- [x] Phase 2: Write ATF-* and LTV-AT-* tests; update SRS/SDD/TCS.

## References

- `.plan/ArtifactTypeViewReorg/README.md` – scope, goals, phase overview, and
  relation to `GranularArtifactToggle`.
- `.plan/ArtifactTypeViewReorg/Phase1-EffectiveFilesReorg.md` – detailed Phase 1
  tasks and acceptance checklist.
- `.plan/ArtifactTypeViewReorg/Phase2-LayersArtifactDepth.md` – detailed Phase 2
  tasks and acceptance checklist.
- `.plan/GranularArtifactToggle/README.md` – related plan (file-level glob
  suppression in Effective Files; complementary, not conflicting).
- `src/src/views/filesTreeView.ts` – Phase 1 primary target.
- `src/src/views/layersTreeView.ts` – Phase 2 primary target.
- `packages/engine/src/config/configSchema.ts` – Phase 2 schema addition.

## Decision Log

- **2026-02-23** – Move toggle control surface to the Layers tree rather than adding
  checkboxes to Effective Files; Effective Files is a read-only output plane and
  checkbox semantics are ambiguous for aggregated artifact-type folders that span
  multiple layers.
- **2026-02-23** – Effective Files view adopts artifact-type grouping for both
  `unified` and `repoTree` modes with no new config setting; the change is a
  straight upgrade (strictly better UX, no regression).
- **2026-02-23** – Two phases are independently shippable.  Phase 1 ships first to
  validate grouping UX before investing in Phase 2 engine/config work.
- **2026-02-23** – `excludedTypes` on `LayerSource` (multi-repo shape only, for now);
  single-repo `layers` array excluded from Phase 2 scope but not architecturally
  blocked.
- **2026-02-23** – Shared `getArtifactType` utility extracted into engine package
  (Phase 2) so both the engine filter and the extension tree view import the same
  canonical implementation.

## Open Questions & Risks

- **Flat-mode layers:** Should flat-mode layer items also expand to show artifact
  types, or only tree mode?  Current decision: artifact-type depth is tree-mode only;
  flat mode stays as-is.  Revisit if user feedback demands it.
- **Single-repo `layers` support:** `excludedTypes` is only modelled on `LayerSource`
  (multi-repo).  Single-repo configs would need a parallel field on the layers array
  entries.  Deferred to a follow-up.
- **Effective files view name:** Once Phase 1 ships, the panel title "Effective Files"
  may be misleading (it now shows logical artifact categories, not file structure).
  Consider renaming to "Active Artifacts" — low priority, track separately.
- **`other` bucket in Phase 1:** Settings files and non-standard paths land in
  `other/`.  Confirm whether hiding `other/` when empty (current plan) is desirable
  or whether it should always be present for discoverability.
