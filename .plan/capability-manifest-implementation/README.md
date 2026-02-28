# Capability Manifest Implementation Plan

## Overview

This plan implements optional capability manifests in MetaFlow using `CAPABILITY.md` files. It moves from terminology-only adoption to runtime support while keeping existing layer behavior intact.

## Goal

Enable MetaFlow to treat capabilities as first-class runtime metadata by discovering and validating minimal manifest frontmatter, then surfacing it in CLI and VS Code extension UX.

## Scope

### In Scope

1. Optional `CAPABILITY.md` discovery per capability/layer root.
2. Minimal frontmatter schema and validation behavior.
3. Engine APIs for resolved capability metadata.
4. CLI and extension display integration.
5. Tests and migration documentation.

### Out of Scope

1. Mandatory capability manifests.
2. Capability dependency solver (`dependsOn`) semantics.
3. Lifecycle semantics (`version`, `stability`) in this iteration.
4. Breaking changes to existing `.metaflow/config.jsonc` shape.

## Manifest Contract (MVP)

- Filename: `CAPABILITY.md`
- Required frontmatter: `name`, `description`
- Optional frontmatter: `license`
- Internal identity: capability folder name (not a manifest field)
- Markdown body: optional explanatory sections (`Mission`, `In Scope`, `Non-Goals`)

## Validation Rule Set (MVP)

1. File parsing: missing or malformed frontmatter yields warning diagnostics.
2. `name`: non-empty string after trim.
3. `description`: non-empty string after trim.
4. `license` (optional):
   - Accept valid SPDX license identifiers.
   - Optionally accept valid SPDX expressions.
   - Accept `SEE-LICENSE-IN-REPO` fallback token.
   - Invalid values produce warnings, not hard failures.
5. Unknown frontmatter keys: warning only (forward-compatible).

## Architecture Touchpoints

1. `packages/engine`: manifest parsing, discovery, merge into capability/layer model.
2. `packages/cli`: capability metadata in `status` output.
3. `src/src/views`: `LAYERS` and `EFFECTIVE FILES` presentation updates.
4. `src/src/diagnostics`: capability metadata warnings surfaced consistently.

## Phases

| Phase | Focus | Outcome |
|---|---|---|
| 1 | Schema and validation | Final parser contract and tests |
| 2 | Engine discovery and fallback | Capability metadata available in runtime state |
| 3 | CLI and extension UX | Metadata visible to users in key views |
| 4 | Adoption and rollout | Docs, fixtures, migration, release gating |

## Success Criteria

1. Existing repositories without `CAPABILITY.md` remain fully functional.
2. Capability metadata is shown in CLI and extension where it improves discoverability.
3. Validation is deterministic and non-breaking.
4. Tests cover success, missing fields, malformed frontmatter, and invalid license values.
