# MetaFlow VS Code Extension — Concept Document

| Field | Value |
|---|---|
| **Document ID** | CONCEPT-METAFLOW-EXT |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-02-07 |
| **Owner** | TBD |

---

## Executive Summary

MetaFlow is a pure TypeScript VS Code extension that brings deterministic AI metadata overlay management directly into the editor. It implements the [MetaFlow Reference Architecture](metaflow_reference_architecture.md) without any external runtime dependencies (no external runtime, no CLI subprocess).

The extension enables teams to manage hierarchical, policy-driven AI metadata (GitHub Copilot instructions, prompts, skills, and custom agents) from a centralized canonical repository and selectively realize that metadata into consuming repositories. It provides a complete in-editor workflow: configuration, layer/profile management, preview, apply, clean, drift detection, and promotion awareness—all from VS Code's sidebar, command palette, and status bar.

**Key differentiators:**

- **Zero external dependencies** — pure TypeScript overlay engine embedded in the extension; no extra runtime or subprocess calls.
- **Deterministic rendering** — same config + same metadata commit always produces identical outputs.
- **Hybrid realization** — settings-based references for artifacts Copilot can load from alternate paths; materialization only where Copilot requires `.github/`.
- **Flexible repository sourcing** — support a single authoritative metadata repo or multiple layered repos (superlays) accessible across projects.
- **Provenance tracking** — every materialized file carries machine-readable provenance headers enabling audit, drift detection, and safe re-render.
- **Non-destructive by design** — managed state prevents overwriting local edits; promotion is always explicit.

---

## 1. Problem Statement

Modern software teams increasingly rely on GitHub Copilot and AI coding agents, which consume structured metadata (instructions, prompts, skills, agents) from well-known repository locations. As teams scale, managing this metadata becomes a governance challenge:

1. **Duplication** — identical instructions copied across dozens of repositories drift independently.
2. **No hierarchy** — there is no mechanism for company → department → team → product layering.
3. **Manual sync** — updates require manual copy-paste or ad-hoc scripts.
4. **No reversibility** — experiments with new prompts or agents risk polluting stable configurations.
5. **Copilot constraints** — until recently, skills and custom agents had to reside under `.github/`; newer VS Code builds now support alternate directories and hook file paths, which MetaFlow must leverage.

MetaFlow solves these problems by treating AI metadata as **compiled configuration**: authored centrally, composed through overlay layers, filtered per policy, activated via profiles, and rendered deterministically into each consuming repository.

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal | Measure |
|---|---|---|
| G-01 | Deliver a VS Code extension that fully implements the reference overlay engine | All reference architecture commands functional |
| G-02 | Deterministic overlay application and managed-state tracking | Same inputs produce identical outputs across runs |
| G-03 | Core UI surfaces for profiles, layers, and effective files | TreeViews + status bar + command palette operational |
| G-04 | Hybrid realization respecting Copilot artifact discovery rules | Instructions/prompts settings-backed; skills/agents settings or materialized; hooks via file paths |
| G-05 | Full traceability documentation (SRS → SDD → TCS → FTD → FTR) | Every REQ mapped to TC; every TC to procedure and result |
| G-06 | Comprehensive automated test suite alongside manual test procedures | ≥80% code coverage; manual procedures for UI validation |
| G-07 | Validation testing for end-to-end acceptance | VREQ/VTC/VTP/VTR documented |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|---|---|---|
| NG-01 | External-runtime CLI or subprocess integration | Eliminated by design; TypeScript-native engine |
| NG-02 | File-watcher auto-sync in v1 | Scope control; deferred to follow-up |
| NG-03 | Git automation for promotion | Detection-only in v1 (branch/commit/PR deferred) |
| NG-04 | Marketplace publishing in v1 | Local VSIX distribution first |
| NG-05 | Multi-root workspace support in v1 | Single workspace root assumed initially |

---

## 3. Architecture Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Config       │  │  Overlay     │  │  Materializer│  │
│  │  Loader       │──│  Engine      │──│  + Provenance│  │
│  │  + Diagnostics│  │  (Pure TS)   │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │               Command Handlers                     │  │
│  └──────┬─────────────────┬──────────────────┬───────┘  │
│         │                 │                  │           │
│  ┌──────┴───────┐  ┌─────┴──────┐  ┌───────┴────────┐  │
│  │  TreeView     │  │  Status    │  │  Settings      │  │
│  │  Providers    │  │  Bar       │  │  Injection     │  │
│  └──────────────┘  └────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐              ┌─────────────────────┐
│  .metaflow.json   │              │  .github/            │
│  (config)       │              │  (materialized out)  │
└─────────────────┘              └─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Metadata Repository        │
│  (local clone)              │
│  company/ dept/ team/ prod/ │
└─────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| **Config Loader** | Parse `.metaflow.json`, validate schema, resolve paths, emit diagnostics |
| **Config Diagnostics** | Report JSON parse errors and schema violations via VS Code diagnostics API |
| **Overlay Engine** | Deterministic layer resolution, filter evaluation, profile activation, artifact classification |
| **Materializer** | Write materialized files to `.github/`, inject provenance headers, maintain managed-state |
| **Command Handlers** | Wire engine + materializer to VS Code commands (preview, apply, clean, status, promote) |
| **TreeView Providers** | Render profiles, layers, effective files, and config in sidebar TreeViews |
| **Status Bar** | Display active profile, sync state, and quick-action buttons |
| **Settings Injection** | Configure VS Code settings for Copilot instruction/prompt/skills/agents directories and hook file paths |

### 3.3 Data Flow

1. **Load** — Config Loader reads `.metaflow.json` and resolves one or more metadata repository paths.
2. **Resolve** — Overlay Engine walks layers in precedence order, applies include/exclude filters, then activates the current profile's enable/disable patterns.
3. **Classify** — Each effective file is classified as either settings-backed (instructions, prompts, skills, agents, hooks) or materialized (when configured to materialize).
4. **Render** — Materializer writes classified files: settings-backed paths (including hook file paths) are injected into VS Code settings; materialized files are written to `.github/` with provenance headers and source-scoped prefixes.
5. **Track** — Managed-state file records content hashes for all materialized outputs.
6. **Display** — TreeViews and status bar reflect the current effective state.

---

## 4. Overlay Model

### 4.1 Layer Precedence (Low → High)

| Priority | Layer | Example Path |
|---|---|---|
| 1 (lowest) | Company | `company/.github/**` |
| 2 | Standards | `standards/<bundle>/.github/**` |
| 3 | Department | `department/<name>/.github/**` |
| 4 | Team | `team/<name>/.github/**` |
| 5 (highest) | Product / Repo | `product/<name>/.github/**` |

Higher-specificity layers override lower ones. This mirrors organizational policy flow.

### 4.2 Filtering

Path-based filtering occurs before profile activation:

```json
{
  "filters": {
    "include": ["instructions/**", "prompts/**"],
    "exclude": ["agents/experimental/**"]
  }
}
```

- Explicit `exclude` wins unless re-included at a higher-specificity layer.

### 4.3 Profiles

Named profiles control activation without modifying overlays:

```json
{
  "profiles": {
    "baseline": { "enable": ["*"] },
    "lean": { "disable": ["agents/**"] },
    "experiment-A": { "enable": ["agents/new-*"] }
  },
  "activeProfile": "baseline"
}
```

Profiles are reversible—switching profiles re-renders the effective state.

### 4.4 Hybrid Realization Strategy

| Artifact Type | Copilot Alternate Path? | Realization Strategy |
|---|---|---|
| Instructions | Yes | Settings-backed via VS Code settings |
| Prompts | Yes | Settings-backed via VS Code settings |
| Skills | Yes (Insiders) | Settings-backed via VS Code settings or materialized |
| Custom Agents | Yes (Insiders) | Settings-backed via VS Code settings or materialized |
| Hooks | File paths (Insiders) | Settings-backed via VS Code settings (paths to hook files) |

---

## 5. Configuration Schema

The extension uses `.metaflow.json` as the single repo-local configuration file. It can target a single metadata repository or multiple repositories layered together (superlays) so teams can maintain their own overlays while still inheriting from the primary repository.

```jsonc
{
  // Metadata repository location
  "metadataRepo": {
    "url": "git@github.com:org/ai-metadata.git",
    "localPath": ".ai/ai-metadata",
    "commit": "8f31c2a"   // pinned for determinism
  },
  // Optional multi-repo configuration (superlays)
  "metadataRepos": [
    {
      "id": "primary",
      "url": "git@github.com:org/ai-metadata.git",
      "localPath": ".ai/ai-metadata",
      "commit": "8f31c2a"
    },
    {
      "id": "team",
      "url": "git@github.com:org/team-metadata.git",
      "localPath": "../shared/ai-metadata-team",
      "commit": "3b12a9c"
    }
  ],

  // Ordered layers (low → high specificity)
  "layers": [
    "company/core",
    "standards/sdlc",
    "department/engineering",
    "team/platform",
    "product/my-product"
  ],
  // When multiple repositories are configured, layers can reference a repo
  "layerSources": [
    { "repoId": "primary", "path": "company/core" },
    { "repoId": "primary", "path": "standards/sdlc" },
    { "repoId": "team", "path": "overlays/team" }
  ],

  // Path-based filtering
  "filters": {
    "include": ["**"],
    "exclude": ["agents/experimental/**"]
  },

  // Named activation profiles
  "profiles": {
    "baseline": {},
    "lean": { "disable": ["agents/**"] }
  },
  "activeProfile": "baseline",

  // Injection mode overrides (per artifact type)
  "injection": {
    "instructions": "settings",
    "prompts": "settings",
    "skills": "settings",
    "agents": "settings",
    "hooks": "settings"
  },
  "hooks": {
    "preApply": "hooks/pre-apply.ts",
    "postApply": "hooks/post-apply.ts"
  }
}

### 5.1 Multi-Repo Resolution Rules

When `metadataRepos` is configured:

1. **Layer order is authoritative** — `layerSources` order defines global precedence across *all* repositories.
2. **Later layers win** — if multiple layers (even across repos) define the same relative path, the later `layerSources` entry wins.
3. **Repo identity is explicit** — each `layerSources` entry references a `repoId` from `metadataRepos`.
4. **Single-repo fallback** — if only `metadataRepo` and `layers` are provided, all layers resolve from that repo.
5. **Validation rules** — `repoId` must exist, `metadataRepos` IDs are unique, and `layerSources` is required when more than one repo is configured.
```

**Config discovery precedence:**
1. `.metaflow.json` (workspace root)
2. `.ai/.metaflow.json` (fallback)

---

## 6. Managed State and Provenance

### 6.1 Managed State

After each `apply`, the extension persists a managed-state record:

```json
{
  "version": 1,
  "lastApply": "2026-02-07T10:00:00Z",
  "files": {
    ".github/skills/_shared_coding-standards.md": {
      "contentHash": "sha256:abc123...",
      "sourceLayer": "company/core",
      "sourceCommit": "8f31c2a"
    }
  }
}
```

**Location:** `.ai/.sync-state/overlay_managed.json`

### 6.2 Provenance Headers

Every materialized file includes a machine-readable provenance comment:

```markdown
<!--
synced: true
source-repo: ai-metadata
source-commit: 8f31c2a
scope: company.department.team.product
layers: [company, department, team, product]
profile: baseline
content-hash: sha256:abc123...
-->
```

### 6.3 Drift Detection

Before overwriting, the materializer:
1. Reads the target file's current content hash.
2. Compares against the managed-state hash.
3. If they differ → the file was locally edited → **block overwrite** and warn.
4. If they match → safe to overwrite.

---

## 7. Extension UX

### 7.1 Activation

The extension activates when:
- A workspace contains `.metaflow.json` or `.ai/.metaflow.json`.
- A MetaFlow command is invoked from the command palette.

### 7.2 Activity Bar & Sidebar

A dedicated activity-bar icon opens the MetaFlow sidebar containing four TreeViews:

| View | Content |
|---|---|
| **Configuration** | Config path, metadata repo info, injection modes |
| **Profiles** | List of named profiles with active indicator; click to switch |
| **Layers** | Ordered layer list with enable/disable checkboxes |
| **Effective Files** | Fully resolved file list grouped by classification (settings vs materialized) |

### 7.3 Commands

| Command | Palette Title | Description |
|---|---|---|
| `metaflow.refresh` | MetaFlow: Refresh | Reload config and re-resolve overlays |
| `metaflow.preview` | MetaFlow: Preview Overlay | Show effective file tree and pending diffs |
| `metaflow.apply` | MetaFlow: Apply Overlay | Materialize required files to `.github/` |
| `metaflow.clean` | MetaFlow: Clean Managed Files | Remove all managed outputs |
| `metaflow.status` | MetaFlow: Status | Show layer/profile/commit state |
| `metaflow.switchProfile` | MetaFlow: Switch Profile | Quick-pick to change active profile |
| `metaflow.toggleLayer` | MetaFlow: Toggle Layer | Enable/disable a layer |
| `metaflow.openConfig` | MetaFlow: Open Configuration | Open `.metaflow.json` in editor |
| `metaflow.initConfig` | MetaFlow: Initialize Configuration | Scaffold a new `.metaflow.json` |
| `metaflow.promote` | MetaFlow: Promote Changes | Detect local edits to managed files |

### 7.4 Status Bar

Shows: `MetaFlow: <profile> (<N> files)` with state indicator (synced / drift / error).

### 7.5 Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `metaflow.enabled` | boolean | `true` | Enable/disable extension |
| `metaflow.autoApply` | boolean | `false` | Auto-apply on config change |
| `metaflow.logLevel` | enum | `info` | Output channel verbosity |
| `metaflow.hooksEnabled` | boolean | `true` | Enable/disable hook path injection |

#### Insiders Settings Keys (Confirm Exact Names)

These keys should be pinned to the Insiders setting names once confirmed:

| Purpose | Setting Key |
|---|---|
| Instructions directory | `github.copilot.chat.codeGeneration.instructions` (existing) |
| Prompts directory | **TBD** |
| Skills directory | **TBD** |
| Agents directory | **TBD** |
| Hook file paths | **TBD** |

---

## 8. Testing Strategy

### 8.1 Test Levels

| Level | Framework | Scope | Environment |
|---|---|---|---|
| **Unit** | Mocha + assert | Config loader, overlay engine, materializer, glob matcher | Node.js (no VS Code API) |
| **Integration** | Mocha + `@vscode/test-electron` | Command registration, activation, TreeView rendering | VS Code Extension Host |
| **Manual** | Documented procedures (FTD) | UI interaction, visual verification, end-to-end workflows | VS Code with test workspace |
| **Validation** | Documented procedures (VTP) | Acceptance criteria against real metadata pack | VS Code with DFX-AI-Metadata |

### 8.2 Test Infrastructure

- **Test workspace fixture** (`test-workspace/`) containing a minimal `.metaflow.json` and mock metadata directory.
- **`@vscode/test-cli`** + **`@vscode/test-electron`** for integration tests.
- **c8** for code coverage reporting.
- **`.vscode-test.mjs`** configuration separating unit and integration test runs.

### 8.3 Coverage Target

- ≥80% line coverage for core engine modules (overlay, materializer, config).
- ≥60% line coverage overall including extension integration code.

### 8.4 Test-Per-Phase Strategy

Testing is integrated into every implementation phase, not deferred:

| Phase | Test Deliverables |
|---|---|
| Phase 1 | Config loader unit tests, diagnostics unit tests |
| Phase 2 | Overlay engine unit tests (resolution, filtering, profile, classification) |
| Phase 3 | Materializer unit tests (apply, clean, provenance, drift detection) |
| Phase 4 | Integration tests (command execution, TreeView data, activation) |
| Phase 5 | Manual test procedures (FTD), test results (FTR), validation testing |

---

## 9. Traceability Model

The project maintains full bidirectional traceability across the V-model:

```
SRS (REQ-*)
  ↓ realized by
SDD (DES-*)
  ↓ verified by
TCS (TC-*)
  ↓ executed by
FTD (TP-*) ← automated tests + manual procedures
  ↓ evidenced by
FTR (TR-*)

Validation:
VSRS (VREQ-*) → VTC → VTP → VTR
```

### 9.1 ID Conventions

| Artifact | ID Pattern | Example |
|---|---|---|
| Requirement | `REQ-####` | REQ-0001 |
| Design Element | `DES-####` | DES-0001 |
| Test Case | `TC-####` | TC-0001 |
| Test Procedure | `TP-####` | TP-0001 |
| Test Result | `TR-YYYYMMDD-nn` | TR-20260207-01 |
| Validation Requirement | `VREQ-####` | VREQ-0001 |
| Validation Test Case | `VTC-####` | VTC-0001 |
| Validation Procedure | `VTP-####` | VTP-0001 |
| Validation Result | `VTR-YYYYMMDD-nn` | VTR-20260207-01 |

### 9.2 Minimum Coverage Rules

- Every enforced `REQ-*` maps to ≥1 `TC-*`.
- Every `TC-*` maps to ≥1 `REQ-*`.
- Every `TC-*` is covered by ≥1 `TP-*` (automated or manual).
- Every `TR-*` references executed `TC-*` and includes evidence.
- Validation equivalents follow the same rules.

---

## 10. Documentation Deliverables

| Document | Location | Purpose |
|---|---|---|
| CONCEPT.md | `doc/concept/CONCEPT.md` | This document — concept and architecture |
| SRS | `doc/srs/SRS-metaflow-ext.md` | Software requirements (REQ-*) |
| SDD | `doc/sdd/SDD-metaflow-ext.md` | Software design (DES-*) |
| TCS | `doc/tcs/TCS-metaflow-ext.md` | Test case specification (TC-*) |
| FTD | `doc/ftd/FTD-metaflow-ext.md` | Functional test descriptions / procedures (TP-*) |
| FTR | `doc/ftr/FTR-metaflow-ext.md` | Functional test results (TR-*) |
| VSRS | `doc/validation/srs/VSRS-metaflow-ext.md` | Validation requirements (VREQ-*) |
| VTC | `doc/validation/tcs/VTC-metaflow-ext.md` | Validation test cases (VTC-*) |
| VTP | `doc/validation/ftd/VTP-metaflow-ext.md` | Validation procedures (VTP-*) |
| VTR | `doc/validation/ftr/VTR-metaflow-ext.md` | Validation results (VTR-*) |
| Use Cases | `doc/use-cases/UC-metaflow-ext.md` | User workflow scenarios |

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| Path traversal in layer paths | Validate all paths resolve within metadata repo boundary |
| Malicious provenance injection | Provenance headers are written by extension only, not parsed from user input |
| Config schema injection | JSON schema validation before processing; reject unknown fields |
| File system safety | Never delete files outside managed-state tracking; confirm before destructive operations |
| Secret exposure | Extension never reads or writes `.env` files, secrets, or credentials |

---

## 12. Constraints and Assumptions

### 12.1 Constraints

- **Clean config schema only** — the extension uses the reference architecture config schema, not legacy predecessor formats.
- **Determinism is non-negotiable** — same config + same metadata commit must yield identical outputs.
- **Copilot artifact rules respected** — skills and agents must be materialized to `.github/`.
- **VS Code engine ≥1.80.0** — minimum compatible VS Code version.
- **TypeScript strict mode** — all source compiled with `strict: true`.

### 12.2 Assumptions

- The metadata repository (e.g., DFX-AI-Metadata) is cloned locally or accessible via a shared path before extension activation.
- When multiple repositories are configured, at least one repo is designated as the primary source of truth.
- The consumer repository has a valid `.metaflow.json` configuration file.
- The user has read access to the metadata repository clone.
- Git operations (branch/commit/push) for promotion are handled outside the extension in v1.

---

## 13. Dependencies

| Dependency | Type | Purpose |
|---|---|---|
| VS Code API (`vscode`) | Runtime | Extension host APIs |
| `jsonc-parser` | Runtime | Fault-tolerant JSON/JSONC parsing for config files |
| `@vscode/test-electron` | Dev | Integration test harness |
| `@vscode/test-cli` | Dev | Test CLI runner |
| `mocha` | Dev | Test framework |
| `c8` | Dev | Code coverage |
| `typescript` | Dev | Language compiler |
| `eslint` | Dev | Linting |
| DFX-AI-Metadata | Fixture | Test metadata pack with hierarchical layers |

---

## 14. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Copilot changes alternate-path support | Med | Low | Abstracted classification logic; easy to reconfigure |
| Large metadata repos cause performance issues | Med | Med | Lazy loading; file-count limits; progress indicators |
| Config schema evolution breaks existing users | High | Low | Schema versioning with migration support |
| DFX-AI-Metadata fixture inadequate for testing | Med | Med | Extend fixture as needed; document minimum layer requirements |
| VS Code API breaking changes | Low | Low | Pin minimum engine version; test against stable + insiders |

---

## 15. Future Extensions (Post-v1)

| Extension | Description |
|---|---|
| File-watcher auto-sync | Watch metadata repo and auto-apply on change |
| Git promotion automation | Create branch, commit, and open PR from extension |
| Multi-root workspace support | Handle multiple workspace folders independently |
| Metadata manifest & tagging | Version and tag metadata releases |
| CI policy validation | GitHub Actions for compliance checking |
| Marketplace publishing | Package and publish to VS Code Marketplace |
| Telemetry & analytics | Opt-in usage telemetry for adoption tracking |

---

## 16. Glossary

| Term | Definition |
|---|---|
| **Canonical Repository** | The centralized git repository containing shared AI metadata |
| **Layer** | A directory subtree within the metadata repo representing an organizational scope |
| **Overlay** | The composed result of merging all applicable layers |
| **Profile** | A named activation configuration that enables/disables subsets of the overlay |
| **Realization** | The act of making overlay content available to Copilot (settings-based reference or materialization) |
| **Materialization** | Copying overlay files into `.github/` with provenance headers |
| **Settings-Based Reference** | Pointing VS Code settings at overlay files without copying them |
| **Provenance** | Machine-readable metadata in materialized files tracking their origin |
| **Managed State** | Extension-maintained record of materialized file hashes for drift detection |
| **Drift** | A materialized file whose content no longer matches the managed-state hash |
| **Promotion** | Propagating local edits back to the canonical metadata repository |

---

## Appendix A: Relationship to Legacy Predecessor

MetaFlow is a strategic successor to earlier overlay tooling. Key differences:

| Aspect | Legacy predecessor | MetaFlow |
|---|---|---|
| Runtime | Legacy CLI subprocess | Pure TypeScript in-extension |
| Config schema | Legacy + clean schema coexistence | Clean reference schema only |
| Engine location | Legacy package | TypeScript package (`packages/engine/`) |
| Testing | Retroactive; mixed legacy tests | TDD per phase; Mocha + @vscode/test-electron |
| Scope | Pack-sync + watchers + overlay + CLI | Overlay engine + extension only |

The predecessor extension source (`vscode-extension/`) serves as prior art for UI patterns (TreeViews, commands, status bar, diagnostics) and will be referenced but not directly ported.

---

## Appendix B: VS Code Extension Development Methodology

The extension follows these engineering practices for robust VS Code extension development:

1. **Separation of Concerns** — Pure engine logic (no VS Code imports) separated from extension integration code, enabling unit testing without Extension Host.
2. **Disposable Pattern** — All VS Code subscriptions (commands, watchers, views) registered via `context.subscriptions` for automatic cleanup.
3. **Defensive Activation** — Graceful degradation when config is missing or invalid; minimal command registration even in error states.
4. **Diagnostics-First Config** — Config errors reported via VS Code diagnostic collection, not just output channel.
5. **TreeDataProvider Pattern** — All sidebar views use `TreeDataProvider` with `refresh()` events for reactive updates.
6. **Test Pyramid** — Many fast unit tests (pure TS); fewer integration tests (Extension Host); targeted manual procedures.
7. **Strict TypeScript** — `strict: true`, explicit types on public APIs, no `any` in engine code.
8. **JSONC Tolerant Parsing** — Config files parsed with `jsonc-parser` to support comments and trailing commas.
9. **Progress Indicators** — Long operations (apply, clean) use `vscode.window.withProgress()` for UX feedback.
10. **Output Channel Logging** — Structured logging to a dedicated output channel with configurable verbosity.

---

**End of Concept Document**
