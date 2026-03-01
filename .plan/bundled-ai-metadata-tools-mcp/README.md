# Plan: Bundle MetaFlow AI Metadata, Tools, and MCP Onboarding

## Problem Statement

MetaFlow currently assumes users provide and manage external metadata repositories, then uses overlay + settings/materialization flows to realize instructions, prompts, skills, agents, and hooks. This is powerful but leaves a first-run quality gap: users without a mature metadata repo get weak defaults, and there is no unified extension-native path for adding editor tools or MCP server workflows aligned with MetaFlow best practices.

## Goal

Create a canonical, extension-native packaging strategy that:

1. Ships a high-quality baseline capability pack with MetaFlow.
2. Lets users control baseline enablement and behavior through settings.
3. Preserves deterministic layer precedence so repo/local metadata can override baseline behavior.
4. Adds explicit, safe onboarding for extension tools and MCP servers.
5. Keeps MetaFlow aligned with VS Code and Copilot integration patterns.

## Scope

### In Scope

1. Bundled metadata asset strategy and runtime materialization/sync model.
2. New settings surface for baseline metadata enablement and mode selection.
3. Refresh/apply/init integration for baseline metadata.
4. Optional extension tool contribution and command workflows.
5. MCP onboarding UX (scaffold/validate `mcp.json`, diagnostics, and guidance).
6. Unit/integration tests and docs/traceability updates.

### Out of Scope

1. Auto-publishing or auto-updating external MCP servers without user consent.
2. Hidden background MCP process management beyond explicit user-enabled flows.
3. Rewriting engine overlay semantics or file classification fundamentals.
4. Breaking changes to existing user configs without migration controls.

## Constraints

1. Preserve engine purity (no `vscode` imports in engine package).
2. Respect Workspace Trust, explicit user consent, and least-privilege behavior.
3. Keep settings backward compatible with current `metaflow.injection.modes` and `hooksEnabled` behavior.
4. Avoid runtime writes into extension install paths.
5. Support deterministic behavior across Windows/macOS/Linux.
6. Meet existing gate policy (`gate:quick`, `gate:integration`, `gate:full`).

## Canonical Lane Model

1. **Metadata lane (bundled baseline + overlays):** extension ships templates/assets, realizes them into workspace-managed paths, then overlays with configured metadata repos.
2. **Tools lane (extension-native):** extension-contributed tools are surfaced as explicit capabilities/settings and guarded by compatibility checks.
3. **MCP lane (external servers):** extension assists users in creating/validating `mcp.json` entries and trust-aware enablement, without opaque server bundling.

## Proposed Settings (Draft)

1. `metaflow.bundledMetadata.enabled` (`boolean`, default `true` for new init; migration-gated for existing workspaces).
2. `metaflow.bundledMetadata.mode` (`baseline-plus-local` | `baseline-only` | `off`).
3. `metaflow.bundledMetadata.updatePolicy` (`pinned-to-extension` | `manual-refresh`).
4. `metaflow.aiTools.enabled` (`boolean`, default `false` initially).
5. `metaflow.mcp.assistEnabled` (`boolean`, default `false`).
6. `metaflow.mcp.configMode` (`workspace` | `profile`) for onboarding target.

## Architecture Summary

1. Add a bundled asset manifest under extension source (for example `src/assets/bundled-metadata/**`).
2. On refresh/init, resolve bundled source into a managed workspace location (for example `.metaflow/system/bundled/<version>/`).
3. Treat bundled source as a virtual low-precedence layer before user-configured layers.
4. Reuse current overlay/classification/injection pipeline for final effective file map.
5. Add command UX for enabling baseline pack, inspecting effective precedence, and repairing drift.
6. Add optional command UX for MCP config scaffolding/validation and extension tool enablement checks.

## Dependencies

- Extension command/state lifecycle in `src/src/commands/commandHandlers.ts`.
- Activation/config refresh in `src/src/extension.ts`.
- Settings schema in `src/package.json`.
- Classifier/materializer/settings injector in `packages/engine/src/engine/`.
- Existing docs and traceability artifacts under `doc/`.

## Risks

1. Default-enabling baseline metadata in existing repos could surprise users if not migration-gated.
2. Path and permission edge cases for managed workspace directories in remote/readonly environments.
3. API and feature drift across VS Code channels for tools/agents/skills/MCP surfaces.
4. Increased test matrix complexity across settings combinations and compatibility tiers.

## Success Criteria

1. New users can enable a usable baseline metadata experience in under 2 minutes.
2. Existing users can opt in/out without breaking current repo-managed metadata workflows.
3. Precedence remains deterministic and transparent in views/status output.
4. Tool and MCP onboarding flows are explicit, reversible, and trust-aware.
5. Full validation passes with no regressions in existing metadata sync behavior.

## Phase Breakdown

1. `Phase1-Architecture-And-Contracts.md` - finalize lane architecture and settings contract.
2. `Phase2-Bundled-Metadata-Baseline.md` - implement bundled metadata source and lifecycle integration.
3. `Phase3-Tools-And-MCP-Integration.md` - implement extension tools gating + MCP onboarding UX.
4. `Phase4-Validation-Docs-Rollout.md` - complete tests, docs, traceability, and release readiness.
