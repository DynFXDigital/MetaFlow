# MetaFlow VS Code Extension – Context

- **Last updated:** 2026-02-07
- **Status:** Planning – plan reviewed, strengthened, and CONCEPT.md created
- **Owner:** TBD

## Feature Overview

MetaFlow is a pure TypeScript VS Code extension that implements the AI metadata overlay reference architecture directly in the client. The goal is deterministic overlay resolution and materialization (with provenance and managed state) alongside a focused UI for profile/layer management, preview/apply/clean workflows, and Copilot settings injection. The extension is built for the clean reference schema only and tested against DFX-AI-Metadata fixtures.

## Current Focus

1. Plan reviewed and restructured with Phase 0 (requirements/design foundation) added.
2. Testing strategy distributed across all phases (no longer deferred to Phase 5).
3. Full CONCEPT.md created at `doc/concept/CONCEPT.md`.
4. Full traceability model defined: SRS → SDD → TCS → FTD → FTR + validation (VREQ → VTC → VTP → VTR).

## Next Steps

- [ ] Execute Phase 0: Write SRS with all REQ-* IDs and enforcement levels.
- [ ] Execute Phase 0: Author use-case documentation.
- [ ] Execute Phase 0: Create skeleton SDD, TCS, FTD, FTR, and validation documents.
- [ ] Execute Phase 0: Set up `doc/` directory hierarchy.
- [ ] Begin Phase 1: Extension scaffold and config model implementation.

## References

- `.plan/metaflow-extension/README.md` – main plan (6 phases: 0–5)
- `doc/concept/CONCEPT.md` – full concept document with architecture and testing strategy
- `doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md` – reference architecture
- `c:\Users\cyates\gitwork\AI\Sync-AI-Metadata\vscode-extension\` – prior art (Sync-AI-Metadata extension)
- `c:\Users\cyates\gitwork\AI\DFX-AI-Metadata\` – metadata pack fixture for validation testing

## Decision Log

- **2026-02-07** – Use pure TypeScript (no Python CLI) for the MetaFlow extension.
- **2026-02-07** – Use clean reference-architecture config schema only.
- **2026-02-07** – Added Phase 0 for requirements and design foundation before implementation.
- **2026-02-07** – Distributed testing across all phases (TDD per phase) instead of deferring to Phase 5.
- **2026-02-07** – Added full traceability model including validation testing (VREQ/VTC/VTP/VTR).
- **2026-02-07** – Added manual test procedures (FTD) alongside automated tests.
- **2026-02-07** – Engine modules must be pure TS (no `vscode` imports) for fast unit testing.
- **2026-02-07** – Target ≥80% code coverage on core engine modules.

## Open Questions & Risks

- Confirm which DFX-AI-Metadata layers are required for baseline tests (skills + agents content needed).
- Determine if DFX-AI-Metadata needs skills/agents directories added for live-ref testing.
- Identify new hook file paths required for Insiders hook support and add fixtures.
- Validate multi-repo (superlay) resolution order and test fixture needs.
- Confirm Insiders setting keys for prompts/skills/agents/hooks and update docs.
- Validate that `jsonc-parser` handles all edge cases in real-world configs.
- VS Code engine ≥1.80.0 assumption may need revisiting if newer APIs are required.

