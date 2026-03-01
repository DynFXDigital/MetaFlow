# Phase 3 - Pull Workflow and Verification

## Objective

Provide an explicit in-extension pull path for git-backed metadata repositories and validate end-to-end behavior.

## Deliverables

1. `metaflow.pullRepository` command using safe pull semantics.
2. Post-pull refresh chain to update layers/files/status.
3. Expanded tests and documentation updates.

## Implementation Tasks

- [x] Implement pull command:
  - run `git pull --ff-only`
  - handle no-upstream and divergence failures cleanly
  - avoid implicit merge commits
- [x] On successful pull:
  - trigger `metaflow.refresh` (and optional targeted discovery)
  - refresh sync status map
  - show concise success summary
- [x] On failure:
  - show clear remediation text (`manual resolve`, `set upstream`, etc.)
  - preserve existing state without destructive fallback
- [x] Document command behavior in `src/README.md` and top-level docs as needed.

## Testing

- [x] Unit tests for pull command success/failure mappings.
- [ ] Integration test for behind -> pull -> up-to-date transition.
- [ ] Regression test to confirm no commit/push automation is introduced.

## Exit Criteria

1. Users can update stale metadata clones from MetaFlow without leaving VS Code.
2. Pull command never creates merge commits (`--ff-only` enforced).
3. Tests pass for update-check and pull pathways.
4. Documentation reflects new command and UX behavior.

## Rollout Notes

- Start with explicit command invocation only.
- Consider optional auto-check-on-refresh in a future follow-up once telemetry/usability data exists.
