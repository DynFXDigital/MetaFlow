# ArtifactTypeViewReorg – Plan

## Overview

The MetaFlow tree views currently conflate two distinct concerns in how they present
data.  The Effective Files view organises content by **layer path** (a control-plane
concept), making it hard to answer the simple question "what instructions or prompts
are active?"  Meanwhile, the Layers view — which already owns checkboxes and
enable/disable semantics — stops at the layer level and does not expose the
artifact-type breakdown that users actually want to toggle.

This plan delivers two coordinated improvements:

**Phase 1 (pure view, no engine changes):** Reorganise the Effective Files view to
group by artifact type (`instructions/`, `prompts/`, `agents/`, `skills/`) rather
than by layer path.  Both `unified` and `repoTree` modes get the new grouping.
Result: a clean, output-oriented panel that answers "what is active?" regardless of
which layer or repo it came from.

**Phase 2 (config + engine + tree view):** Extend the Layers tree view one level deeper
— Repo → Layer → artifact-type children with checkboxes.  Adds a new
`layerSources[i].excludedTypes` config concept so toggling an artifact-type folder
within a layer persists to `config.jsonc` and is honoured by the engine at
materialisation time.

The two phases are independently shippable.  Phase 1 ships first to validate the
grouping UX; Phase 2 adds granular control on top.

## Goals

- Effective Files view groups top-level by artifact type; layer/repo attribution
  moves to item descriptions and tooltips.
- Layers tree surfaces `instructions/`, `prompts/`, `agents/`, `skills/` as
  collapsible, checkable children of each layer item.
- Checking/unchecking an artifact-type node writes `excludedTypes` to the layer
  source entry in `config.jsonc` and updates the overlay output in real time.
- No changes to the existing layer-level `enabled` checkbox semantics.
- No dependency on or conflict with the `GranularArtifactToggle` plan; the two
  mechanisms target different granularities and different config fields.

## Scope

### In-scope

**Phase 1**
- `FilesTreeViewProvider` (`filesTreeView.ts`): new `artifactType` grouping mode;
  both `unified` (all repos merged, top-level = artifact type) and `repoTree`
  (Repo → artifact type → files) layouts.
- Strip `.github/` prefix and use the first path segment as the artifact-type bucket.
- Files whose first segment does not match the four known types fall into an `other/`
  bucket.

**Phase 2**
- `LayerSource.excludedTypes?: ArtifactType[]` added to `configSchema.ts`.
- Engine `applyFilters` extended to skip files whose relative-path type prefix
  appears in `excludedTypes` for the source layer.
- `LayersTreeViewProvider`: `ArtifactTypeItem` node class; children rendered for
  layers that have at least one materialized file of each type.
- `metaflow.toggleLayerArtifactType` command + `ConfigWriter` call-site.
- SRS / SDD / TCS / FTD doc updates.

### Out-of-scope

- Checkboxes on individual files or sub-skill directories in either view.
- Changes to `GranularArtifactToggle`'s `filters.disabled` mechanism.
- Profile-based enable/disable patterns.
- CLI surface changes in Phase 2.

## Constraints

- Engine packages must remain free of `vscode` imports.
- `jsonc-parser` used for all JSONC mutations.
- `strict: true` TypeScript throughout.
- Backward-compatible: configs without `excludedTypes` behave identically to today.
- Phase 1 must not regress any existing unit or integration tests.

## Relation to GranularArtifactToggle

`GranularArtifactToggle` adds `filters.disabled` glob suppression in the Effective
Files view (file- and folder-level).  This plan deliberately moves the **toggle
control surface** to the Layers view and simplifies the Effective Files view.  The
two plans are complementary, not conflicting:

| Mechanism              | Control surface  | Granularity  | Config field           |
|------------------------|-----------------|--------------|------------------------|
| GranularArtifactToggle | Effective Files  | file / glob  | `filters.disabled`     |
| ArtifactTypeViewReorg  | Layers tree      | artifact type per layer | `layerSources[i].excludedTypes` |

If both plans are eventually merged, users gain coarse control in Layers and fine
control in Effective Files.

## Success Criteria

### Phase 1

1. `unified` mode shows `instructions/`, `prompts/`, `agents/`, `skills/` (and
   `other/` if needed) as the top-level nodes, with all contributing files beneath.
2. `repoTree` mode shows Repo → artifact-type → files.
3. All existing unit tests pass; new unit tests cover both modes.

### Phase 2

1. Unchecking an artifact-type node in the Layers tree writes `excludedTypes` to
   `config.jsonc` and removes those files from the Effective Files view.
2. Re-checking restores them.
3. A layer with `excludedTypes: ['instructions']` in a config loaded from disk
   already shows that type's checkbox unchecked on first render.
4. Configs without `excludedTypes` are unaffected.

## Phase Overview

| Phase | Name                          | Risk   | Engine? | Shippable alone? |
|-------|-------------------------------|--------|---------|-----------------|
| 1     | Effective Files Reorg         | Low    | No      | Yes             |
| 2     | Layers Artifact-Type Depth    | Medium | Yes     | Yes (after P1)  |

See `Phase1-EffectiveFilesReorg.md` and `Phase2-LayersArtifactDepth.md` for
detailed task breakdowns.
