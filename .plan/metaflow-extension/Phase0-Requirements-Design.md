# Phase 0 — Requirements & Design Foundation

## Objectives

- Establish the full traceability documentation structure before implementation begins.
- Author the Software Requirements Specification (SRS) with all `REQ-*` IDs.
- Document use cases covering primary user workflows.
- Create skeleton SDD, TCS, and validation documents for incremental population.
- Set up the `doc/` directory hierarchy matching the traceability model.

## Scope

**In scope**
- `doc/concept/CONCEPT.md` (already created)
- `doc/srs/SRS-metaflow-ext.md` — full requirements specification
- `doc/sdd/SDD-metaflow-ext.md` — skeleton design document
- `doc/tcs/TCS-metaflow-ext.md` — skeleton test case specification
- `doc/ftd/FTD-metaflow-ext.md` — skeleton functional test descriptions
- `doc/ftr/FTR-metaflow-ext.md` — skeleton functional test results
- `doc/use-cases/UC-metaflow-ext.md` — use-case documentation
- `doc/validation/srs/VSRS-metaflow-ext.md` — validation requirements
- `doc/validation/tcs/VTC-metaflow-ext.md` — skeleton validation test cases
- `doc/validation/ftd/VTP-metaflow-ext.md` — skeleton validation procedures
- `doc/validation/ftr/VTR-metaflow-ext.md` — skeleton validation results

**Out of scope**
- Any implementation code
- Automated test scripts

## Tasks

### T0.1 — Write SRS (REQ-*)

Define all functional and non-functional requirements. Requirements must cover:

| Category | Requirement Areas |
|---|---|
| Config Management | Config loading, schema validation, diagnostics, path resolution |
| Overlay Engine | Layer resolution, filtering, profile activation, classification |
| Materialization | Apply, clean, provenance injection, managed-state, drift detection |
| Extension UI | TreeViews (config, profiles, layers, files), status bar, output channel |
| Commands | preview, apply, clean, status, promote, switchProfile, toggleLayer, openConfig, initConfig |
| Settings Injection | Copilot instruction/prompt alternate paths via VS Code settings |
| Determinism | Identical outputs from identical inputs |
| Safety | No overwrite of locally-modified files; no auto-commit/push |

**Enforcement levels:** `Phase-1` through `Phase-4` matching implementation phases.

### T0.2 — Document Use Cases

| Use Case | Actor | Summary |
|---|---|---|
| UC-01 | Developer | Initialize MetaFlow config in a new repository |
| UC-02 | Developer | Preview effective overlay before applying |
| UC-03 | Developer | Apply overlay to materialize required files |
| UC-04 | Developer | Clean all managed files |
| UC-05 | Developer | Switch active profile for experimentation |
| UC-06 | Developer | Toggle a layer on/off |
| UC-07 | Developer | Detect local edits to managed files (promote awareness) |
| UC-08 | Team Lead | Review config/layer state across team repos |
| UC-09 | Developer | Recover from config errors using diagnostics |

### T0.3 — Create Skeleton SDD

- Create SDD-metaflow-ext.md with document header, empty design elements table.
- Populate initial key decisions (DEC-*).

### T0.4 — Create Skeleton TCS

- Create TCS-metaflow-ext.md with document header, empty test cases table.
- Populate test strategy section.
- Create empty traceability matrix.

### T0.5 — Create Skeleton FTD/FTR

- Create FTD with procedure template (TP-*) for both automated and manual tests.
- Create FTR with empty results table (TR-*).

### T0.6 — Create Validation Documents

- Write VSRS with VREQ-* covering end-to-end acceptance criteria.
- Create skeleton VTC, VTP, VTR.

### T0.7 — Set Up doc/ Directory Structure

Ensure the following directory tree exists:

```
doc/
├── concept/
│   ├── CONCEPT.md
│   └── ai_metadata_overlay_sync_system_reference_architecture.md
├── srs/
│   └── SRS-metaflow-ext.md
├── sdd/
│   └── SDD-metaflow-ext.md
├── tcs/
│   └── TCS-metaflow-ext.md
├── ftd/
│   └── FTD-metaflow-ext.md
├── ftr/
│   └── FTR-metaflow-ext.md
├── use-cases/
│   └── UC-metaflow-ext.md
└── validation/
    ├── srs/
    │   └── VSRS-metaflow-ext.md
    ├── tcs/
    │   └── VTC-metaflow-ext.md
    ├── ftd/
    │   └── VTP-metaflow-ext.md
    └── ftr/
        └── VTR-metaflow-ext.md
```

## Deliverables

- Complete SRS with all REQ-* IDs and enforcement levels
- Use-case document covering primary workflows
- Skeleton SDD, TCS, FTD, FTR, and validation documents
- Established `doc/` directory hierarchy

## Exit Criteria

- SRS reviewed and requirements enumerated with enforcement levels
- Every REQ-* has a clear acceptance criterion
- Skeleton traceability documents match the ID conventions in `traceability-core.instructions.md`
- Use cases cover all primary extension workflows
