# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## 0.4.8

### Added

- Add three-state Agent Plugins v1 disposition, repository-wide conformance reporting, explicit migration planning, and standard-first lossless plugin scaffolding while preserving legacy GitHub Copilot metadata.

### Changed

- Gate repository-wide `.github/copilot-instructions.md` synchronization behind explicit workspace consent and expose migration and retained-ownership state through the engine, CLI, and extension.

## 0.4.7

### Added

- Add standards-backed Agent Plugins and Agent Skills authoring guidance with pinned specification, schema, and license references.
- Recognize strict Agent Plugins v1 packages and report compatibility diagnostics without treating host-specific plugin layouts as portable packages.

### Changed

- Preserve recognized Agent Plugins v1 packages during metadata maintenance, including valid components and non-fatal standard diagnostics.
- Keep portable plugin identities separate from human-readable display names and prefer stable repository labels and identities over incidental local folder names.
- Coalesce background refreshes with explicit requests so maintenance-skipping refreshes retain their policy until explicit maintenance is requested, while GUI completion waits for the complete refresh batch.

### Fixed

- Validate skill directories and filesystem-resolved package paths before inspection so outside-root links cannot be enumerated as package content.
- Derive new repository identifiers and display names from Git URLs or selected directories while preserving legacy migration identities.

## 0.4.6

### Added

- Add explicit, workspace-scoped consent for synchronizing repository-wide Copilot instructions.
- Expose repository policy, migration, and retained-ownership state through the engine, CLI, and extension.

### Fixed

- Complete the round trip from VS Code workspace settings to `.metaflow/config.jsonc`, including setting resets and resource-scoped changes.
- Keep metadata maintenance opt-in and prevent upgrade prompts from blocking later settings refreshes.

## 0.4.5

### Fixed

- Canonicalize plugin and marketplace metadata serialization so equivalent manifests produce stable JSON output.
- Keep marketplace-level README files out of capability discovery and metadata loading.

## 0.4.4

### Fixed

- Marketplace-level README files are no longer surfaced as toggleable MetaFlow capabilities.

## 0.4.3

### Highlights

- Capability manifests are now authoritative for capability metadata, with capability descriptors documented in README files.
- Capability search follows metadata and built-in capability search is restored.

### Improved

- Capability and plugin maintenance is more explicit, portable, and defensive about plugin component directories.

### Fixed

- Capability diagnostics are scoped to active selections, so inactive capability overlaps do not produce active warnings.

### Maintenance

- Refreshed compatible dependencies and stabilized the prerelease CI and release validation lanes.

## 0.4.2

### Highlights

- Added first-class plugin command support, including command classification and a bundled metadata review command.
- Exposed built-in MetaFlow capabilities through native VS Code contribution points, including the MetaFlow chat participant and independently toggleable authoring capabilities.

### Fixed

- Kept built-in metadata out of workspace settings and plugin-location configuration when native contributions are active.
- Corrected capability tree grouping so nested capability metadata does not appear beneath root instruction or other artifact nodes.
- Prevented workspace synchronization from flattening nested capability assets and cleaned up legacy flattened files during resynchronization.

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
