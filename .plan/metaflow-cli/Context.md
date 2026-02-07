# MetaFlow CLI – Context

- **Last updated:** 2026-02-05
- **Status:** Planning – pre-implementation
- **Owner:** TBD

## Feature Overview

MetaFlow is a clean-room CLI tool implementing the AI Metadata Overlay Sync System reference architecture. It provides deterministic composition, filtering, and realization of shared Copilot metadata (instructions, prompts, skills, agents) from a canonical repository into consuming repos. The project builds on lessons from Sync-AI-Metadata but targets a simpler, focused codebase with the overlay engine as the sole concern — no legacy sync, watcher, or pack-sync baggage.

## Current Focus

1. Finalizing the phased implementation plan and architecture boundaries.
2. Establishing the project skeleton (Python package, CLI entry point, test harness).

## Next Steps

- [ ] Review and approve plan phases (README.md + phase docs).
- [ ] Scaffold Python project: `pyproject.toml`, `metaflow/`, `tests/`, CLI entry point.
- [ ] Implement Phase 1: config model + `ai-sync.json` loader/validator.
- [ ] Implement Phase 2: overlay resolution engine + filter engine.
- [ ] Implement Phase 3: hybrid realization + provenance injection.
- [ ] Implement Phase 4: CLI commands (`status`, `preview`, `apply`, `clean`, `promote`).
- [ ] Implement Phase 5: watch mode, VS Code extension hooks, CI validation.

## References

- [Reference Architecture](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md)
- [Plan README](.plan/metaflow-cli/README.md)
- Sync-AI-Metadata overlay engine (prior art): `Sync-AI-Metadata/sync_ai_metadata/overlay_engine.py`
- Sync-AI-Metadata CLI transition plan (prior art): `Sync-AI-Metadata/.plan/cli-reference-architecture-transition/`

## Decision Log

- **2026-02-05** – MetaFlow is a clean-room project, not a fork of Sync-AI-Metadata. Reuse architecture patterns but rewrite code for clarity.
- **2026-02-05** – CLI-first: no VS Code extension work until core engine is stable and tested.
- **2026-02-05** – Python 3.10+ target; leverage dataclasses and `pathlib` throughout.
- **2026-02-05** – Config file is `ai-sync.json` at repo root (or `.ai/ai-sync.json` fallback), matching the reference architecture.
- **2026-02-05** – CLI namespace uses `metaflow` as the top-level command (e.g., `metaflow status`, `metaflow apply`).

## Open Questions & Risks

- Package name collision: "metaflow" conflicts with Netflix's MetaFlow ML library — may need a different PyPI name (e.g., `ai-metaflow`, `mf-sync`). Decide before first publish.
- Determine minimum viable metadata repo layout to validate against.
- Clarify whether `promote` should automate branch/commit/PR or remain detection-only for v1.
- Copilot discovery rules for skills/agents: revalidate that alternate paths are still unsupported.
