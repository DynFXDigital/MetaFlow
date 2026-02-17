# Phase 4 – Validation and Documentation

## Objective

Verify behavior end-to-end and document the new initialization paths for maintainers and users.

## Tasks

- [ ] Add/refresh engine unit tests for discovery utilities.
- [ ] Add/refresh CLI tests for mode flags, URL clone flows (mocked), scaffold outputs, and config validation.
- [ ] Add/refresh extension tests for command prompts and file output behavior.
- [ ] Run targeted suites first, then broader repo test commands required by maintainers.
- [ ] Update docs with practical examples and troubleshooting:
  - `packages/cli/README.md`
  - `src/README.md`
- [ ] Add release note entry if behavior change is user-visible in next VSIX release train.

## Test Matrix

| Scenario | Engine Unit | CLI Test | Extension Test |
|---|---|---|---|
| Discover nested `.github` folders | Yes | Indirect | Indirect |
| Existing directory with valid layers | Yes | Yes | Yes |
| Existing directory with no layers | Yes | Yes | Yes |
| URL clone default destination | N/A | Yes | Yes |
| URL clone custom destination | N/A | Yes | Yes |
| URL clone failure (`git` missing/network) | N/A | Yes | Yes |
| Empty scaffold creation | N/A | Yes | Yes |
| Overwrite confirmation behavior | N/A | Yes | Yes |

## Acceptance Criteria

- Required targeted tests pass for changed modules.
- Existing core command behavior remains backward compatible outside init improvements.
- Documentation clearly explains each source mode and default clone destination.

## Rollout Notes

- Treat this as additive UX; no migration needed for existing `.metaflow.json` users.
- Keep telemetry/logging minimal and privacy-safe (no full URL/path logs beyond current standards).
