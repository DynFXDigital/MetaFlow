# Capability-First Follow-Up Implementation Backlog

## Purpose

This backlog captures implementation work that follows the completed documentation-first capability plan. It intentionally separates conceptual naming adoption from runtime/schema changes.

## Scope

### In Scope

1. Engine/config/schema planning for optional capability manifests.
2. Resolver/materializer impact analysis for capability-level operations.
3. CLI and extension UX naming/messaging migration options.
4. Backward-compatibility and rollout strategy.

### Out of Scope

1. Immediate runtime or schema breaking changes.
2. Automatic migration of existing repositories.

## Candidate Workstreams

## 1) Config and Schema

1. Evaluate adding optional capability declarations in `.metaflow/config.jsonc`.
2. Define compatibility behavior when capability metadata is absent.
3. Preserve current layer/profile behavior as default path.

## 2) Engine and Resolution

1. Define capability discovery semantics from folder conventions.
2. Add deterministic capability selection/expansion rules.
3. Define precedence interaction between capabilities and existing layers/profiles.

## 3) Manifest Option (Future)

1. Decide whether to introduce optional `CAPABILITY.md` support.
2. If adopted, define minimal required fields and parser behavior.
3. Ensure folder + `README.md` convention remains valid for backward compatibility.

## 4) CLI and Extension UX

1. Assess command additions for capability introspection (for example, list/show/preview-by-capability).
2. Update status/output messaging to use capability-first terms where useful.
3. Keep existing commands and config valid during migration.

## 5) Validation and Rollout

1. Add unit/integration tests for any capability-aware resolver changes.
2. Validate against existing fixtures without requiring repository restructuring.
3. Publish migration guide and examples before enabling new defaults.

## Acceptance Criteria

1. Follow-up implementation plan is explicit, staged, and backward-compatible.
2. Any future capability manifest support is optional and non-breaking.
3. Runtime determinism guarantees remain intact.
