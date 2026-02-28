# Phase 4 - Adoption and Rollout

## Objective

Ship capability manifests as an opt-in feature with clear migration guidance and quality gates.

## Tasks

- [x] Add documentation for creating `CAPABILITY.md` files in capability/layer roots.
- [x] Provide examples in `test-workspace` and docs.
- [x] Add migration notes from prior capability-first conceptual docs.
- [x] Run quality gates (`gate:quick`, then integration where relevant).
- [x] Record traceability updates if behavior/spec docs are impacted.

## Acceptance Criteria

1. Feature is documented with examples and non-breaking migration path.
2. Unit tests pass and relevant integration tests pass.
3. Release notes summarize behavior and warning model.

## Rollout Strategy

1. Release as optional metadata support.
2. Keep warnings informational initially.
3. Evaluate stricter validation only after adoption evidence.

## Risks

1. Teams may assume manifests are required; docs must emphasize optionality.
2. Divergence between docs and parser behavior if schema evolves without tests.
