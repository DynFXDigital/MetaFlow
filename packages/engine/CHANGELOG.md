# @metaflow/engine

## Unreleased

### Patch Changes

- Add target capability matrix evidence and notes for the Codex custom-agent activation proof boundary.
- Add explicit runtime-only target capability matrix rows for remote MCP reachability, OAuth MCP login, and side-effecting MCP behavior.
- Codex support boundary report metadata now includes related operator, package maintainer, and tool authority guide references.
- Warn when a capability declares multiple enabled target adapters for the same target, keeping Codex and Copilot projection policy unambiguous.
- Parse and validate richer `.metaflow/capability.json` target declarations with support posture, required policy grants, validation evidence, and notes.
- Warn when managed authority-sensitive target adapter concepts omit adapter-level policy grant metadata.
- Treat authority-sensitive target adapter concepts as candidate output until adapter-level policy grants are declared.
- Warn when managed target adapter concepts are unsupported or runtime-only in the current target capability matrix.
- Warn when package runtime validation records omit both a validation command and evidence references.
- Parse package runtime validation concept links and warn on unknown target capability concept IDs.
- Surface package runtime validation concept links in adapter readiness output and warn when those concepts are unsupported for the target.
- Add issue/PR-native and always-on workflow orchestration surface values to canonical execution profiles.
- Add Codex GitHub Action, app-server, and SDK-embedded surface values to canonical execution profiles and target capability matrix output.
- Add static-projection versus harness-runtime evidence metadata to canonical evaluation profiles and adapter readiness output.
- Add evaluation runtime evidence metadata notes and evidence tags to target capability matrix evaluation-support rows.
- Identify `.metaflow/packages/*.json` as the canonical package metadata surface in package-manifest target capability matrix rows.
- Parse canonical `.metaflow/skills/<skill-id>/skill.json` metadata for skill identity, entrypoint, routing tags, risk posture, target constraints, and package reference validation.
- Parse same-name `.metaflow/instructions/*.json` and `.metaflow/prompts/*.json` metadata for content identity, entrypoint, routing tags, risk posture, target constraints, and package reference validation.

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
