# VTC — Validation Test Case Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| VTC-metaflow-ext | MetaFlow VS Code Extension — Validation | TBD | Active |

| Last Updated | Related VSRS | Notes |
|---|---|---|
| 2026-02-07 | VSRS-metaflow-ext | Complete — 6 validation test cases |

## Test Strategy

- **Level**: End-to-end acceptance
- **Target**: Full extension workflow against DFX-AI-Metadata fixture
- **Environment**: VS Code with MetaFlow extension (VSIX); local DFX-AI-Metadata clone

## Validation Test Cases

| VTC-ID | Title | Preconditions | Steps (brief) | Expected Result | Validates VREQ-ID(s) | Priority | Status |
|---|---|---|---|---|---|---|---|
| VTC-0001 | Activation with DFX config | Workspace with `.metaflow/config.jsonc` pointing to DFX-AI-Metadata | Open workspace; observe activation | Extension active; views populated; no errors | VREQ-0001 | P1 | Ready |
| VTC-0002 | Apply produces expected files | VTC-0001 passed | Run Apply; inspect .github/ | Expected materialized files with provenance headers | VREQ-0002 | P1 | Ready |
| VTC-0003 | Profile switching changes files | VTC-0001 passed; 2+ profiles in config | Switch profile via command; observe files | File count changes; TreeView updates | VREQ-0003 | P1 | Ready |
| VTC-0004 | Clean removes managed files | VTC-0002 passed | Run Clean; confirm; inspect .github/ | No managed files remain; state cleared | VREQ-0004 | P1 | Ready |
| VTC-0005 | Drift detection works | VTC-0002 passed | Edit a managed file; run Promote | Drifted file reported; Apply skips it | VREQ-0005 | P1 | Ready |
| VTC-0006 | Settings injection works | VTC-0002 passed | Check .vscode/settings.json after Apply | instructionFiles/promptFiles entries present | VREQ-0006 | P2 | Ready |

## Traceability Matrix (VTC → VREQ)

| VTC-ID | VREQ-0001 | VREQ-0002 | VREQ-0003 | VREQ-0004 | VREQ-0005 | VREQ-0006 |
|---|---|---|---|---|---|---|
| VTC-0001 | X | | | | | |
| VTC-0002 | | X | | | | |
| VTC-0003 | | | X | | | |
| VTC-0004 | | | | X | | |
| VTC-0005 | | | | | X | |
| VTC-0006 | | | | | | X |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| VTC maps to ≥1 VREQ | 6 | 6 | All VTCs validate a requirement. |
| Enforced VREQ covered by ≥1 VTC | 6 | 6 | All VREQs have at least one VTC. |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Added VTC-0001–VTC-0006, traceability matrix | AI |
