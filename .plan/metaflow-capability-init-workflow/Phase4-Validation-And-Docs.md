# Phase 4 - Validation and Docs

## Objective

Close the feature with test coverage, documentation updates, and release-facing change notes.

## Test Matrix

| Scenario | Unit | Integration |
|---|---|---|
| Initialize command shows two capability setup paths | Yes | Yes |
| Materialize mode overwrites managed files | Yes | Yes |
| Built-in mode writes workspace state only (no config mutation) | Yes | Yes |
| Synthetic built-in source appears in views | Yes | Yes |
| Synthetic built-in layer is toggleable and persists | Yes | Yes |
| Toggling built-in layer updates effective files/settings impact | Yes | Yes |
| Remove command disables built-in mode | Yes | Yes |
| Remove command deletes only managed materialized capability files | Yes | Yes |
| Cancel paths have no side effects | Yes | Yes |

## Tasks

- [x] Add unit coverage for command branching/state persistence and UI synthetic-node behavior.
- [x] Add integration coverage in `src/src/test/integration/commands.test.ts` for both setup paths, toggles, and remove flows.
- [x] Run targeted tests first, then run `npm run test:unit` from repo root.
- [x] Update docs:
  - `README.md`
  - `src/README.md`
- [x] Update changelogs:
  - `CHANGELOG.md`
  - `src/CHANGELOG.md`
- [x] Verify terminology consistency: "MetaFlow capability" language only.

## Acceptance Criteria

- Required test suites pass with no regressions in existing command behavior.
- Documentation accurately reflects setup modes, toggles, and removal workflows.
- Changelog entries describe behavior change and migration impact clearly.

## Rollout Notes

- This is an additive UX change with behavior differences in initialization semantics.
- Existing users can continue config-driven workflows unchanged.
- Built-in capability mode remains workspace-local by design and not config-portable.
