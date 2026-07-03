# @metaflow/engine

## Unreleased

### Patch Changes

- Warn when a capability declares multiple enabled target adapters for the same target, keeping Codex and Copilot projection policy unambiguous.
- Parse and validate richer `.metaflow/capability.json` target declarations with support posture, required policy grants, validation evidence, and notes.
- Warn when managed authority-sensitive target adapter concepts omit adapter-level policy grant metadata.
- Treat authority-sensitive target adapter concepts as candidate output until adapter-level policy grants are declared.
- Warn when managed target adapter concepts are unsupported or runtime-only in the current target capability matrix.
- Warn when package runtime validation records omit both a validation command and evidence references.
- Identify `.metaflow/packages/*.json` as the canonical package metadata surface in package-manifest target capability matrix rows.

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
