# Phase 5 – Extensions

**Status:** Not started (stretch / post-v1)

## Objective

Extend the stable CLI core with optional capabilities that improve developer experience and organizational governance.

## Potential Work Items

### Watch Mode
- File-system watcher on `ai-sync.json` and metadata repo directory.
- Auto-re-render on config or metadata changes.
- Debounced to avoid thrashing during rapid edits.

### VS Code Extension Hooks
- Expose engine functions as a library for a VS Code extension.
- Extension provides tree views, status bar, and command palette integration.
- Extension calls same engine — no separate logic.

### Promotion Automation
- `metaflow promote --auto`: create branch, commit, and optionally open PR.
- Requires git operations (libgit2 or subprocess).
- Scoped promotion: target specific layer for the change.

### CI Policy Validation
- `metaflow validate`: check that managed files match expected state.
- Non-zero exit on drift for CI pipelines.
- JSON/SARIF output for integration with CI dashboards.

### Metadata Manifests & Tagging
- Version-tagged metadata releases (git tags on canonical repo).
- `ai-sync.json` can pin to a tag instead of a commit.
- Manifest file listing available layers and their descriptions.

### Organization-Wide Enforcement
- Central config that defines required layers per repo classification.
- Audit mode: report repos not compliant with policy.

## Notes

- All items are non-blocking for v1 delivery.
- Prioritize based on adoption feedback after Phase 4 is complete.
- VS Code extension should be planned as a separate plan (`.plan/metaflow-vscode-extension/`).

## Reference

- [Future Extensions](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#future-extensions-nonblocking)
