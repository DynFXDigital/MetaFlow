# Phase 3 - Process and Test-Gate Hardening

## Objective

Ensure CI and release workflows enforce the intended quality gate and prevent regression of documentation/process drift.

## Tasks

- [ ] Define and document test-gate policy: minimum suites for PR CI and release tags.
- [ ] Update `.github/workflows/ci.yml` to match intended gate (including engine/CLI/extension coverage as required).
- [ ] Update `.github/workflows/release.yml` to enforce release gate consistently with policy.
- [ ] Add workflow comments explaining why each suite is included/excluded.
- [ ] Add lightweight drift checks for critical documented counts/claims where practical.
- [ ] Validate workflow updates through targeted dry runs or equivalent verification.

## Deliverables

1. Updated CI/release workflow files with explicit test policy.
2. Evidence notes proving expected suites run at the intended stages.
3. Residual-risk note for any intentionally deferred suites (with owner/date).

## Completion Criteria

- Workflow behavior is explicit, reproducible, and aligned with release-readiness intent.
- No high-risk test-suite omission remains undocumented.
