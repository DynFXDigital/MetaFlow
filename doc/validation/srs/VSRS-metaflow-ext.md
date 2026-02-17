# VSRS — Validation Requirements Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| VSRS-metaflow-ext | MetaFlow VS Code Extension — Validation | TBD | Draft |

| Last Updated | Notes |
|---|---|
| 2026-02-07 | Initial draft — end-to-end acceptance requirements |

## Purpose

This document defines validation requirements (VREQ-*) for end-to-end acceptance testing of the MetaFlow VS Code extension against the DFX-AI-Metadata fixture pack. Validation testing confirms that the extension meets user-level acceptance criteria in a realistic environment.

## Scope

- In scope: End-to-end acceptance tests using DFX-AI-Metadata as the metadata repository
- Out of scope: Unit/integration tests (covered by TCS); CI/CD pipeline validation

## Validation Requirements

| VREQ-ID | Title | Description | Acceptance (testable) | Priority | Status |
|---|---|---|---|---|---|
| VREQ-0001 | Activation with DFX config | Extension activates when a workspace contains a valid `.metaflow.json` pointing to DFX-AI-Metadata. | Extension activates; sidebar views populated; no errors in output channel. | P1 | Draft |
| VREQ-0002 | Apply produces expected files | Apply command materializes the expected file set from DFX-AI-Metadata layers. | After apply, `.github/` contains exactly the expected materialized files with correct provenance and `_shared_` prefix. | P1 | Draft |
| VREQ-0003 | Profile switching changes files | Switching the active profile changes the effective file set. | After switching from `baseline` to a restrictive profile, the file count decreases; TreeView updates. | P1 | Draft |
| VREQ-0004 | Clean removes managed files | Clean command removes all materialized files and settings. | After clean, no `_shared_*` files remain in `.github/`; managed state is cleared; settings removed. | P1 | Draft |
| VREQ-0005 | Drift detection works | Locally editing a managed file is detected as drifted. | After editing a managed file, promote command reports it as drifted; apply skips it with warning. | P1 | Draft |
| VREQ-0006 | Settings injection works | Apply injects Copilot alternate-path settings for settings-backed artifacts. | After apply, VS Code settings contain instruction/prompt directory paths pointing to metadata repo. | P2 | Draft |

## Traceability (Policy)

- VSRS does not include forward links to validation tests (`VTC-*`) or procedures (`VTP-*`).
- VTC maps `VREQ-*` to validation test cases.
- VTP/VTR define execution and evidence.

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial draft — VREQ-0001 through VREQ-0006 | AI |
