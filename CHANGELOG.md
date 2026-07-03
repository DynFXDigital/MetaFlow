# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## [Unreleased]

### Added

- Plugin-based capability delivery for instructions, skills, and agents, so teams can package shared metadata as discoverable Copilot plugins instead of relying only on settings paths or synchronized files.
- Guided capability authoring and plugin manifest maintenance, including commands to scaffold capability metadata, repair plugin manifests, and sweep a metadata repository for packaging issues.
- Governance and diagnostics visibility for required capabilities, profile constraints, missing metadata sources, duplicate effective files, and plugin metadata problems, including a discoverable agent tool for reading the diagnostics snapshot.
- Smoother metadata repository setup, including automatic migration for older preview configs and better support for local git-backed metadata repositories.
- Richer tree exploration with folder branch toggles, browse-only artifact folders and files, native filtering, safer expand-all behavior, and direct opening of raw capability manifests.
- Bundled GitHub Copilot metadata-authoring guidance in the built-in MetaFlow capability.
- Codex operator walkthrough covering preview, adapter readiness, guarded native outputs, package marketplace export, and runtime-validation evidence.
- Codex target support reports in both the CLI and VS Code extension for reviewing target capability support, runtime-only boundaries, and unsupported surfaces.
- Target-aware CLI lifecycle output for `status`, `validate`, `apply`, and `clean`, including target support summaries and target-labeled mutation rows.
- Target adapter validation now warns when a capability declares multiple enabled adapters for the same target, preventing ambiguous Codex or Copilot projection policy.
- Canonical `.metaflow/capability.json` target declarations can now include support posture, required policy grants, validation evidence, and review notes for Codex and other target adapters.

### Changed

- New workspaces start with plugin-first defaults for instructions, skills, and agents, while prompts and hooks continue to use the delivery modes currently supported by the host.
- Initializing MetaFlow now enables the bundled MetaFlow guidance automatically, so a fresh workspace has useful authoring guidance immediately after setup.
- Injection choices can now be set globally, per metadata repository, or per capability, with workspace/user scope choices for settings-backed metadata.
- Synchronized files can keep their original source-relative names when there is no naming conflict.
- Capabilities tree folder rows now report deterministic mixed-branch state: checked means all descendants enabled, while unchecked covers partial and fully disabled branches.
- Capabilities now enable or disable atomically; artifact folders under a capability are browse-only instead of partial activation toggles.
- Capabilities and Effective Files view layouts now persist in `.metaflow/state.json` instead of VS Code settings, with hierarchical Capabilities and flat Effective Files as the defaults.
- Built-in and configured repositories now behave more consistently in hierarchy, checkbox, refresh, and details workflows.

### Fixed

- Tree search and filtering are more reliable in large capability and effective-file trees.
- Plugin maintenance now avoids disturbing unrelated Copilot repository configuration, cleans up stale plugin roots during apply, and lets warning rows open the source file that needs attention.
- Capability discovery and details refreshes are more stable for missing paths, CAPABILITY-only folders, built-in capability ordering, and toggle-driven updates.

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
