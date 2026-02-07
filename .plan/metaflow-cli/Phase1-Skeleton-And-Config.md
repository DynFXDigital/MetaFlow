# Phase 1 – Project Skeleton + Config Model

**Status:** Not started

## Objective

Stand up the Python project and implement the `ai-sync.json` configuration schema with full validation, providing the data foundation for all subsequent phases.

## Tasks

- [ ] Initialize Python package structure:
  - `pyproject.toml` (Python 3.10+, `click` CLI dependency, `pytest`/`pytest-cov` dev deps)
  - `metaflow/__init__.py`, `metaflow/cli.py`, `metaflow/config.py`
  - `tests/` directory with `conftest.py`
- [ ] Define config data model (dataclasses):
  - `MetadataRepoConfig` – url, commit/ref
  - `LayerConfig` – ordered layer paths
  - `FilterConfig` – include/exclude glob lists
  - `ProfileConfig` – enable/disable patterns per named profile
  - `AISyncConfig` – top-level composition of all above + `activeProfile`
- [ ] Implement config loader:
  - Load from `ai-sync.json` (repo root) or `.ai/ai-sync.json` (fallback)
  - JSON parsing + schema validation with clear error messages
  - `from_dict()` / `to_dict()` round-trip
- [ ] Implement config validation:
  - Required fields present
  - Active profile exists in profiles map
  - Layer paths are non-empty
  - Glob patterns are syntactically valid
- [ ] Write unit tests (target: 100% of config module):
  - Valid config round-trip
  - Missing required fields
  - Invalid profile reference
  - Empty layers
  - Malformed JSON
  - Fallback path resolution

## Deliverables

- Working `metaflow` CLI entry point (stub commands that load config).
- `metaflow/config.py` with full data model and loader.
- ≥95% branch coverage on config module.

## Reference

- [ai-sync.json schema](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#repository-configuration-file)
- Sync-AI-Metadata prior art: `AISyncConfig` in `overlay_engine.py`
