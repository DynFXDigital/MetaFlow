# Phase 5 — Documentation, Validation & Polish

## Objectives

- Complete manual test procedures (FTD) and execute them to produce test results (FTR).
- Execute validation testing against DFX-AI-Metadata and document results (VREQ → VTC → VTP → VTR).
- Perform traceability gap analysis ensuring all REQ → DES → TC → TP → TR chains are complete.
- Adapt DFX-AI-Metadata if needed for adequate test coverage.
- Finalize AGENTS.md, copilot-instructions.md, and lifecycle instructions.
- Prepare VSIX packaging and README for distribution.

## Scope

**In scope**

### Manual Test Procedures & Results
- `doc/ftd/FTD-metaflow-ext.md` — complete all TP-* procedures
- `doc/ftr/FTR-metaflow-ext.md` — record all TR-* results with evidence

### Validation Testing
- `doc/validation/srs/VSRS-metaflow-ext.md` — finalize VREQ-* requirements
- `doc/validation/tcs/VTC-metaflow-ext.md` — complete VTC-* validation test cases
- `doc/validation/ftd/VTP-metaflow-ext.md` — write VTP-* validation procedures
- `doc/validation/ftr/VTR-metaflow-ext.md` — execute and record VTR-* results

### Traceability Completion
- Final gap analysis across SRS → SDD → TCS → FTD → FTR
- Final gap analysis across VSRS → VTC → VTP → VTR
- Coverage report generation

### Metadata Pack Adaptation
- Verify DFX-AI-Metadata provides adequate layer diversity for testing
- Add missing layers/content if needed for test coverage
- Document minimum fixture requirements

### Extension Metadata & Agent Instructions
- `AGENTS.md` — contributor/agent instructions for the extension
- `.github/copilot-instructions.md` — MetaFlow-specific Copilot instructions
- `.github/instructions/` — lifecycle instructions (adapted from predecessor tooling)
- `README.md` — user-facing documentation
- `CHANGELOG.md` — version history

### Polish
- VSIX packaging configuration (`.vscodeignore`)
- `vsce package` produces valid VSIX
- Final lint/compile/test pass

**Out of scope**
- CI/CD pipeline setup (defer to follow-up)
- Marketplace publishing (defer)

## Tasks

### T5.1 — Manual Test Procedures (FTD)

Write detailed manual procedures for UI and end-to-end tests that cannot be fully automated:

| TP-ID | Title | Type | Validates |
|---|---|---|---|
| TP-M001 | Extension activation with valid config | Manual | TC for activation |
| TP-M002 | Extension graceful degradation without config | Manual | TC for no-config |
| TP-M003 | TreeView: Profiles display and switching | Manual | TC for profiles view |
| TP-M004 | TreeView: Layers display and toggle | Manual | TC for layers view |
| TP-M005 | TreeView: Effective files grouping | Manual | TC for files view |
| TP-M006 | Status bar display states | Manual | TC for status bar |
| TP-M007 | Apply command end-to-end | Manual | TC for apply |
| TP-M008 | Clean command end-to-end | Manual | TC for clean |
| TP-M009 | Preview command output | Manual | TC for preview |
| TP-M010 | Promote detection of drifted files | Manual | TC for promote |
| TP-M011 | Config diagnostics in Problems panel | Manual | TC for diagnostics |
| TP-M012 | Init config command scaffolding | Manual | TC for initConfig |

Each procedure includes:
- Preconditions (workspace setup, config state)
- Step-by-step instructions
- Expected results (visual and functional)
- Pass/fail criteria

### T5.2 — Execute Manual Tests and Record Results (FTR)

1. Execute each TP-M* procedure.
2. Record TR-* entries with date, status (Pass/Fail), evidence (screenshots, output logs).
3. Link each TR-* to the executed TC-*.

### T5.3 — Validation Testing

1. **Finalize VSRS:** End-to-end acceptance requirements against DFX-AI-Metadata:
   - VREQ-0001: Extension activates with DFX-AI-Metadata config.
   - VREQ-0002: Apply produces expected file set from DFX metadata layers.
   - VREQ-0003: Profile switching changes effective file set.
   - VREQ-0004: Clean removes all materialized files.
   - VREQ-0005: Drift detection identifies locally-edited managed files.
   - VREQ-0006: Settings injection configures Copilot alternate paths.
2. **Write VTC-*:** Validation test cases mapping each VREQ-* to concrete tests.
3. **Write VTP-*:** Validation procedures (manual end-to-end against DFX-AI-Metadata).
4. **Execute VTP-* and record VTR-*:** Results with evidence.

### T5.4 — Traceability Gap Analysis

1. Verify every enforced REQ-* has ≥1 TC-*.
2. Verify every TC-* has ≥1 TP-* (automated or manual).
3. Verify every TC-* has ≥1 TR-* with Pass status.
4. Verify same for validation chain: VREQ → VTC → VTP → VTR.
5. Document gaps (if any) with remediation plan.
6. Generate coverage report via `c8`.

### T5.5 — DFX-AI-Metadata Adaptation

1. Verify DFX-AI-Metadata contains:
   - At least 2 hierarchy levels (e.g., `company/`, `standards/`).
   - Content under `.github/` in each layer (instructions, prompts, skills, agents).
   - At least one skill and one agent for materialization testing.
2. If layers are insufficient, add minimal test content.
3. Document the minimum layer requirements for MetaFlow testing.
4. Add a secondary test metadata repo (team overlay) to validate multi-repo resolution order.
5. Add a conflict test fixture to validate cross-repo later-layer precedence.

### T5.6 — Extension Metadata Files

1. Create `AGENTS.md` with build/test commands, architecture overview, conventions.
2. Create `.github/copilot-instructions.md` with MetaFlow-specific guidance.
3. Port relevant lifecycle instructions from predecessor tooling `.github/instructions/`.
4. Update `README.md` with installation, usage, configuration, and command reference.
5. Create `CHANGELOG.md` with v0.1.0 initial release notes.

### T5.7 — VSIX Packaging

1. Review `.vscodeignore` excludes test files, source maps, and dev dependencies.
2. Run `vsce package` and verify VSIX contents.
3. Install VSIX in clean VS Code instance and smoke-test.

## Deliverables

- Complete FTD with all manual test procedures
- Complete FTR with all test results and evidence
- Complete validation documentation (VSRS, VTC, VTP, VTR)
- Traceability gap analysis report
- Adapted DFX-AI-Metadata (if needed) or documented fixture assumptions
- Extension README, AGENTS.md, CHANGELOG.md, copilot-instructions.md
- Valid VSIX package

## Exit Criteria

- All manual tests executed with evidence in FTR.
- Validation testing complete with evidence in VTR.
- Traceability gap analysis shows zero unresolved gaps for enforced requirements.
- `npm run compile` + `npm run lint` + `npm test` all pass.
- `vsce package` produces valid VSIX.
- README provides clear installation and usage instructions.
- AGENTS.md provides adequate guidance for AI coding agents.

