# Metadata Source-Aware Initialization Plan

## Overview

This plan introduces source-aware initialization for MetaFlow so users can generate an initial `.metaflow.json` from a chosen metadata source instead of a static template. The feature supports three source modes: existing local directory (with auto-discovery), remote Git URL (clone + discovery), and new empty directory scaffold (example structure).

## Problem / Goal

Today, first-time setup requires users to manually create metadata directories and manually edit generated config values after `init`. This creates friction and inconsistent onboarding. The goal is to make initialization produce a usable, validated config in one pass while preserving deterministic behavior and existing architecture boundaries.

## Scope

### In Scope

- Source selection during init: existing directory, URL, or new empty directory.
- Auto-discovery of layer candidates based on `.github` directories in a metadata tree.
- URL mode clone support into a default local path (`.ai/<repoName>/`) with optional override.
- Empty mode scaffold generation with minimal example layer layout.
- Shared implementation contracts to keep CLI and extension behavior aligned.
- Tests for discovery, clone error handling, scaffold creation, and config output correctness.
- User-facing docs updates for CLI and extension setup flow.

### Out of Scope

- Full multi-repo (`metadataRepos` + `layerSources`) authoring during init.
- Automatic remote push, branch creation, or PR workflows.
- Advanced interactive tree pickers for manually reordering discovered layers (MVP uses deterministic ordering).
- Watch-mode or apply-mode behavior changes beyond consuming the generated config.

## Constraints

- Keep generated output compatible with existing `MetaFlowConfig` schema and validator.
- Preserve existing `init` behavior for non-interactive automation via explicit flags.
- Keep core discovery logic in shared package code (not duplicated between CLI and extension).
- Maintain deterministic layer ordering across platforms (Windows/macOS/Linux path differences normalized).
- Handle missing `git` or clone failures with actionable errors and no partial corrupt config writes.
- Follow TypeScript strict mode and existing test conventions.

## Dependencies

- `git` executable required for URL mode.
- Existing config validation APIs in `packages/engine/src/config/configLoader.ts`.
- Existing command surfaces:
  - CLI: `packages/cli/src/commands/init.ts`
  - Extension: `src/src/commands/initConfig.ts`
- Documentation updates:
  - `packages/cli/README.md`
  - `src/README.md`

## Owners

- Primary: TBD
- Reviewers: Engine maintainer + CLI maintainer + Extension maintainer

## Phase Plan

| Phase | Document | Outcome |
|---|---|---|
| 1 | `Phase1-Contracts-And-Discovery.md` | Shared source/discovery contracts and deterministic layer enumeration |
| 2 | `Phase2-CLI-Source-Aware-Init.md` | CLI `init` supports source selection, clone/scaffold, config generation |
| 3 | `Phase3-Extension-Source-Aware-Init.md` | VS Code init command supports equivalent source flow and validations |
| 4 | `Phase4-Validation-And-Docs.md` | Tests, docs, and rollout safeguards completed |

## Success Criteria

- Users can initialize from all 3 source modes without manual JSON edits for basic operation.
- Generated config validates via existing validator and works with `status`/`preview`/`apply`.
- CLI and extension produce equivalent config semantics for equivalent user input.
- Deterministic layer ordering is documented and covered by tests.
- Documentation includes at least one example per source mode.
