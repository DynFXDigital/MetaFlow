# Capability Manifest Implementation - Context

- **Last updated:** 2026-02-28
- **Status:** Complete - CAPABILITY.md support implemented and validated
- **Owner:** MetaFlow maintainers

## Feature Overview

MetaFlow has adopted capability-first language conceptually, but runtime tooling does not yet read capability metadata directly. This plan introduces an optional `CAPABILITY.md` manifest per capability/layer with minimal frontmatter (`name`, `description`, optional `license`) so the engine, CLI, and extension can expose human-friendly capability information without breaking existing repositories. Success means capability metadata is discoverable, validated with predictable diagnostics, and surfaced in `status`, `LAYERS`, and `EFFECTIVE FILES` while preserving deterministic behavior and backward compatibility.

## Current Focus

1. Completed implementation verification and rollout documentation.

## Next Steps

- [x] Finalize `CAPABILITY.md` contract and diagnostics severity levels.
- [x] Implement engine parser/discovery support with unit tests.
- [x] Add CLI `status` capability metadata output and tests.
- [x] Add extension view updates for capability name/description/license and tests.
- [x] Document migration and add examples in `test-workspace` and docs.

## References

- `.plan/capability-first-class/README.md` - completed documentation-first capability plan.
- `.plan/capability-first-class/Followup-Implementation-Backlog.md` - backlog that deferred optional `CAPABILITY.md` support.
- `.plan/capability-manifest-implementation/README.md` - implementation scope and milestones.
- `.plan/capability-manifest-implementation/RESEARCH.md` - external validation references (GitHub docs + SPDX).
- `c:\Users\cyates\gitwork\AI\DFX-AI-Metadata\capabilities\metadata-authoring\.github\instructions\ai-metadata-agent-skills.instructions.md` - current skill frontmatter baseline.

## Decision Log

- **2026-02-28** - Treat capability directory name as internal ID; do not add separate `displayName`.
- **2026-02-28** - Keep initial manifest minimal: required `name` and `description`, optional `license`.
- **2026-02-28** - Defer `version` and `stability` fields until a real lifecycle/compat policy exists.
- **2026-02-28** - Use warning diagnostics for malformed metadata to preserve non-breaking behavior.
- **2026-02-28** - Implemented parser contract with warning codes for missing/malformed frontmatter, missing required fields, unknown fields, and invalid license syntax.
- **2026-02-28** - Added capability metadata propagation from resolved layers to effective files for CLI and extension UX consumption.
- **2026-02-28** - Added optional CAPABILITY.md examples/documentation and validated via `npm run gate:quick`.

## Open Questions & Risks

- Should `name` uniqueness be enforced globally or only within each capability directory?
- Should `license` accept SPDX identifiers only, or SPDX expressions plus a controlled fallback token?
- Capability metadata may drift from folder intent if maintainers rename folders without updating manifests.
- Extension UX density risk: adding too much capability text could reduce tree readability.

## Outcome

Implemented optional `CAPABILITY.md` support end-to-end across engine, CLI, and extension UX with non-breaking behavior. Existing repositories without manifests remain functional, while repositories with manifests now surface capability name/description/license metadata and warning diagnostics. Quick gate validation completed successfully (`npm run gate:quick`).
