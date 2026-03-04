# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## [0.2.0-preview.0] - 2026-03-03

### Added

- Starter AI metadata scaffolding command in the extension.
- Extension-shipped starter metadata templates under `src/assets/metaflow-ai-metadata/`.
- Additional unit and integration coverage for scaffolding behavior.
- Built-in MetaFlow capability mode persisted in extension workspace state with synthetic source/layer projection.
- `MetaFlow: Remove MetaFlow Capability` command for disabling built-in mode and removing tracked materialized capability files.

### Changed

- Minor version bump across workspace packages.
- Renamed command surface to `MetaFlow: Initialize MetaFlow Capability` with two setup paths: materialize (overwrite managed files) and built-in settings-only mode.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`

## [0.1.0] - 2026-02-07

### Added

- Initial MetaFlow extension release with deterministic overlay resolution, apply/preview/clean workflows, profile/layer management, and diagnostics.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`