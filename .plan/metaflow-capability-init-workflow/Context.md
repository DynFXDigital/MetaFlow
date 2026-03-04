# MetaFlow Capability Initialization Workflow - Context

- **Last updated:** 2026-03-03
- **Status:** Complete
- **Owner:** TBD

## Feature Overview

MetaFlow currently initializes AI metadata by copying bundled files into `.github/`. This effort adds a capability-centric workflow where users can either materialize capability files or enable a built-in MetaFlow capability in settings-only mode. The built-in mode is persisted in extension `workspaceState`, shown in views as a synthetic source/layer, and remains toggleable so users can control when it is active without editing config files.

## Current Focus

1. Implementation complete across phases 1-4.
2. Validation complete for extension integration tests and full unit suite.
3. Plan artifacts updated to final completed state.

## Next Steps

- [x] Add a small extension state contract for built-in capability enablement and toggle state.
- [x] Refactor `metaflow.initMetaFlowAiMetadata` into two setup options with capability wording.
- [x] Add synthetic source/layer projection into refresh/overlay resolution path when built-in mode is enabled.
- [x] Make synthetic source/layer toggleable in Layers view while keeping destructive source actions blocked.
- [x] Add mirrored remove command covering built-in disable and materialized file removal.
- [x] Add/update unit and integration tests for init, toggle, apply, clean, and remove paths.
- [x] Update `README.md`, `src/README.md`, `CHANGELOG.md`, and `src/CHANGELOG.md` terminology and behavior docs.

## References

- [Plan README](README.md)
- [Phase 1 - Architecture and State Model](Phase1-Architecture-And-State-Model.md)
- [Phase 2 - Initialize Command Flow](Phase2-Initialize-Command-Flow.md)
- [Phase 3 - Toggleable Layers and Removal](Phase3-Toggleable-Layers-And-Removal.md)
- [Phase 4 - Validation and Docs](Phase4-Validation-And-Docs.md)
- [Initialize command handler](../../src/src/commands/commandHandlers.ts)
- [Starter metadata helper](../../src/src/commands/starterMetadata.ts)
- [Config Tree View provider](../../src/src/views/configTreeView.ts)
- [Layers Tree View provider](../../src/src/views/layersTreeView.ts)
- [Extension entrypoint](../../src/src/extension.ts)
- [Plan guidance (authoritative)](../../.github/instructions/plan.instructions.md)

## Decision Log

- **2026-03-03** - Built-in MetaFlow capability mode will not be persisted in `.metaflow/config.jsonc`; persistence will use extension `workspaceState`.
- **2026-03-03** - Built-in capability will be visible as a synthetic source/layer in UI for transparency.
- **2026-03-03** - Synthetic built-in layer must be toggleable so users can control activation without removing setup.
- **2026-03-03** - Materialize mode is extension-owned and overwrite-first, with explicit removal support.
- **2026-03-03** - User-facing terminology will use "MetaFlow capability" and avoid "starter pack" wording.
- **2026-03-03** - Implemented workspace-state contract (`metaflow.builtInCapability.v1`) with legacy migration fallback and managed materialized-file tracking.
- **2026-03-03** - Runtime overlay resolution now projects built-in capability as synthetic repo/layer in memory, without config-file mutation.
- **2026-03-03** - Layers/config views now surface synthetic built-in nodes, permit layer toggle, and block destructive repo actions via readonly context values.
- **2026-03-03** - Added `MetaFlow: Remove MetaFlow Capability` and updated docs/changelogs to capability terminology.

## Open Questions & Risks

- Multi-root persistence behavior still follows workspace-scoped state semantics and may need dedicated UX guidance in future iterations.
- Materialized-file removal currently depends on tracked file list from initialization; manual file additions are intentionally left untouched.

## Outcome

The plan is complete. All phase task checklists are marked complete, tests passed (`npm -w metaflow run test`, `npm run test:unit`), and capability workflow documentation/changelogs were updated.
