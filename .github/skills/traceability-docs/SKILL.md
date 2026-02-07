---
name: traceability-docs
description: Use this skill to author and maintain traceable SRS/SDD/TCS/FTD/FTR and validation artifacts.
---

# Traceability Docs Skill

## Purpose

This skill standardizes the creation and maintenance of traceable documentation artifacts and their linkage to tests and evidence.

## Canonical Artifacts

- SRS: `doc/srs/*.md` (REQ-####)
- SDD: `doc/sdd/*.md` (DES-####)
- TCS: `doc/tcs/*.md` (TC-####)
- FTD: `doc/ftd/*.md` (TP-####)
- FTR: `doc/ftr/*.md` (TR-YYYYMMDD-nn)
- Validation equivalents under `doc/validation/**` (VREQ/VTC/VTP/VTR)

## Authoring Workflow (Verification)

1. Create or update SRS using `.github/instructions/resources/Template.SRS.md`.
2. Map REQ → DES in SDD using `.github/instructions/resources/Template.SDD.md`.
3. Define TC → REQ mappings in TCS using `.github/instructions/resources/Template.TCS.md`.
4. Define TP → TC procedures in FTD using `.github/instructions/resources/Template.FTD.md`.
5. Record execution results and evidence in FTR using `.github/instructions/resources/Template.FTR.md`.

## Authoring Workflow (Validation)

1. Create VSRS with `VREQ-####`.
2. Define VTC → VREQ mappings.
3. Define VTP → VTC procedures.
4. Record VFTR evidence and outcomes.

## Traceability Rules (must-follow)

- SRS/VSRS must not link forward to design/tests.
- Every enforced `REQ-*` has ≥1 `TC-*`.
- Every `TC-*` has ≥1 `TP-*`.
- Every `TR-*` includes evidence and references executed `TC-*`.
- Validation equivalents follow the same rules.

## Automated Tests

- Automated tests must include trace tags referencing `TC-*` or `VTC-*`.
- Evidence for automated runs must be captured in FTR/VFTR.

## Scaling Modes

- Prototype: SRS + TCS minimum; allow warn-only validation.
- Normal: SRS + SDD + TCS + FTD + FTR; enforce mappings.
- Safety-critical: add validation track + fail-fast CI.
