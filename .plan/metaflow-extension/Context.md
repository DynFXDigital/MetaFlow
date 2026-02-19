# MetaFlow VS Code Extension – Context

- **Last updated:** 2026-02-07
- **Status:** Phase 5 nearly complete — VSIX packaged, 132 tests passing, all docs written
- **Owner:** TBD

## Feature Overview

MetaFlow is a pure TypeScript VS Code extension that implements the AI metadata overlay reference architecture directly in the client. The goal is deterministic overlay resolution and materialization (with provenance and managed state) alongside a focused UI for profile/layer management, preview/apply/clean workflows, and Copilot settings injection. The extension is built for the clean reference schema only and tested against DFX-AI-Metadata fixtures.

## Current Focus

1. Phase 5 (Docs/Validation/Polish) is wrapping up — all traceability docs, metadata files, and VSIX packaging complete.
2. 132 total tests passing: 111 unit (engine + config) + 21 integration (commands, views, activation).
3. VSIX artifact: `metaflow-0.1.0.vsix` (32 files, 41 KB) produced cleanly.

## Completed Phases

- [x] **Phase 0** – SRS (REQ-0001–REQ-0603), UC docs, skeleton SDD/TCS/FTD/FTR/VSRS/VTC/VTP/VTR, doc/ hierarchy
- [x] **Phase 1** – Extension scaffold, config model (schema, loader, pathUtils), diagnostics, output channel, status bar; 27 unit tests
- [x] **Phase 2** – Overlay engine (overlayEngine, filterEngine, profileEngine, classifier, globMatcher, settingsInjector); 56 additional unit tests; SDD/TCS updated
- [x] **Phase 3** – Materialization (provenanceHeader, managedState, driftDetector, materializer); 25 additional unit tests; SDD/TCS updated
- [x] **Phase 4** – Commands (10 handlers), TreeViews (4 providers), extension.ts rewrite; 21 integration tests; SDD/TCS updated
- [x] **Phase 5** – FTD (15 auto + 12 manual procedures), FTR populated, validation docs (VSRS/VTC/VTP/VTR), README, CHANGELOG, AGENTS.md, LICENSE, VSIX packaging

## Next Steps

- [ ] Move to MetaFlow CLI plan (`.plan/metaflow-cli/`)
- [ ] Execute manual test procedures (TP-M001–TP-M012) and record results in FTR
- [ ] Execute validation test procedures (VTP-0001–VTP-0006) and record in VTR
- [ ] Publish extension to marketplace when publisher account is ready

## References

- `.plan/metaflow-extension/README.md` – main plan (6 phases: 0–5)
- `doc/concept/CONCEPT.md` – full concept document with architecture and testing strategy
- `doc/concept/metaflow_reference_architecture.md` – reference architecture
- `doc/srs/SRS-metaflow-ext.md` – requirements (REQ-0001–REQ-0603)
- `doc/sdd/SDD-metaflow-ext.md` – design (DES-0001–DES-0308)
- `doc/tcs/TCS-metaflow-ext.md` – test cases (TC-0001–TC-0328)
- `doc/ftd/FTD-metaflow-ext.md` – test procedures (TP-A001–TP-A015, TP-M001–TP-M012)
- `doc/ftr/FTR-metaflow-ext.md` – test results (132 automated pass)
- `src/metaflow-0.1.0.vsix` – packaged extension artifact

## Decision Log

- **2026-02-07** – Use pure TypeScript (no external-runtime CLI) for the MetaFlow extension.
- **2026-02-07** – Use clean reference-architecture config schema only.
- **2026-02-07** – Added Phase 0 for requirements and design foundation before implementation.
- **2026-02-07** – Distributed testing across all phases (TDD per phase) instead of deferring to Phase 5.
- **2026-02-07** – Added full traceability model including validation testing (VREQ/VTC/VTP/VTR).
- **2026-02-07** – Engine modules must be pure TS (no `vscode` imports) for fast unit testing.
- **2026-02-07** – Target ≥80% code coverage on core engine modules.
- **2026-02-07** – Extension ID = `dynfxdigital.metaflow` (publisher.name).
- **2026-02-07** – `.vscodeignore` excludes `out/test/**` after removing the `!out/**/*.js` negation; test files no longer leak into VSIX.
- **2026-02-07** – Added `@vscode/vsce` as devDependency + `package` npm script for reproducible VSIX builds.

## Open Questions & Risks

- Manual and validation test procedures not yet executed (marked Pending in FTR/VTR).
- Marketplace publisher account not yet created.
- Multi-repo (superlay) resolution tested with unit tests only; needs real-world validation with DFX-AI-Metadata.
- VS Code engine ≥1.80.0 assumption may need revisiting if newer APIs are required.

