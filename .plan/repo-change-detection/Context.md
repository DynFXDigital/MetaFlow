# RepoChangeDetection – Context

- **Last updated:** 2026-02-18
- **Status:** Planning – awaiting Phase 1 kickoff
- **Owner:** TBD

## Feature Overview

When source metadata repositories add or remove layer directories (e.g., `company/core`, `standards/sdlc/ai-editor-sdlc`), MetaFlow's static `layerSources` configuration becomes stale, forcing users to manually update `.metaflow/config.jsonc`. The solution adds per-repository runtime discovery that scans for known artifact directories and merges discovered layers with explicit configuration. Discovery respects the existing `metaflow.autoApply` setting: when enabled, new/removed layers are automatically detected and applied; when disabled, users can manually trigger rescans via a refresh icon in the Config tree view.

## Current Focus

1. Planning complete; awaiting Phase 1 implementation (discovery engine).

## Next Steps

- [ ] Phase 1: Add `discover` property to `NamedMetadataRepo` in `configSchema.ts`.
- [ ] Phase 1: Implement `discoverLayersInRepo()` in `overlayEngine.ts` to walk repos and find artifact directories.
- [ ] Phase 1: Update `resolveLayers()` to merge discovered layers with explicit `layerSources`.
- [ ] Phase 1: Write unit tests DISC-01 through DISC-08 for discovery engine.
- [ ] Phase 2: Add context value and refresh icon to `RepoSourceItem` in `configTreeView.ts`.
- [ ] Phase 2: Implement `metaflow.rescanRepository` command in `commandHandlers.ts`.
- [ ] Phase 2: Add repository rescan integration test IT-RSC-01 through IT-RSC-03.
- [ ] Phase 3: Add integration tests for full discovery workflow IT-DISC-01 through IT-DISC-05.
- [ ] Phase 3: Update SRS, SDD, TCS, FTD, FTR, and validation docs with new discovery capability.

## References

- `.plan/repo-change-detection/README.md` – scope, goals, non-goals, and success criteria.
- `.plan/repo-change-detection/Phase1-Discovery-Engine.md` – layer discovery implementation + tests.
- `.plan/repo-change-detection/Phase2-UI-Integration.md` – Config view refresh icon + command.
- `.plan/repo-change-detection/Phase3-Testing-Docs.md` – integration tests + traceability updates.
- `packages/engine/src/config/configSchema.ts` – `NamedMetadataRepo` to be extended.
- `packages/engine/src/engine/overlayEngine.ts` – `resolveLayers()` to be enhanced.
- `src/src/views/configTreeView.ts` – repository items to receive refresh capability.
- `src/src/commands/commandHandlers.ts` – new `rescanRepository` command.
- `doc/srs/SRS-metaflow-ext.md` – REQ IDs to add: REQ-DISC-01 through REQ-DISC-05.

## Decision Log

- **2026-02-18** – Discovery tied to existing `metaflow.autoApply` setting rather than introducing a new mode; simplifies user mental model and reuses established workflow.
- **2026-02-18** – Discovery operates at runtime only (no config persistence by default); keeps config file simple and avoids surprising users with automated writes.
- **2026-02-18** – Explicit `layerSources` entries always take precedence over discovered entries; preserves user control over ordering and allows overrides.
- **2026-02-18** – Discovery scans for known artifact root directories (`instructions/`, `prompts/`, `skills/`, `agents/`, `hooks/`, `chatmodes/`) under both `.github/` and repo root; matches existing `walkDirectory` behavior.
- **2026-02-18** – Manual refresh icon added to repo rows in Config view for users who disable `autoApply` but still want on-demand rescanning.

## Open Questions & Risks

- **Discovery precedence vs explicit order:** Should discovered layers be inserted alphabetically, or append after explicit entries? Default: append after, alphabetically sorted.
- **Partial discovery failures:** If one repo fails to scan (permissions, missing directory), should the entire refresh fail or continue with warnings? Default: continue with warnings in output channel.
- **Performance for large repos:** Scanning repo structure could be slow for repos with many directories. Mitigation: only scan when config changes or manual refresh triggered; cache results per session.
- **Nested layer paths:** Should discovery find layers nested arbitrarily deep (e.g., `company/core/subdomain/layer`)? Default: yes, recursively scan all artifact directories.
- **Conflict with disabled repos:** If a repo is `enabled: false` in config, skip discovery entirely. Confirm this aligns with user expectations.
