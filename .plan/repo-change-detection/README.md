# Plan: Repository Change Detection & Adaptation

## Problem Statement

MetaFlow's multi-repo configuration uses a static `layerSources` array in `.metaflow/config.jsonc` that explicitly lists layer paths (e.g., `{repoId: "company", path: "company/core"}`). When source metadata repositories evolve—adding new layer directories, removing deprecated ones, or restructuring folder hierarchies—the configuration becomes stale. Users must manually discover these changes and update their config files, creating friction and potential for missing important metadata updates.

## Goal

Enable MetaFlow to automatically detect and adapt to structural changes in source repositories while preserving explicit user control over layer ordering and inclusion. Discovery should integrate seamlessly with the existing `metaflow.autoApply` workflow, requiring minimal new configuration surface area.

## Scope

### In Scope

1. **Runtime layer discovery** — Scan each repository for known artifact directories and build a runtime layer list
2. **Auto mode integration** — When `metaflow.autoApply: true`, automatically merge discovered layers during refresh
3. **Manual rescan UI** — Add a refresh icon to repository rows in Config tree view for on-demand rescanning
4. **Precedence rules** — Explicit `layerSources` entries override discovered entries; discovered layers sorted alphabetically
5. **Opt-in per repository** — New `discover.enabled` property on `NamedMetadataRepo` enables discovery selectively
6. **Discovery filtering** — Support `discover.exclude` glob patterns to skip unwanted directories

### Out of Scope

1. **Config file persistence** — Discovery results remain in-memory only; no automatic writes to config file
2. **Watch mode** — No `FileSystemWatcher` on source repos (performance/complexity tradeoff)
3. **Per-layer granularity** — Discovery operates at layer level, not individual file tracking
4. **Remote repository querying** — Only scans local clones; does not fetch from Git remotes
5. **Cross-tool discovery sharing** — CLI and extension each perform discovery independently

## Success Criteria

1. User adds a new metadata layer directory to a source repo (e.g., `DFX-AI-Metadata/workflows/`)
2. With `autoApply: true` and `discover.enabled: true` on that repo, next config change triggers automatic discovery
3. New layer appears in Layers tree view and effective files include content from new layer
4. User disables `autoApply`, adds another layer directory, clicks refresh icon on repo row — layer discovered on demand
5. Explicit `layerSources` entries remain in declared order; discovered layers append afterward
6. Unit and integration tests achieve 90%+ coverage of discovery logic

## Constraints

- Discovery must not break existing configs without `discover` property (backward compatibility)
- Engine package must remain pure TypeScript (no `vscode` imports)
- Discovery scans should complete in <2 seconds for typical repos (<1000 directories)
- Must work in both single-repo and multi-repo configurations (though single-repo rarely needs discovery)

## Non-Goals

- **UI for config writing** — Users can manually add discovered layers to config if desired (future enhancement)
- **Dependency analysis** — No automatic ordering based on layer dependencies or semantic relationships
- **Schema validation for discovered paths** — Discovered layers assumed valid; existing validation handles errors

## Phases

1. **Discovery Engine** — Core scanning logic in `overlayEngine.ts` + unit tests
2. **UI Integration** — Config view refresh icon + rescan command + manual workflow tests
3. **Testing & Documentation** — Integration tests + traceability updates (SRS/SDD/TCS/FTD/FTR)

## Dependencies

- Existing `resolveLayers()` and `resolveMultiRepoLayers()` functions
- Config tree view infrastructure (`configTreeView.ts`)
- Command registration framework (`commandHandlers.ts`)
- Artifact type constants (`KNOWN_ARTIFACT_ROOTS`)

## References

- [MetaFlow Reference Architecture](../../doc/concept/metaflow_reference_architecture.md) — overlay resolution principles
- [Config Schema](../../packages/engine/src/config/configSchema.ts) — current `NamedMetadataRepo` definition
- [Overlay Engine](../../packages/engine/src/engine/overlayEngine.ts) — layer resolution entry point
- [Config Tree View](../../src/src/views/configTreeView.ts) — repository display and interaction
