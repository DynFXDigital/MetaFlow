# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## 0.4.1

### Documentation

- Clarified the user-facing release notes for MetaFlow 0.4. Extension behavior is unchanged.

## 0.4.0

### Highlights

- Package and share instructions, skills, and agents as discoverable Copilot
  plugins instead of managing each file path by hand.
- Create and maintain capabilities with guided commands that help scaffold
  metadata and keep plugin manifests in shape.
- Find and understand your capabilities more easily with improved navigation,
  filtering, folder controls, and direct access to their source manifests.
- Start new workspaces with useful built-in MetaFlow authoring guidance already
  available.

### More control over your metadata

- Choose how metadata is delivered globally, per repository, or per capability,
  including where settings-backed metadata is stored.
- Keep familiar source-relative filenames when MetaFlow can do so safely.
- Turn whole capabilities on or off with predictable folder states, while still
  browsing the files they contain.

### Smoother day-to-day use

- Search and filtering are more reliable in larger capability and effective-file
  trees.
- Plugin maintenance avoids disturbing unrelated Copilot configuration and
  makes it easier to open the source of a warning.
- Capability discovery, refresh, and details remain dependable when metadata is
  incomplete or changes while you work.

See the [MetaFlow 0.4.0 release notes](docs/releases/v0.4.0.md) for the concise update summary.

## 0.1.0

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

## 0.1.0

### Added

- Initial MetaFlow extension release with layered overlay resolution, apply/preview/clean workflows, profile/layer management, and diagnostics.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`
