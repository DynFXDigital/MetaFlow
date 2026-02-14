# Phase 1 – CI Hardening

## Objective

Raise CI from single-environment validation to production-grade confidence for cross-platform extension behavior and packaging.

## Deliverables

- CI matrix for `ubuntu-latest` and `windows-latest` (optionally `macos-latest` after stabilization).
- Consistent Node runtime policy (LTS pinning strategy).
- Split jobs for fast feedback (`lint/build/test`) and heavyweight checks (`integration`, `package`).
- Required check names finalized for branch protection.

## Tasks

- [x] Refactor `.github/workflows/ci.yml`:
   - [x] Add matrix job for build + unit tests on Linux/Windows.
   - [x] Keep integration tests in a focused job to control runtime.
   - [x] Keep VSIX packaging as an artifact-producing downstream job.
- [x] Add workflow hygiene:
   - [x] Use explicit `permissions` per job.
   - [x] Add timeout limits to long-running jobs.
   - [x] Add `paths-ignore` for docs-only changes where safe.
- [x] Ensure predictable dependency install:
   - [x] Validate npm cache behavior per OS.
   - [x] Fail fast on lockfile drift.
- [ ] Define required-status checks:
   - [x] Document exact check names in maintainer notes.
   - [ ] Enforce via branch protection settings.

## Validation

- [ ] Open test PR with representative changes in `src/`, `packages/engine`, and `packages/cli`.
- [ ] Verify each job runs expected command subset.
- [ ] Confirm VSIX artifact is uploaded and downloadable.

## Exit Criteria

- CI produces consistent pass/fail outcomes across Linux and Windows.
- Integration and package checks are no longer single points of opaque failure.
- Required status checks are enforced for `main`.

## Risks

- Extension host tests can be flaky in CI.
  - Mitigation: isolate integration job; add retries only where deterministic.
