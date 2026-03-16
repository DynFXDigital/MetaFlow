# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## [Unreleased]

### Added

- Capabilities tree folder checkboxes for branch-wide enable or disable operations in tree mode.
- Browse-only artifact folders and files beneath Capabilities tree artifact rows, with friendly labels and metadata tooltips.

### Changed

- Capabilities tree folder rows now report deterministic mixed-branch state: checked means all descendants enabled, while unchecked covers partial and fully disabled branches.

## [0.1.0-preview.0] - 2026-03-03

### Added

- Starter AI metadata scaffolding command in the extension.
- Extension-shipped starter metadata templates under `src/assets/metaflow-ai-metadata/`.
- Additional unit and integration coverage for scaffolding behavior.
- Built-in MetaFlow capability mode persisted in extension workspace state with synthetic source/layer projection.
- `MetaFlow: Remove MetaFlow Capability` command for disabling built-in mode and removing tracked synchronized capability files.
- Capability Details Webview (`metaflow.openCapabilityDetails`): browse capability metadata, artifact inventory, and manifest from the tree view.
- METAFLOW.md repository manifest support for human-readable repository names and descriptions.
- YAML front-matter parser with instruction scope and `applyTo` metadata in FilesTreeView tooltips.
- `.gitignore` management prompts for MetaFlow managed state on activation.
- Git remote promotion: offer to convert local-path sources to git-backed tracking during setup.
- Repository-level copy updated to describe layered AI metadata overlays without positioning repeatability as primary marketing language.
- Settings injection for agents, skills, and hooks artifact types.

### Changed

- Minor version bump across workspace packages.
- Renamed command surface to `MetaFlow: Initialize MetaFlow Capability` with two setup paths: synchronize (overwrite managed files) and built-in settings-only mode.
- Narrowed extension activation scope to `workspaceContains:**/.metaflow/config.jsonc` only.
- Hardened refresh error handling: overlay failures surface user-visible errors, clear stale state, and guard auto-apply.
- Standardized destructive confirmation prompts with explicit action-verb labels.
- Capability discovery now persists found capabilities as disabled until explicitly enabled.

### Fixed

- Repo enable/disable toggle in Config TreeView.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`

## [0.1.0] - 2026-02-07

### Added

- Initial MetaFlow extension release with layered overlay resolution, apply/preview/clean workflows, profile/layer management, and diagnostics.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`
