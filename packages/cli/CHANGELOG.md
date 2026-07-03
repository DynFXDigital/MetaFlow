# @metaflow/cli

## Unreleased

### Added

- `metaflow target-support` command for inspecting target capability support, runtime-only behavior, and unsupported surfaces without requiring a configured workspace.
- Target-aware lifecycle output for `metaflow status`, `metaflow validate`, `metaflow apply`, and `metaflow clean`, including target support summaries and `[codex]`-style mutation labels from managed projection metadata.
- `metaflow status` now displays capability-level target support posture, policy grants, validation evidence, and review-note counts from `.metaflow/capability.json`.
- `metaflow preview` now reports canonical `.metaflow/skills/<skill-id>/skill.json` metadata and validation warnings.
- `metaflow preview` now reports canonical `.metaflow/instructions/*.json` and `.metaflow/prompts/*.json` metadata and validation warnings.

## 0.3.2

### Patch Changes

- Prepare the 0.3.2 prerelease with prerelease branch CI and non-redundant release gating.

## 0.3.1

### Patch Changes

- Prepare the 0.3.1 prerelease with capability search and plugin metadata maintenance fixes.

## 0.3.0

### Minor Changes

- 8bbae64: Prepare the 0.3.0 prerelease lane for preview extension publishing.

## 0.1.0

### Minor Changes

- Bump minor versions for engine, CLI, and extension packages.
