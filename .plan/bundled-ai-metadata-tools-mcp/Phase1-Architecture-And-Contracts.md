# Phase 1 - Architecture and Contracts

## Objective

Finalize the canonical architecture and configuration contracts for three integration lanes: bundled metadata, extension tools, and MCP onboarding.

## Deliverables

1. Approved settings schema changes in `src/package.json`.
2. Runtime architecture notes for bundled metadata source resolution and precedence.
3. Tool/MCP capability boundaries and feature-flag strategy.
4. Traceability mapping updates for new/changed requirements.

## Implementation Tasks

- [ ] Define and approve `metaflow.bundledMetadata.*` settings contract.
- [ ] Define migration behavior for existing workspaces (default off/on rules, prompt strategy).
- [ ] Define managed workspace path and retention policy for bundled assets.
- [ ] Define precedence and conflict policy (bundled baseline vs repo/local overrides).
- [ ] Define `metaflow.aiTools.*` and `metaflow.mcp.*` settings and compatibility gates.
- [ ] Update or add concept/design docs to reflect lane separation and lifecycle.

## Testing and Validation

- [ ] Add schema-focused unit checks for new settings defaults and enum validation.
- [ ] Add command-helper tests for option parsing and migration behaviors.
- [ ] Verify no regression in existing refresh/apply behavior when new settings are unset.

## Exit Criteria

1. Architecture and settings contracts are documented and approved.
2. Compatibility and migration rules are explicit and testable.
3. No unresolved P0 decisions remain for implementation phases.

## Risks and Mitigations

- Risk: setting sprawl and user confusion.
- Mitigation: grouped settings, strong defaults, and concise in-product descriptions.

- Risk: accidental behavior change in existing repos.
- Mitigation: migration guard plus explicit opt-in for legacy workspaces.
