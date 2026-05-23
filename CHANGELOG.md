# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## [Unreleased]

### Added

- Plugin delivery mode for plugin-capable capabilities, including `plugin` injection configuration, local `chat.pluginLocations` registration, and plugin-first defaults for instructions, skills, and agents.
- Capability plugin metadata support: `agentPlugin` capability opt-in, `plugin.json` validation, normalized plugin catalog generation, `.github/plugin/marketplace.json` maintenance, and commands to maintain one capability or sweep every capability in a metadata repository.
- Automatic capability plugin metadata maintenance after configured metadata repository changes, with user-configurable idle delay and surfaced maintenance warnings.
- Capability authoring helpers for creating `CAPABILITY.md` from bundled contract guidance, seeded drafts, and example capability metadata.
- Governance contract loading, validation, compliance evaluation, tree-view signals, and capability-details signals for required/default-on capabilities, locked profiles, allowed profiles, and governance severity.
- Release-aware configuration migration that accepts preview-era `metadataRepo`, `layers`, and `layerSources` configs, rewrites them to `metadataRepos[*].capabilities`, persists the current `compatibilityVersion`, and reports migration notices.
- Local git-backed metadata repository authoring support, including optional `git init` bootstrapping for selected local directories without remotes.
- Agent-readable `metaflow.getDiagnosticsSnapshot` command and diagnostics for missing or inaccessible metadata sources, unresolved capability paths, duplicate effective paths, governance issues, and plugin metadata warnings.
- Native tree filter commands, bounded staged expansion, raw capability manifest opening, and directory-level `METAFLOW.md` metadata in Files and Layers views.
- Experimental capability markers in Capabilities and Effective Files views.
- Capabilities tree folder checkboxes for branch-wide enable or disable operations in tree mode.
- Browse-only artifact folders and files beneath Capabilities tree artifact rows, with friendly labels and metadata tooltips.
- Bundled GitHub Copilot metadata-authoring guidance in the built-in MetaFlow capability, with regression coverage to prevent exact `applyTo: "**"` instruction scopes.

### Changed

- Built-in MetaFlow capability initialization now auto-enables the bundled capability with plugin-first defaults and keeps the built-in repository recoverable when unchecked.
- Config normalization and settings injection now support repo-level and capability-level injection defaults, settings-backed injection target scopes, deterministic sorting, and safer settings cleanup.
- Synchronized output naming can preserve original source-relative filenames unless conflicts require disambiguation.
- Capabilities tree folder rows now report deterministic mixed-branch state: checked means all descendants enabled, while unchecked covers partial and fully disabled branches.
- Capabilities and Effective Files view layouts now persist in `.metaflow/state.json` instead of VS Code settings, with hierarchical Capabilities and flat Effective Files as the defaults.
- Built-in and configured repositories now have closer tree-view parity for hierarchy, checkbox behavior, details refresh, and source projection.

### Fixed

- Tree search and native filtering now preload the right levels, preserve focus, bound expansion work, stop at capability folders where appropriate, and restore Effective Files filtering behavior.
- Plugin maintenance no longer removes unrelated Copilot repository configuration, stale plugin roots are cleaned up during apply, and warning rows can open their source files.
- Missing or stale configured capability paths, CAPABILITY-only layer discovery, capability details refresh after toggles, and built-in ordering validation were stabilized.

## [0.1.0] - 2026-03-03

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
