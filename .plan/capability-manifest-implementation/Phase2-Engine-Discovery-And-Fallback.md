# Phase 2 - Engine Discovery and Fallback

## Objective

Integrate capability manifest discovery into layer resolution without changing existing deterministic ordering.

## Tasks

- [x] Detect `CAPABILITY.md` at capability/layer roots during discovery.
- [x] Bind manifest metadata to internal capability identity derived from folder name.
- [x] Define fallback metadata when no manifest exists.
- [x] Propagate warnings through existing diagnostics pathways.
- [x] Add engine integration tests covering mixed manifest/no-manifest repositories.

## Acceptance Criteria

1. Existing repositories behave identically when no manifests are present.
2. Metadata is available in resolved runtime state when manifests exist.
3. Warning pathways are visible and test-covered.

## Test Strategy

1. Extend `test-workspace` fixtures with sample capabilities with and without manifests.
2. Add resolver tests in `packages/engine/test/engine.test.ts` or focused new test files.
3. Verify deterministic ordering remains unchanged.

## Risks

1. Ambiguous layer root detection could attach metadata to wrong scope.
2. Performance regressions if manifest reads are repeated without caching.
