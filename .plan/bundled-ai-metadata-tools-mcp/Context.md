# Bundled AI Metadata, Tools, and MCP - Context

- **Last updated:** 2026-03-01
- **Status:** Phase 1/2/3 partial implementation landed (settings + bundled baseline + MCP onboarding commands)
- **Owner:** TBD

## Feature Overview

MetaFlow already resolves layered AI metadata and injects Copilot-compatible settings, but users still need to bring or build their own metadata repositories and manually wire agent tool/MCP capabilities. This effort defines a canonical extension-native packaging model: ship a bundled baseline metadata capability pack with MetaFlow, expose controlled enablement through extension settings, preserve repository override precedence, and provide explicit onboarding for extension tools and MCP servers without violating VS Code trust and configuration norms. Success means new MetaFlow users get immediate high-quality defaults while advanced teams retain deterministic overlay control and safe extensibility.

## Current Focus

1. Validate migration defaults for existing workspaces and decide staged rollout defaults.
2. Expand extension-layer visibility for bundled source precedence in tree views and diagnostics.
3. Complete docs/traceability artifacts and release-readiness gate evidence.

## Next Steps

- [x] Approve settings contract (`metaflow.bundledMetadata.*`, optional `metaflow.aiTools.*`, `metaflow.mcp.*`) and default behaviors.
- [x] Implement bundled metadata source resolution in extension refresh/apply flow with workspace-managed materialization path.
- [ ] Add initialization and migration UX to adopt baseline pack in existing workspaces without destructive overwrite.
- [ ] Define and implement extension-tool contribution surface (preview-gated if necessary).
- [x] Add MCP onboarding commands to scaffold and validate `.vscode/mcp.json` entries.
- [x] Expand unit tests for settings modes, precedence behavior, and disabled/offline paths.
- [ ] Add integration coverage for command flows and setting transitions.
- [ ] Update docs/traceability and run `gate:quick`, `gate:integration`, and `gate:full` before release decision.

## References

- `.plan/bundled-ai-metadata-tools-mcp/README.md` - full architecture, scope, and phased delivery plan.
- `.plan/bundled-ai-metadata-tools-mcp/RESEARCH.md` - research summary and canonical lane model.
- `.plan/bundled-ai-metadata-tools-mcp/Phase1-Architecture-And-Contracts.md`
- `.plan/bundled-ai-metadata-tools-mcp/Phase2-Bundled-Metadata-Baseline.md`
- `.plan/bundled-ai-metadata-tools-mcp/Phase3-Tools-And-MCP-Integration.md`
- `.plan/bundled-ai-metadata-tools-mcp/Phase4-Validation-Docs-Rollout.md`
- `src/src/commands/commandHandlers.ts` - refresh/apply/settings injection lifecycle.
- `src/src/extension.ts` - activation and configuration change refresh wiring.
- `packages/engine/src/engine/settingsInjector.ts` - Copilot setting key injection contract.
- `src/package.json` - user-facing settings schema and command contributions.
- `doc/concept/CONCEPT.md` - current architecture principles and constraints.

## Decision Log

- **2026-03-01** - Treat metadata, extension tools, and MCP as separate lanes with separate UX/state controls.
- **2026-03-01** - Keep engine package pure and git/editor-tool agnostic; extension layer owns bundled source assembly and runtime orchestration.
- **2026-03-01** - Baseline bundled metadata must materialize into workspace-managed writable locations, not extension install directories.
- **2026-03-01** - MCP support will be explicit configuration/scaffolding and validation, not hidden background server bootstrapping.

## Open Questions & Risks

- Should bundled metadata be enabled by default for existing workspaces or only new init flows?
- Which bundled pack update policy is safest (`extension-version pinned` vs `replace on upgrade` vs `manual refresh`)?
- How should conflicts be surfaced when local repo metadata intentionally diverges from bundled best practices?
- Extension tool APIs and MCP UX may vary by VS Code release channel; feature flags and compatibility guards are required.
- Current unit test instability (latest local `npm run test:unit` exit code 1) can block confidence if not resolved before implementation landing.
