# Phase 1 - Repo Status Detection

## Objective

Implement deterministic, on-demand upstream sync detection for git-backed metadata repositories and store results in extension state.

## Deliverables

1. `RepoSyncStatus` type and state map keyed by `repoId`.
2. Git status helper module in extension layer.
3. New command `metaflow.checkRepoUpdates`.
4. Output channel logging and user-facing summary messages.

## Implementation Tasks

- [x] Define sync state model:
  - `state`: `upToDate | behind | ahead | diverged | unknown`
  - `aheadCount`, `behindCount`, `trackingRef`, `lastCheckedAt`, `error`
- [x] Add helper(s) to run git commands safely:
  - detect git repo and current branch
  - detect upstream tracking ref
  - fetch remote refs (`git fetch --prune`)
  - compute ahead/behind counts
- [x] Integrate status map into `ExtensionState` lifecycle.
- [x] Add `metaflow.checkRepoUpdates` command for one/all repos.
- [x] Add command argument support for targeted repo IDs.

## Testing

- [x] Unit tests for parsing and state mapping (ahead/behind/diverged).
- [x] Unit tests for error branches (no git, no upstream, fetch fail, detached HEAD).
- [x] Integration smoke test for command invocation and state updates.

## Exit Criteria

1. Running check command populates sync status for each git-backed repo.
2. Failures degrade to `unknown` state with actionable logs.
3. No engine package changes required.

## Notes

- Keep all git execution in extension-side modules.
- Automatic startup + interval checks now run via extension-side scheduler (follow-on add-on).
