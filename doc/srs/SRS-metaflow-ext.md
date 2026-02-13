# SRS — Software Requirements Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| SRS-metaflow-ext | MetaFlow VS Code Extension | TBD | Draft |

| Last Updated | Notes |
|---|---|
| 2026-02-07 | Initial draft — Phase 0 |

## Purpose

This document is the source of truth for `REQ-####` requirements for the MetaFlow VS Code extension. MetaFlow implements the AI Metadata Overlay Sync System Reference Architecture as a pure TypeScript VS Code extension, providing deterministic overlay resolution, materialization with provenance, and a focused UI for profile/layer management.

Traceability is maintained in downstream docs (SDD/TCS/FTD/FTR) via back-links to `REQ-*`.

## Scope

- In scope:
  - Config management (`.ai-sync.json` loading, validation, diagnostics)
  - Overlay engine (layer resolution, filtering, profiles, classification)
  - Materialization (apply, clean, provenance, managed state, drift detection)
  - Extension UI (TreeViews, status bar, output channel, commands)
  - Settings injection (Copilot alternate paths for live-referenced artifacts)
  - Determinism guarantees

## Non-goals

- Out of scope:
  - Python CLI or subprocess integration
  - File-watcher auto-sync (deferred to v2)
  - Git automation for promotion (detection only in v1)
  - Multi-root workspace support (v1 assumes single root)
  - Marketplace publishing (local VSIX first)

## Requirements

Notes:
- `Enforcement` indicates when a requirement must be satisfied: `Phase-1` through `Phase-4`, or `Future`.
- Requirements are grouped by category for readability. ID ranges are reserved per category.

### Configuration Management (REQ-0001 – REQ-0099)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0001 | Config discovery | Discover `.ai-sync.json` at workspace root, falling back to `.ai/.ai-sync.json`. | Phase-1 | Given both files exist, the root-level file is used; given only fallback exists, fallback is used; given neither exists, extension reports no config. | | P1 | Draft |
| REQ-0002 | JSONC tolerant parsing | Parse config files with support for JSON comments and trailing commas. | Phase-1 | A config file containing `//` comments and trailing commas parses successfully. | Uses `jsonc-parser` | P1 | Draft |
| REQ-0003 | Config schema validation | Validate config against the reference schema; reject configs missing required fields. | Phase-1 | Missing `metadataRepo` or `layers` produces a validation error with field name. | | P1 | Draft |
| REQ-0004 | Config diagnostics | Report JSON parse errors and schema violations via VS Code diagnostic collection with line/column positions. | Phase-1 | Parse errors appear in the Problems panel at the correct line. | | P1 | Draft |
| REQ-0005 | Path resolution | Resolve `localPath` in config relative to workspace root; support both absolute and relative paths. | Phase-1 | A relative `localPath` resolves to `<workspace>/<localPath>`; an absolute path is used as-is. | | P1 | Draft |
| REQ-0006 | Multi-repo config | Support `metadataRepos` array with unique `id` fields; all `layerSources.repoId` must reference a valid repo ID. | Phase-1 | A config with two repos and valid `layerSources` parses successfully; an invalid `repoId` produces a diagnostic. | | P2 | Draft |
| REQ-0007 | Single-repo fallback | When only `metadataRepo` and `layers` are provided (no `metadataRepos`), all layers resolve from that single repo. | Phase-1 | A config with `metadataRepo` + `layers` (no `layerSources`) resolves all layers from the single repo path. | | P1 | Draft |
| REQ-0008 | Config reload | Reload configuration when the user invokes `metaflow.refresh` or when `.ai-sync.json` is modified. | Phase-4 | After editing `.ai-sync.json`, invoking refresh updates all views to reflect new config. | | P2 | Draft |

### Overlay Engine (REQ-0100 – REQ-0199)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0100 | Layer resolution order | Resolve layers in the order specified by the `layers` array (single-repo) or `layerSources` array (multi-repo); later layers override earlier ones for same-path files. | Phase-2 | Given layers A and B (in order) both containing `instructions/foo.md`, the effective file comes from B. | | P1 | Draft |
| REQ-0101 | Cross-repo layer precedence | When `layerSources` spans multiple repos, the `layerSources` array order is the global precedence. | Phase-2 | Given `layerSources` [repo1/layerA, repo2/layerB], files from layerB override layerA. | | P1 | Draft |
| REQ-0102 | Include filtering | Apply `filters.include` glob patterns; only matching files pass through. | Phase-2 | Given `include: ["instructions/**"]`, only files under `instructions/` are in the effective set. | | P1 | Draft |
| REQ-0103 | Exclude filtering | Apply `filters.exclude` glob patterns; matching files are removed from the effective set. | Phase-2 | Given `exclude: ["agents/experimental/**"]`, files under that path are excluded. | | P1 | Draft |
| REQ-0104 | Exclude wins over include | When a file matches both include and exclude patterns, exclude takes precedence. | Phase-2 | A file matching both `include: ["**"]` and `exclude: ["agents/**"]` is excluded. | | P1 | Draft |
| REQ-0105 | Profile activation | Apply the active profile's `enable`/`disable` patterns to the filtered file set. | Phase-2 | Switching from `baseline` (enable all) to `lean` (disable `agents/**`) removes agent files from effective set. | | P1 | Draft |
| REQ-0106 | Profile disable wins | When a file matches both `enable` and `disable` in the same profile, `disable` wins. | Phase-2 | A file matching both `enable: ["*"]` and `disable: ["agents/**"]` is disabled. | | P1 | Draft |
| REQ-0107 | No profile = all enabled | When no profile is active or the active profile is empty, all filtered files are enabled. | Phase-2 | With `activeProfile` unset, the full filtered file set is the effective set. | | P1 | Draft |
| REQ-0108 | Artifact classification | Classify each effective file as `live-ref` or `materialized` based on artifact type and injection config. | Phase-2 | Instructions classify as `live-ref`; skills classify as `materialized` (or `live-ref` if injection override is set). | | P1 | Draft |
| REQ-0109 | Classification override | Support per-artifact-type injection mode override via `injection` config field. | Phase-2 | Setting `injection.skills: "settings"` changes skills classification from `materialized` to `live-ref`. | | P2 | Draft |
| REQ-0110 | Deterministic resolution | Same config + same metadata file set always produces identical `OverlayResult`. | Phase-2 | Running resolution twice with identical inputs produces byte-identical output. | | P1 | Draft |
| REQ-0111 | Empty layer handling | An empty layer directory contributes no files but does not cause errors. | Phase-2 | A layer pointing to an empty directory produces no effective files from that layer. | | P2 | Draft |
| REQ-0112 | Nested directory support | Layer resolution preserves the relative directory structure within each layer. | Phase-2 | A layer containing `instructions/sub/foo.md` produces an effective file at `instructions/sub/foo.md`. | | P1 | Draft |

### Materialization & Provenance (REQ-0200 – REQ-0299)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0200 | Apply materialized files | Write files classified as `materialized` to `.github/` with `_shared_` prefix. | Phase-3 | After apply, `.github/skills/_shared_foo.md` exists for a materialized skill. | | P1 | Draft |
| REQ-0201 | Provenance header injection | Inject machine-readable provenance comment into every materialized file. | Phase-3 | Every materialized file starts with an HTML comment containing `synced: true`, `source-repo`, `source-commit`, `content-hash`. | | P1 | Draft |
| REQ-0202 | Provenance round-trip | Provenance headers can be written and parsed back; write → parse → compare yields identity. | Phase-3 | Parsing a written provenance header returns the same field values. | | P1 | Draft |
| REQ-0203 | Managed state tracking | After apply, persist a managed-state JSON recording file paths and content hashes. | Phase-3 | `.ai/.sync-state/overlay_managed.json` exists after apply with entries for all materialized files. | | P1 | Draft |
| REQ-0204 | Content hash computation | Compute SHA-256 hash of file content (after provenance header removal) for managed state. | Phase-3 | Hash is stable and matches manual SHA-256 computation of the same content. | | P1 | Draft |
| REQ-0205 | Drift detection | Compare current file content hash against managed-state hash to detect local edits. | Phase-3 | A locally-edited managed file is classified as `drifted`. | | P1 | Draft |
| REQ-0206 | Block overwrite of drifted files | Refuse to overwrite files detected as drifted; warn the user instead. | Phase-3 | Apply skips a drifted file and emits a warning naming the file. | | P1 | Draft |
| REQ-0207 | Clean managed files | Remove all managed files that are still in-sync (hash matches). | Phase-3 | After clean, all in-sync managed files are deleted; managed state is cleared. | | P1 | Draft |
| REQ-0208 | Clean warns about drift | During clean, drifted files are not deleted; a warning is emitted. | Phase-3 | A drifted managed file survives clean and a warning names it. | | P1 | Draft |
| REQ-0209 | Preview without writing | Preview returns the effective file list and pending changes (add/update/skip/remove) without modifying the file system. | Phase-3 | Preview produces a diff summary; no files are created or deleted. | | P1 | Draft |
| REQ-0210 | Deterministic apply | Running apply twice with identical inputs produces identical file system state. | Phase-3 | Two consecutive applies with no config change result in identical managed files and state. | | P1 | Draft |
| REQ-0211 | Settings injection for live-ref | Inject VS Code settings entries pointing to live-referenced directories (instructions, prompts, skills, agents, hooks). | Phase-3 | After apply, VS Code settings contain alternate-path entries for live-ref artifact directories. | | P2 | Draft |
| REQ-0212 | Settings removal on clean | Remove injected VS Code settings entries during clean. | Phase-3 | After clean, previously injected settings entries are removed. | | P2 | Draft |

### Extension UI (REQ-0300 – REQ-0399)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0300 | Activation on config | Activate extension when workspace contains `.ai-sync.json` or `.ai/.ai-sync.json`. | Phase-4 | Opening a workspace with `.ai-sync.json` activates the extension and registers commands. | | P1 | Draft |
| REQ-0301 | Activation on command | Activate extension when any `metaflow.*` command is invoked. | Phase-4 | Invoking `metaflow.initConfig` activates the extension even without existing config. | | P1 | Draft |
| REQ-0302 | Graceful no-config | When no config is found, display welcome content in sidebar and register `initConfig` command. | Phase-4 | Without config, sidebar shows "No configuration found" with init action. | | P1 | Draft |
| REQ-0303 | Profiles TreeView | Display named profiles with active indicator; click to switch. | Phase-4 | Profiles TreeView shows all profiles; active profile has a check icon. | | P2 | Draft |
| REQ-0304 | Layers TreeView | Display ordered layers with enable/disable checkbox state. | Phase-4 | Layers TreeView shows layers in config order; toggling a checkbox updates config. | | P2 | Draft |
| REQ-0305 | Files TreeView | Display effective files grouped by classification (settings-linked vs materialized), preserving relative folder hierarchy and annotating each file with source label + realization mode. | Phase-4 | Files TreeView shows two groups with correct file count; nested folders mirror relative paths; leaf items display source label and `(settings|materialized)`. | | P2 | Draft |
| REQ-0306 | Config TreeView | Display config summary (metadata repo, commit, injection modes). | Phase-4 | Config TreeView shows repo URL and current commit. | | P3 | Draft |
| REQ-0307 | Status bar | Display `MetaFlow: <profile> (<N> files)` with state indicator. | Phase-4 | Status bar shows current profile name and file count; changes on profile switch. | | P2 | Draft |
| REQ-0308 | Output channel | Log structured messages with timestamp and severity to dedicated output channel. | Phase-4 | Messages appear in MetaFlow output channel with `[INFO]`/`[WARN]`/`[ERROR]` prefixes. | | P2 | Draft |
| REQ-0309 | Progress indicator | Show progress during long operations (apply, clean). | Phase-4 | Apply shows a progress notification that completes when the operation finishes. | | P2 | Draft |
| REQ-0310 | Activity bar container | Register a dedicated activity-bar icon with all four TreeViews. | Phase-4 | MetaFlow icon appears in activity bar; clicking it shows the sidebar container. | | P2 | Draft |

### Commands (REQ-0400 – REQ-0499)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0400 | Refresh command | `metaflow.refresh` reloads config, re-resolves overlay, and updates all views. | Phase-4 | After config edit + refresh, TreeViews reflect updated config. | | P1 | Draft |
| REQ-0401 | Preview command | `metaflow.preview` shows effective tree and pending diffs in output channel. | Phase-4 | Preview output lists files grouped by classification with pending action (add/update/skip). | | P1 | Draft |
| REQ-0402 | Apply command | `metaflow.apply` materializes required files with progress indicator. | Phase-4 | Apply creates/updates materialized files and updates managed state. | | P1 | Draft |
| REQ-0403 | Clean command | `metaflow.clean` removes managed files with confirmation prompt. | Phase-4 | Clean prompts for confirmation, then removes in-sync managed files. | | P1 | Draft |
| REQ-0404 | Status command | `metaflow.status` shows layer/profile/commit state in output channel. | Phase-4 | Status output displays metadata repo, active profile, layer count, and managed file count. | | P2 | Draft |
| REQ-0405 | Switch profile command | `metaflow.switchProfile` presents quick-pick of profiles and updates `activeProfile` in config. | Phase-4 | After selecting a profile, `.ai-sync.json` is updated and views refresh. | | P1 | Draft |
| REQ-0406 | Toggle layer command | `metaflow.toggleLayer` toggles a layer's enabled state and updates config. | Phase-4 | After toggling, the layer's state changes in config and TreeView updates. | | P2 | Draft |
| REQ-0407 | Open config command | `metaflow.openConfig` opens `.ai-sync.json` in the editor. | Phase-4 | The config file opens in an editor tab. | | P3 | Draft |
| REQ-0408 | Init config command | `metaflow.initConfig` scaffolds a new `.ai-sync.json` at workspace root. | Phase-4 | A valid starter `.ai-sync.json` is created if none exists; no-op if one already exists. | | P2 | Draft |
| REQ-0409 | Promote command | `metaflow.promote` detects drifted files and shows a drift report. | Phase-4 | Promote lists all drifted managed files with their drift status. | Detection only in v1 | P2 | Draft |

### Settings Injection (REQ-0500 – REQ-0599)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0500 | Instruction path injection | Inject Copilot instruction alternate-path setting pointing to live-ref instructions directory. | Phase-3 | After apply, the relevant VS Code setting contains the instructions directory path. | | P2 | Draft |
| REQ-0501 | Prompt path injection | Inject Copilot prompt alternate-path setting pointing to live-ref prompts directory. | Phase-3 | After apply, the relevant VS Code setting contains the prompts directory path. | | P2 | Draft |
| REQ-0502 | Skills path injection | Inject Copilot skills alternate-path setting when injection mode is `settings`. | Phase-3 | After apply with `injection.skills: "settings"`, the skills path setting is populated. | Insiders only | P3 | Draft |
| REQ-0503 | Agents path injection | Inject Copilot agents alternate-path setting when injection mode is `settings`. | Phase-3 | After apply with `injection.agents: "settings"`, the agents path setting is populated. | Insiders only | P3 | Draft |
| REQ-0504 | Hooks path injection | Inject hook file paths into VS Code settings when hooks are configured and enabled. | Phase-3 | After apply with hooks configured, hook file paths are set in VS Code settings. | Insiders only | P3 | Draft |

### Determinism & Safety (REQ-0600 – REQ-0699)

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0600 | Deterministic output | Same config + same metadata file set always produces identical materialized outputs. | Phase-2 | Two independent runs with identical inputs produce byte-identical outputs. | Cross-cutting | P1 | Draft |
| REQ-0601 | No auto-commit | The extension never creates git commits or pushes changes. | Phase-4 | After any operation, `git status` shows no new commits. | | P1 | Draft |
| REQ-0602 | No secret access | The extension never reads or writes `.env` files, secrets, or credentials. | Phase-1 | Config loader rejects paths matching `.env*` patterns. | | P1 | Draft |
| REQ-0603 | Path traversal prevention | Validate all layer paths resolve within the metadata repo boundary. | Phase-2 | A layer path containing `../` that escapes the repo root is rejected with an error. | | P1 | Draft |

## Traceability (Policy)

- SRS does not include forward links to design (`DES-*`) or tests (`TC-*`).
- SDD maps `REQ-*` to design elements and code references.
- TCS/FTD define test cases and procedures that validate `REQ-*`.

## Conventions

- IDs are stable and never reused.
- ID ranges: 0001–0099 Config, 0100–0199 Overlay, 0200–0299 Materialization, 0300–0399 UI, 0400–0499 Commands, 0500–0599 Settings, 0600–0699 Safety.

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial draft — all requirements enumerated | AI |
