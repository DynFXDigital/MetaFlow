# Changelog

## 0.4.3

### Added

- Search capabilities using their metadata and restore built-in capability search behavior.

### Improved

- Make capability and plugin maintenance explicit, portable, and defensive about plugin component directories.
- Use README-backed capability descriptors and authoritative plugin manifests throughout the extension surface.

### Fixed

- Scope capability diagnostics to active selections so inactive overlaps stay silent.

## 0.4.2

### Added

- Native VS Code contribution support for the built-in MetaFlow capability, including the MetaFlow chat participant and independent capability toggles.
- First-class plugin command support for built-in metadata authoring.

### Fixed

- Keep nested built-in capabilities out of root artifact rows and avoid flattening their workspace metadata.
- Remove legacy flattened synchronized files when the built-in workspace projection is refreshed.

## 0.4.1

### Fixed

- Normalize the stable changelog after the v0.4.0 promotion.

## 0.4.0

### Patch Changes

- 34bb1fb: Clarify capability-unit documentation requirements and refresh compatible workspace dependencies for beta testing.

### Patch Changes

- 278c58d: Improve prerelease reliability by validating plugin hook script paths, preserving initial empty applies and missing-profile fallbacks, preferring portable relative repository paths, excluding bundled metadata from Git setup prompts, and refreshing dependencies with current security fixes.

### Patch Changes

- 592da89: Apply the configuration and repository-state fixes merged from develop.

### Patch Changes

- 9024dc6: Improve prerelease readiness by keeping capability summaries truthful while loading, preserving disabled repository roots in the Layers view, applying bundled agent-plugin hooks consistently, and clarifying capability authoring documentation structure.

### Patch Changes

- 773f9b9: Improve refresh responsiveness by avoiding redundant Git/network work, coalescing refresh bursts, skipping unchanged synchronization writes, reusing overlay resolution work, and trimming unused extension assets.

### Patch Changes

- 1941a2b: Expose the plugin injection mode for hooks in the user settings schema and make it the default.

### Patch Changes

- 44dc4e9: Support GitHub Copilot agent plugin hooks as a first-class plugin injection artifact, including hook-only capabilities and settings-backed compatibility.

### Patch Changes

- Prepare the 0.3.2 prerelease with prerelease branch CI and non-redundant release gating.

### Patch Changes

- Prepare the 0.3.1 prerelease with capability search and plugin metadata maintenance fixes.

### Minor Changes

- 8bbae64: Prepare the 0.3.0 prerelease lane for preview extension publishing.

### Added

- Folder branch checkboxes in the Capabilities tree for enabling or disabling all descendant capabilities in tree mode.
- Browse-only artifact folders and files beneath Capabilities tree artifact rows, using user-facing metadata names and tooltip details when available.

### Changed

- Folder rows in the Capabilities tree now expose deterministic mixed-branch status in descriptions and tooltips while artifact-type rows remain browse-only.
- Tree view layout state now persists in `.metaflow/state.json` instead of VS Code settings, with tree mode as the default for Capabilities and flat mode as the default for Effective Files.

## 0.1.0

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
