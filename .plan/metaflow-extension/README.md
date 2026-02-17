# MetaFlow VS Code Extension – Implementation Plan

## Overview

This plan defines the phased implementation of a **pure TypeScript** MetaFlow VS Code extension that implements the [MetaFlow Reference Architecture](../../doc/concept/metaflow_reference_architecture.md) directly in the extension (no external-runtime CLI dependency). The extension provides configuration management, overlay preview/apply/clean, profile/layer toggling, provenance-aware materialization, and Copilot settings injection.

See [CONCEPT.md](../../doc/concept/CONCEPT.md) for the full concept document including architecture, testing strategy, and traceability model.

## Goals

- Deliver a VS Code extension that fully implements the reference overlay engine in TypeScript.
- Provide deterministic overlay application and managed-state tracking.
- Offer core UI surfaces (tree views + status bar) for profiles, layers, and effective files.
- Support single or multiple metadata repositories (superlays) accessible across projects.
- Maintain full traceability documentation (SRS → SDD → TCS → FTD → FTR + validation).
- Integrate automated tests per phase (TDD) alongside manual test procedures (FTD/FTR).
- Validate against a shared metadata pack (DFX-AI-Metadata) for end-to-end acceptance.

## Target Directories

| Directory | Purpose |
|---|---|
| `src/` | Extension source (engine, commands, views) |
| `src/engine/` | Overlay engine + materializer (pure TS, no VS Code imports) |
| `src/config/` | Config loader + path utilities |
| `src/diagnostics/` | Config diagnostics (VS Code diagnostic collection) |
| `src/views/` | TreeView providers + status bar + output channel |
| `src/commands/` | Command handlers |
| `src/test/unit/` | Unit tests (pure TS, no Extension Host) |
| `src/test/integration/` | Integration tests (Extension Host via `@vscode/test-electron`) |
| `test-workspace/` | Test fixture workspace with mock config + metadata |
| `doc/concept/` | Concept document |
| `doc/srs/` | Software Requirements Specification (REQ-*) |
| `doc/sdd/` | Software Design Document (DES-*) |
| `doc/tcs/` | Test Case Specification (TC-*) |
| `doc/ftd/` | Functional Test Descriptions / Procedures (TP-*) |
| `doc/ftr/` | Functional Test Results (TR-*) |
| `doc/use-cases/` | Use-case documentation |
| `doc/validation/srs/` | Validation Requirements (VREQ-*) |
| `doc/validation/tcs/` | Validation Test Cases (VTC-*) |
| `doc/validation/ftd/` | Validation Procedures (VTP-*) |
| `doc/validation/ftr/` | Validation Results (VTR-*) |
| `.github/instructions/` | Lifecycle and agent instructions |

## Non-Goals

- External-runtime CLI or subprocess integration (explicitly out of scope).
- Watcher-based auto-sync in v1 (defer to follow-up plan).
- Git automation for promotion (detect-only in v1).
- Multi-root workspace support in v1.
- Marketplace publishing in v1 (local VSIX first).

## Constraints

- Clean reference-architecture config schema only.
- Deterministic output: same config + same metadata commit yields identical results (per repo).
- Copilot constraints respected (skills/agents can be settings-backed via settings; hooks via file paths).
- VS Code engine ≥1.80.0.
- TypeScript strict mode (`strict: true`).

## Development Methodology

- **Test-per-phase** — each implementation phase includes its own automated tests; testing is not deferred.
- **Documentation-in-parallel** — SDD and TCS are updated as each phase completes, not batched at the end.
- **Separation of concerns** — engine logic is pure TypeScript (no `vscode` imports) to enable fast unit tests without Extension Host.
- **Disposable pattern** — all VS Code subscriptions registered via `context.subscriptions`.
- **Strict TypeScript** — `strict: true`, no `any` in engine code.
- **JSONC tolerant parsing** — config files parsed with `jsonc-parser`.

## Phases

| Phase | Name | Description | Status |
|------:|------|-------------|--------|
| 0 | [Requirements & Design Foundation](Phase0-Requirements-Design.md) | SRS, use cases, skeleton SDD/TCS, validation SRS, doc structure | Not started |
| 1 | [Project Skeleton + Config Model](Phase1-Project-Skeleton.md) | Extension scaffold, config loader, diagnostics + unit tests | Not started |
| 2 | [TypeScript Overlay Engine](Phase2-Overlay-Engine.md) | Layer resolution, filters, profiles, classification + unit tests | Not started |
| 3 | [Realization + Provenance](Phase3-Realization-Provenance.md) | Materialization, managed state, clean/apply/preview + unit tests | Not started |
| 4 | [Extension UI + Commands](Phase4-Extension-UI.md) | Views, command handlers, status bar, settings injection + integration tests | Not started |
| 5 | [Documentation, Validation & Polish](Phase5-Docs-Validation-Polish.md) | Manual test procedures (FTD/FTR), validation testing, metadata pack adaptation, traceability gap analysis | Not started |

## Cross-Cutting: Testing Strategy

Testing is distributed across phases, not deferred:

| Phase | Automated Tests | Doc Updates |
|---|---|---|
| 0 | — | SRS, skeleton SDD/TCS/VSRS, use cases |
| 1 | Config loader unit tests, diagnostics unit tests | SDD (DES for config), TCS (TC for config) |
| 2 | Overlay engine unit tests (resolution, filtering, profiles, classification) | SDD (DES for engine), TCS (TC for engine) |
| 3 | Materializer unit tests (apply, clean, provenance, drift detection) | SDD (DES for materializer), TCS (TC for materializer) |
| 4 | Integration tests (commands, TreeViews, activation, settings injection) | SDD (DES for UI), TCS (TC for UI) |
| 5 | — (test execution & validation) | FTD, FTR, VTC, VTP, VTR, gap analysis |

## Success Criteria

- Extension activates on `.metaflow.json` and exposes all commands + views.
- `Preview`, `Apply`, `Clean`, and `Promote` (detect-only) work against DFX-AI-Metadata fixtures.
- Managed state reliably prevents overwrites of local edits.
- ≥80% code coverage on core engine modules.
- All enforced REQ-* covered by ≥1 TC-*; all TC-* covered by ≥1 TP-*.
- Manual test procedures documented and executed with evidence.
- Validation testing (VREQ/VTC/VTP/VTR) completed against DFX-AI-Metadata.
