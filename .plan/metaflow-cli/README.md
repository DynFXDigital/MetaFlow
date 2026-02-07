# MetaFlow CLI – Implementation Plan

## Overview

MetaFlow implements the [AI Metadata Overlay Sync System Reference Architecture](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md) as a standalone CLI tool. It replaces the overlay subsystem prototyped in Sync-AI-Metadata with a focused, clean codebase.

## Goals

- Implement deterministic overlay composition with hierarchical layers (company → department → team → product → repo).
- Support filtering (include/exclude) and named activation profiles.
- Provide hybrid realization: live-reference for instructions/prompts, materialization for skills/agents.
- Deliver CLI commands: `status`, `preview`, `apply`, `clean`, `profile`, `promote`.
- Inject machine-readable provenance into all materialized outputs.
- Guarantee determinism: same config + same metadata commit ⇒ identical outputs.

## Non-Goals

- VS Code extension UX (future phase, not blocking).
- Organization-wide CI policy enforcement.
- Server-side services or remote APIs.
- Backward compatibility with Sync-AI-Metadata's `pack-sync` workflow.

## Scope Boundaries

**In scope:**
- `ai-sync.json` config schema and loader.
- Overlay resolution engine (layer merging, conflict resolution).
- Filter engine (include/exclude glob patterns).
- Profile engine (enable/disable patterns, named profiles).
- Artifact classification (live-ref vs materialized).
- Deterministic rendering to `.github/` with `_shared_` prefix.
- Provenance header injection.
- Managed-state tracking for safe re-render and cleanup.
- `promote` detection (local-edit awareness).
- Comprehensive test suite with ≥90% coverage target.

**Out of scope:**
- File-watcher / live-sync mode (Phase 5 stretch).
- Git automation for promotion (branch/commit/PR creation) — detection only in v1.
- Any GUI or extension work.

## Constraints

- Python 3.10+ (dataclasses, `pathlib`, type hints throughout).
- CLI-first, zero service dependencies.
- Determinism is non-negotiable.
- Must respect Copilot artifact discovery rules (skills/agents require `.github/`).

## Dependencies

- Reference architecture document (canonical spec).
- A sample metadata repo layout for integration testing.
- Sync-AI-Metadata overlay engine as prior-art reference (patterns, not code).

## Lessons from Sync-AI-Metadata

| Concern | Sync-AI-Metadata Issue | MetaFlow Approach |
|---------|----------------------|-------------------|
| Scope creep | Pack-sync, watchers, event caches mixed in one package | Single-purpose: overlay engine + CLI only |
| CLI namespace | `overlay-*` prefix coexisted awkwardly with legacy commands | Clean namespace: `metaflow <command>` |
| Config location | Ambiguous fallback logic | `ai-sync.json` at root, `.ai/ai-sync.json` fallback, explicit precedence |
| Testing | Tests added retroactively | TDD from Phase 1; ≥90% coverage gate |
| Promotion | Detection only, automation deferred | Same strategy — detection in v1, automation in v2 |

## Phases

| Phase | Name | Description | Status |
|-------|------|-------------|--------|
| 1 | [Project Skeleton + Config Model](Phase1-Skeleton-And-Config.md) | Package scaffold, `ai-sync.json` schema, config loader/validator | Not started |
| 2 | [Overlay Resolution + Filtering](Phase2-Overlay-And-Filters.md) | Layer merging engine, include/exclude filter evaluation | Not started |
| 3 | [Realization + Provenance](Phase3-Realization-And-Provenance.md) | Hybrid rendering, provenance injection, managed-state tracking | Not started |
| 4 | [CLI Commands](Phase4-CLI-Commands.md) | `status`, `preview`, `apply`, `clean`, `profile`, `promote` | Not started |
| 5 | [Extensions](Phase5-Extensions.md) | Watch mode, VS Code extension hooks, CI validation, promotion automation | Not started |

## Success Criteria

- `metaflow status` and `metaflow preview` operate purely from `ai-sync.json` + metadata commit.
- `metaflow apply` produces identical outputs given identical inputs (determinism).
- `metaflow clean` removes exactly the managed files, nothing more.
- `metaflow promote` detects local edits to materialized files and presents options.
- All core functions have ≥90% branch coverage.
- A sample metadata repo can be composed end-to-end in integration tests.
