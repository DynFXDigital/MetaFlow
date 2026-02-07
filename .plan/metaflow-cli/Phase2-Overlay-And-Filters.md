# Phase 2 – Overlay Resolution + Filtering

**Status:** Not started

## Objective

Implement the deterministic layer-merging engine and the include/exclude filter evaluator. After this phase the system can resolve an effective file set from a stack of overlay layers.

## Tasks

- [ ] Implement layer resolution:
  - Scan each layer directory for `.github/`-structured content
  - Merge layers in declared order (later wins on path collision)
  - Produce a flat dict: `relative_path → source_layer`
  - Handle missing layer directories gracefully (warn, skip)
- [ ] Implement filter engine:
  - Evaluate include patterns (allowlist, default `["**"]`)
  - Evaluate exclude patterns (blocklist, default `[]`)
  - Glob matching via `fnmatch` / `pathlib` patterns
  - Exclude wins unless re-included at higher specificity
- [ ] Implement profile activation:
  - Apply the active profile's enable/disable patterns on the post-filter set
  - `enable` acts as allowlist, `disable` acts as blocklist
  - Default profile passes everything through
- [ ] Implement artifact classification:
  - Instructions / prompts → `live-ref` (reference in-place)
  - Skills / agents → `materialize` (copy to `.github/`)
  - Classification based on path prefix (`instructions/`, `prompts/`, `skills/`, `agents/`)
- [ ] Write unit tests:
  - Single-layer resolution
  - Multi-layer override precedence
  - Include-only filtering
  - Exclude-only filtering
  - Combined include + exclude
  - Profile enable/disable
  - Artifact classification mapping
  - Edge cases: empty layers, no matching files, all files excluded

## Deliverables

- `metaflow/engine.py` — overlay resolution, filtering, profile activation, classification.
- ≥90% branch coverage on engine module.

## Reference

- [Overlay Model](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#overlay-model)
- [Separation of Concerns](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#separation-of-concerns)
