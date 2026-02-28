# Phase 3 - CLI and Extension UX

## Objective

Expose capability metadata in user-visible surfaces where layer intent matters most.

## Tasks

1. Update CLI `status` output to include capability `name`, `description`, and `license` when available.
2. Add formatting rules for concise fallback output when metadata is absent.
3. Update extension `LAYERS` view labels/tooltips with capability metadata.
4. Update `EFFECTIVE FILES` provenance displays to reference capability metadata where useful.
5. Add unit/integration tests for CLI rendering and extension view behavior.

## Acceptance Criteria

1. CLI output remains readable in both manifest and non-manifest repos.
2. Extension views surface metadata without reducing navigation clarity.
3. No regressions in existing command output parsing expectations.

## Test Strategy

1. Add targeted CLI tests in `packages/cli/test/` for status rendering.
2. Add extension unit tests under `src/src/test/unit/` for view/provider labels.
3. Run `npm run test:unit` at repo root before phase completion.

## Risks

1. Long descriptions can clutter tree views; truncation and tooltip strategy required.
2. Existing snapshot tests may need controlled updates for new display text.
