# Metadata Source-Aware Init – Context

- **Last updated:** 2026-02-14
- **Status:** Planning complete — ready for phased implementation
- **Owner:** TBD

## Feature Overview

MetaFlow initialization currently writes a static `.metaflow.json` template and requires users to manually prepare metadata inputs. This feature adds source-aware initialization so users can bootstrap from (1) an existing local directory, (2) a remote Git URL that is cloned locally, or (3) a new empty directory scaffold. Success means users can complete first-time setup in one flow, with discovered layers and a valid config generated automatically for both CLI and VS Code extension paths.

## Current Focus

1. Finalize implementation plan covering CLI and VS Code init parity.
2. Define deterministic layer-discovery and clone-target defaults.
3. Define acceptance criteria and test matrix for all source modes.

## Next Steps

- [ ] Implement shared source-resolution utilities in `packages/engine` (directory scanning, URL naming, layer ordering).
- [ ] Upgrade CLI `init` in `packages/cli/src/commands/init.ts` with interactive + flag-driven source modes.
- [ ] Upgrade extension init in `src/src/commands/initConfig.ts` with equivalent mode selection and prompts.
- [ ] Add/update tests in CLI, engine, and extension unit/integration suites for all source paths.
- [ ] Update docs (`packages/cli/README.md`, `src/README.md`) with new initialization examples.

## References

- [Plan README](README.md)
- [Phase 1 — Contracts & Discovery](Phase1-Contracts-And-Discovery.md)
- [Phase 2 — CLI Source-Aware Init](Phase2-CLI-Source-Aware-Init.md)
- [Phase 3 — Extension Source-Aware Init](Phase3-Extension-Source-Aware-Init.md)
- [Phase 4 — Validation & Documentation](Phase4-Validation-And-Docs.md)
- [Current CLI init command](../../packages/cli/src/commands/init.ts)
- [Current extension init command](../../src/src/commands/initConfig.ts)
- [Config schema](../../packages/engine/src/config/configSchema.ts)
- [Plan rules](../../.github/instructions/plan.instructions.md)

## Decision Log

- **2026-02-14** – Plan uses single-repo config output (`metadataRepo` + `layers`) for MVP to keep init flow simple; multi-repo authoring is deferred.
- **2026-02-14** – Existing-directory and URL modes share the same layer-discovery algorithm to guarantee consistent outcomes.
- **2026-02-14** – URL mode default clone target is `.ai/<repoName>/` under workspace unless explicitly overridden.

## Open Questions & Risks

- Discoverability risk: repositories that contain many nested `.github` directories may produce noisy layer lists; define a clear include/exclude policy.
- UX parity risk: CLI and VS Code prompt flows can diverge if not backed by a shared utility contract.
- Operational risk: cloning requires `git` availability and network access; need graceful fallback/error guidance when unavailable.
