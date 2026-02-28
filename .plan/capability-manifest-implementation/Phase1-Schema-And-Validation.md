# Phase 1 - Schema and Validation

## Objective

Define and implement the canonical `CAPABILITY.md` parser contract and warning model.

## Tasks

1. Add a capability manifest parser in engine utilities.
2. Implement frontmatter extraction and basic markdown-body passthrough.
3. Validate required keys (`name`, `description`).
4. Validate optional `license` against SPDX identifier/expression rules and fallback token.
5. Emit structured warnings for parse and validation issues.
6. Add unit tests for valid, missing, malformed, and unknown-key cases.

## Acceptance Criteria

1. Parser returns a normalized metadata object for valid manifests.
2. Invalid manifests do not break runtime; warnings are emitted deterministically.
3. Unit tests demonstrate stable behavior for edge cases.

## Test Strategy

1. Add focused parser tests in `packages/engine/test/`.
2. Include fixtures for malformed YAML and invalid license values.
3. Assert exact warning codes/messages where practical.

## Risks

1. YAML parsing differences could create non-deterministic diagnostics.
2. Full SPDX expression parsing may require additional dependency or constrained syntax support.
