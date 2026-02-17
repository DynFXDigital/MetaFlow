# Changelog

All notable changes to the MetaFlow extension will be documented in this file.

## [0.1.0] — 2026-02-07

### Added

- **Config Model**: JSONC-tolerant config loading, discovery, and validation for `.metaflow.json`.
- **Overlay Engine**: Deterministic layer resolution with later-wins precedence; single-repo and multi-repo modes.
- **Filter Engine**: Include/exclude glob pattern evaluation (exclude wins).
- **Profile Engine**: Enable/disable pattern application per profile.
- **Classifier**: Artifact classification as `settings` or `materialized` per injection mode.
- **Provenance Header**: Machine-readable HTML comment blocks with SHA-256 content hashing.
- **Managed State**: Persistent `.ai/.sync-state/overlay_managed.json` for tracking applied files.
- **Drift Detector**: Content-hash comparison for in-sync/drifted/missing/untracked classification.
- **Materializer**: Apply/clean/preview workflows with drift protection and stale-file removal.
- **Settings Injector**: Computes VS Code settings entries for Copilot alternate-path injection.
- **10 Commands**: refresh, preview, apply, clean, status, switchProfile, toggleLayer, openConfig, initConfig, promote.
- **4 TreeView Providers**: Config summary, profiles, layers, effective files.
- **Status Bar**: Profile + file count display with idle/loading/error/drift states.
- **Output Channel**: Timestamped structured logging with configurable verbosity.
- **Config Diagnostics**: Problems panel integration for config validation errors.
- **111 Unit Tests** + **21 Integration Tests** — all passing.
- **Full Traceability Documentation**: SRS, SDD, TCS, FTD, FTR, VSRS, VTC, VTP, VTR.
