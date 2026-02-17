# MetaFlow CLI – Context

- **Last updated:** 2026-02-09
- **Status:** Phase 1-5 complete — full CLI with watch mode, CI validation, and promotion automation
- **Owner:** TBD

## Feature Overview

MetaFlow CLI provides a command-line interface for MetaFlow overlay management. The VS Code extension already contains a **pure TypeScript engine** (zero vscode imports) that handles config loading, overlay resolution, filtering, profiling, materialization, provenance, and drift detection. The CLI plan now extracts that engine into a shared `packages/engine/` package so both the extension and CLI consume the same library — no subprocess calls, no code duplication.

## Current Focus

1. **All phases complete.** All tests passing: 46 engine + 56 CLI + 111 extension unit + 21 extension integration = **234 total**.
2. Phase 5 delivered: `validate` command (CI), `watch` command (auto-apply), `promote --auto` (branch + commit to repo), engine standalone tests, multi-repo tests.
3. VSIX bundling verified: engine included via npm workspace symlink.
4. **Coverage targets met**: Engine 95%+ stmts, CLI 92%+ stmts.

## Completed (prior — now superseded)

- ~~Early CLI Phases 1-4 (137 tests, 93.84% coverage)~~ — **SCRAPPED**: wrong technology stack. The engine already exists in TypeScript.

## Next Steps

- [ ] npm scope decision before any public publish
- [ ] Colorized terminal output (chalk or similar)
- [ ] Metadata manifests and tagging (version-pinned layers)

## References

- [Plan README](README.md)
- [Phase 1 — Engine Extraction](Phase1-Skeleton-And-Config.md)
- [Phase 2 — Extension Rewire](Phase2-Overlay-And-Filters.md)
- [Phase 3 — CLI Scaffold + Commands](Phase3-Realization-And-Provenance.md)
- [Phase 4 — Integration Tests + Polish](Phase4-CLI-Commands.md)
- [Phase 5 — Extensions](Phase5-Extensions.md)
- [CLI README](../../packages/cli/README.md)
- Current engine source: `packages/engine/src/` (config + engine modules, 111 unit tests via extension, 46 standalone tests)
- CLI source: `packages/cli/src/` (10 commands, 56 integration tests)

## Decision Log

- **2026-02-05** – MetaFlow is a clean-room project, not a fork of predecessor tooling.
- **2026-02-05** – CLI namespace uses `metaflow` as the top-level command.
- **2026-02-05** – Config file is `.metaflow.json` at repo root (or `.ai/.metaflow.json` fallback).
- **2026-02-07** – **REWORK**: earlier CLI approach scrapped. The extension already has the full engine in pure TypeScript. New approach: extract engine into `packages/engine/`, build CLI in TypeScript, share engine as library. No subprocess calls between extension and CLI.
- **2026-02-07** – Monorepo structure: `packages/engine/`, `packages/cli/`, `src/` (extension). npm workspaces for linking.
- **2026-02-07** – Commander.js selected as CLI framework (lighter than Click equivalent in Node).
- **2026-02-07** – Phase 1 complete: `packages/engine/` created with config + engine modules, Node typings added, build passes.
- **2026-02-07** – Phase 2 complete: extension rewired to `@metaflow/engine`; unit + integration tests pass.
- **2026-02-07** – Phase 3 complete: `packages/cli/` created with Commander and all commands wired to shared engine.
- **2026-02-07** – Phase 4 complete: 27 CLI integration tests, `--json` output for status/preview, CLI README, root `npm test` covering 138 tests.
- **2026-02-07** – Colorized output deferred to Phase 5 (chalk dependency not essential for MVP).

- **2026-02-08** – Phase 5 partial: added `validate` command for CI pipelines (exit 0/1), engine standalone test suite (15 tests), multi-repo integration tests (2 tests). Total: 160 tests from root (`npm test`), 181 including extension integration.
- **2026-02-08** – Phase 5 complete: added `watch` command (debounced FS watcher + auto-apply), `promote --auto` (git branch + commit to metadata repo with provenance stripping), VSIX bundling verified. Total: 170 tests from root (`npm test`), 191 including extension integration.
- **2026-02-09** – Coverage hardening: engine 46 standalone tests (95%+ stmts), CLI 56 tests (92%+ stmts). Total: 213 tests from root (`npm test`), 234 including extension integration.

## Open Questions & Risks

- npm package naming: `@metaflow/engine` and `@metaflow/cli` may conflict with Netflix MetaFlow — decide scope before publish.
