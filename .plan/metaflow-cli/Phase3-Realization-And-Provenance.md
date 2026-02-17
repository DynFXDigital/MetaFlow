# Phase 3 – CLI Scaffold + Commands

**Status:** Complete

## Objective

Build the TypeScript CLI (`packages/cli/`) that imports `@metaflow/engine` and exposes all commands. After this phase the CLI is fully functional and can be run via `npx metaflow <command>`.

## Tasks

- [ ] Create `packages/cli/` package structure:
  - `packages/cli/package.json` (name: `@metaflow/cli`, bin: `metaflow`, depends on `@metaflow/engine`)
  - `packages/cli/tsconfig.json`
  - `packages/cli/src/cli.ts` — Commander-based entry point
  - `packages/cli/src/commands/` — one module per command
- [ ] Implement `metaflow status`:
  - Load config via engine → show repo, layers, profile, file counts (settings vs materialized)
- [ ] Implement `metaflow preview`:
  - Resolve overlay → display effective file tree with classification labels
  - Show pending changes (what apply would do)
- [ ] Implement `metaflow apply`:
  - Resolve overlay → materialize files via engine → display summary (written/removed/skipped)
  - Skip drifted files by default; `--force` to overwrite
- [ ] Implement `metaflow clean`:
  - Remove managed in-sync files → clear state → display summary
- [ ] Implement `metaflow profile list|set`:
  - List available profiles with active marker
  - Set active profile → update .metaflow.json → show new file counts
- [ ] Implement `metaflow promote`:
  - Detect locally modified materialized files via drift detection
  - Display list with actionable suggestions
- [ ] Implement `metaflow init`:
  - Generate starter `.metaflow.json` template
  - Refuse overwrite unless `--force`
- [ ] Write unit tests for each command:
  - Use Commander test helpers or capture stdout
  - Mock filesystem with temp directories
  - Target ≥90% coverage
- [ ] CLI help text, `--version`, `--help` for all commands
- [ ] Exit code conventions: 0=success, 1=error, 2=drift

## Deliverables

- `packages/cli/` compiles and all commands work.
- `npx metaflow status`, `apply`, `preview`, etc. produce correct output.
- Unit tests for all commands with ≥90% coverage.

## Reference

- [CLI Responsibilities](../../doc/concept/metaflow_reference_architecture.md#cli-responsibilities)
- Engine API: `@metaflow/engine` exports
