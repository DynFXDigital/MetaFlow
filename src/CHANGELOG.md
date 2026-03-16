# Changelog

## Unreleased

### Added

- Folder branch checkboxes in the Capabilities tree for enabling or disabling all descendant capabilities in tree mode.
- Browse-only artifact folders and files beneath Capabilities tree artifact rows, using user-facing metadata names and tooltip details when available.

### Changed

- Folder rows in the Capabilities tree now expose deterministic mixed-branch status in descriptions and tooltips while leaving leaf capability and artifact-type toggles unchanged.

## 0.1.0-preview.0

### Minor Changes

- Bump minor versions for engine, CLI, and extension packages.

### Added

- MetaFlow capability setup commands:
    - `MetaFlow: Initialize MetaFlow Capability`
    - `MetaFlow: Remove MetaFlow Capability`
- Extension-shipped MetaFlow AI metadata templates under `src/assets/metaflow-ai-metadata/.github/` (instructions, prompts, skills, agents).
- Built-in capability mode persisted in extension workspace state and projected as synthetic source/layer nodes.
- Capability Details Webview: open capability metadata, artifact inventory, warnings, and manifest from the Capabilities TreeView via `MetaFlow: View Capability Details` command.
- METAFLOW.md repository manifest support: repository-level name and description surfaced in tree views and tooltips.
- YAML front-matter parser for instruction files; scope and `applyTo` metadata displayed in FilesTreeView tooltips.
- Enhanced tooltips in Files and Layers TreeView with capability details, skill metadata, and stable ordering.
- Profile controls and metadata scope summaries in Config TreeView.
- `.gitignore` management: automatic prompts to ignore `.metaflow/` or `.metaflow/state.json` on activation.
- Git remote promotion: offer to convert local-path repository sources to git-backed tracking.
- User-facing repository display labels throughout tree views and tooltips.
- Settings injection for agents, skills, and hooks via `chat.agentFilesLocations`, `chat.agentSkillsLocations`, and `chat.hookFilesLocations`.
- Config watcher suppression during internal apply operations to avoid re-entrant refreshes.
- Integration and unit coverage for capability setup, built-in mode, synthetic layer behavior, and all new features.

### Changed

- Narrowed activation scope: extension now activates only on `workspaceContains:**/.metaflow/config.jsonc` (removed `onStartupFinished`).
- Hardened refresh error handling: overlay resolution failures now surface user-visible error messages, clear stale state, and guard auto-apply.
- Standardized destructive confirmation prompts with explicit action-verb labels and modal warnings.
- Capability discovery persists found capabilities as disabled until explicitly enabled.

### Fixed

- Repo enable/disable toggle in Config TreeView now correctly updates configuration.

All notable changes to the MetaFlow extension will be documented in this file.

## [0.1.0] — 2026-02-07

### Added

- **Config Model**: JSONC-tolerant config loading, discovery, and validation for `.metaflow/config.jsonc`.
- **Overlay Engine**: Layer resolution with later-wins precedence; single-repo and multi-repo modes.
- **Filter Engine**: Include/exclude glob pattern evaluation (exclude wins).
- **Profile Engine**: Enable/disable pattern application per profile.
- **Classifier**: Artifact classification as `settings` or `synchronized` per injection mode.
- **Provenance Header**: Machine-readable HTML comment blocks with SHA-256 content hashing.
- **Managed State**: Persistent `.metaflow/state.json` for tracking applied files.
- **Drift Detector**: Content-hash comparison for in-sync/drifted/missing/untracked classification.
- **Synchronization Engine**: Apply/clean/preview workflows with drift protection and stale-file removal.
- **Settings Injector**: Computes VS Code settings entries for Copilot alternate-path injection.
- **16 Commands**: refresh, preview, apply, clean, status, switchProfile, toggleLayer, toggleRepoSource, addRepoSource, removeRepoSource, rescanRepository, openConfig, initConfig, promote, toggleFilesViewMode, toggleLayersViewMode.
- **4 TreeView Providers**: Config summary, profiles, layers, effective files.
- **Status Bar**: Profile + file count display with idle/loading/error/drift states.
- **Output Channel**: Timestamped structured logging with configurable verbosity.
- **Config Diagnostics**: Problems panel integration for config validation errors.
- **173 Unit Tests** + **43 Integration Tests** — all passing.
- **Full Traceability Documentation**: SRS, SDD, TCS, FTD, FTR, VSRS, VTC, VTP, VTR.
