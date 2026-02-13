# MetaFlow CLI – Implementation Plan

## Overview

MetaFlow implements the [AI Metadata Overlay Sync System Reference Architecture](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md) as a standalone CLI tool. It replaces the overlay subsystem prototyped in Sync-AI-Metadata with a focused, clean codebase.

## Architecture

The MetaFlow VS Code extension already contains a **pure TypeScript engine** (`src/src/engine/` + `src/src/config/`) with zero `vscode` imports. The CLI reuses this engine directly:

```
packages/
  engine/          ← extracted pure TS engine (config, overlay, render)
    src/
      config/      ← configSchema, configLoader, configPathUtils
      engine/      ← overlay, filter, profile, classifier, glob, provenance, materializer, drift, managed state, settings injector
      index.ts     ← barrel export
    package.json
    tsconfig.json
  cli/             ← TypeScript CLI consuming packages/engine
    src/
      cli.ts       ← Commander-based CLI entry point
      commands/    ← status, preview, apply, clean, profile, promote, init
    package.json
    tsconfig.json
src/               ← VS Code extension (imports packages/engine as dependency)
  src/
    commands/
    views/
    extension.ts
  package.json     ← depends on @metaflow/engine
```

**Key principle:** One engine, two consumers. The VS Code extension and CLI both import the engine as a library — no subprocess calls, no code duplication.

## Goals

- Extract the existing pure TS engine from `src/src/engine/` + `src/src/config/` into `packages/engine/`.
- Build a TypeScript CLI (`packages/cli/`) that imports `@metaflow/engine` directly.
- Rewire the VS Code extension (`src/`) to import `@metaflow/engine` instead of local engine files.
- Deliver CLI commands: `status`, `preview`, `apply`, `clean`, `profile`, `promote`, `init`.
- Maintain ≥90% test coverage across all packages.
- Guarantee determinism: same config + same metadata commit ⇒ identical outputs.

## Non-Goals

- Python implementation (the engine is TypeScript-native).
- Organization-wide CI policy enforcement.
- Server-side services or remote APIs.
- Backward compatibility with Sync-AI-Metadata's `pack-sync` workflow.

## Scope Boundaries

**In scope:**
- Engine extraction into `packages/engine/` with its own `package.json` and test suite.
- TypeScript CLI with Commander (or similar) for subcommand routing.
- All 7 CLI commands wired to the shared engine.
- Integration tests covering full lifecycle (init → apply → status → modify → promote → clean).
- Rewiring the VS Code extension to consume the extracted engine package.

**Out of scope:**
- File-watcher / live-sync mode (Phase 5 stretch).
- Git automation for promotion (detection only in v1).
- Any GUI changes beyond rewiring imports.

## Constraints

- Node.js 18+ / TypeScript 5+ (strict mode throughout).
- CLI-first, zero service dependencies.
- Determinism is non-negotiable.
- Must respect Copilot artifact discovery rules (skills/agents require `.github/`).
- Engine package must have zero `vscode` imports (enforced by separate `tsconfig`).

## Dependencies

- Reference architecture document (canonical spec).
- Existing engine implementation in `src/src/engine/` (extraction source).
- Existing config implementation in `src/src/config/` (extraction source).
- npm workspace or TypeScript project references for monorepo structure.

## Phases

| Phase | Name | Description | Status |
|-------|------|-------------|--------|
| 1 | [Engine Extraction](Phase1-Skeleton-And-Config.md) | Extract engine + config into `packages/engine/`, set up monorepo | Complete |
| 2 | [Extension Rewire](Phase2-Overlay-And-Filters.md) | Rewire VS Code extension to import `@metaflow/engine` | Complete |
| 3 | [CLI Scaffold + Commands](Phase3-Realization-And-Provenance.md) | Build TypeScript CLI with all commands consuming the engine | Complete |
| 4 | [Integration Tests + Polish](Phase4-CLI-Commands.md) | End-to-end tests, help text, exit codes, README | Complete |
| 5 | [Extensions](Phase5-Extensions.md) | Watch mode, CI validation, promotion automation | Complete |

## Success Criteria

- `metaflow status` and `metaflow preview` operate purely from `ai-sync.json` + metadata commit.
- `metaflow apply` produces identical outputs given identical inputs (determinism).
- `metaflow clean` removes exactly the managed files, nothing more.
- `metaflow promote` detects local edits to materialized files.
- VS Code extension works identically after rewire (no behavioral changes).
- All engine unit tests continue to pass unmodified after extraction.
- ≥90% branch coverage across engine, CLI, and extension.
