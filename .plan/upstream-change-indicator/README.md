# Plan: Upstream Change Indicator for Git-Backed Metadata Repositories

## Problem Statement

MetaFlow can mark repository sources as git-backed and display configured remote URLs, but it does not check whether local metadata clones are behind upstream branches. Users currently need to leave MetaFlow and run git commands manually to discover update availability.

## Goal

Add upstream-awareness for git-backed metadata repositories so users can:

1. See when updates are available (arrow indicator + tooltip in Config view).
2. Check repository sync status on demand.
3. Optionally pull updates safely from within MetaFlow.
4. Keep status fresh with automatic checks on startup and a configurable background cadence.

## Research Summary (Current State)

1. Config view already flags remote-looking URLs with `[git]`, cloud icon, and remote URL tooltip.
2. Extension exposes `metaflow.rescanRepository`, but this is local structure discovery, not remote sync.
3. Refresh plumbing already supports repo-targeted options (`forceDiscoveryRepoId`), which can be extended for targeted sync checks.
4. Engine discovery explicitly scans local clones and does not query remotes.
5. There is no current usage of VS Code Git extension API in extension source.

## Scope

### In Scope

1. Detect sync state for git-backed metadata repos (up-to-date, behind, ahead, diverged, unknown).
2. Surface state in Config tree item icon/description/tooltip.
3. Add command(s) for update check and optional pull.
4. Integrate with refresh/rescan flows without changing overlay precedence behavior.
5. Add unit/integration tests for state detection and UI rendering.
6. Add configurable automatic check cadence (`hourly`, `daily`, `weekly`, `monthly`; default `daily`).

### Out of Scope

1. Automatic pull/merge behavior in background checks.
2. Auto-pull on refresh/startup.
3. Changing engine layer resolution rules.
4. Any commit/push automation.

## UX Direction

### Indicator States (Config Repo Item)

- **Up-to-date:** current cloud/folder-style git marker with tooltip status line.
- **Behind:** down-arrow indicator plus tooltip `Updates available upstream` with counts.
- **Ahead:** upload-style indicator plus tooltip `Local commits not pushed upstream`.
- **Diverged:** warning indicator plus tooltip noting both ahead and behind.
- **Unknown/Error:** question/warning indicator with actionable error summary.

### Commands

1. `metaflow.checkRepoUpdates` (new): check one or all git-backed metadata repos.
2. `metaflow.pullRepository` (new, optional first release): run `git pull --ff-only` for selected repo.
3. Keep `metaflow.rescanRepository` semantics unchanged (layer discovery only).
4. Automatic checks run on startup and at configured cadence in silent/background mode.

## Proposed Architecture

1. Add a lightweight `RepoSyncStatus` model to extension state, keyed by `repoId`.
2. Add a git status service in extension command layer (or helper module):
   - Validate `.git` and tracking branch.
   - Run `git fetch --prune` (explicit check path only).
   - Compute ahead/behind via `git rev-list --left-right --count @{upstream}...HEAD`.
3. Extend `ConfigTreeViewProvider` to read sync status and decorate repo items.
4. Register new commands and wire into view item context actions.
5. Ensure state refresh invalidates stale sync status after pull/rescan/refresh.
6. Add a scheduler in extension activation that triggers `metaflow.checkRepoUpdates` with silent mode on startup and by interval setting.

## Constraints

1. Preserve engine purity and existing safety expectations.
2. Avoid implicit merges: pull command must be fast-forward-only.
3. Keep behavior robust when git is unavailable or auth fails.
4. Maintain compatibility with existing configs (no new required config fields).
5. Background checks should not spam notifications (silent mode required).

## Success Criteria

1. Git-backed repo rows show explicit update state after check command.
2. Behind repos show clear arrow indicator and tooltip with actionable guidance.
3. Pull command updates local clone when fast-forward is possible.
4. Refresh after pull reflects new layer/file state without manual config surgery.
5. Unit and integration tests cover normal and failure paths.
6. Automatic startup + interval checks execute without user intervention and respect configured cadence.

## Phase Breakdown

1. `Phase1-Repo-Status-Detection.md` - git status service and state model.
2. `Phase2-Config-UI-Indicator.md` - Config item visuals, tooltip, and command wiring.
3. `Phase3-Pull-Workflow-and-Verification.md` - pull flow, tests, docs, and rollout checks.

## Dependencies

- `src/src/commands/commandHandlers.ts`
- `src/src/commands/commandHelpers.ts`
- `src/src/views/configTreeView.ts`
- `src/package.json`
- Existing integration tests under `src/src/test/integration/`

## Risks

1. Network/auth variability can produce noisy failures.
2. `git fetch` can be slow on large repos or poor connections.
3. Pull conflicts/divergence require clear, non-destructive fallback guidance.

## References

- `src/src/views/configTreeView.ts`
- `src/src/commands/commandHandlers.ts`
- `src/src/commands/commandHelpers.ts`
- `src/package.json`
- `packages/engine/src/engine/overlayEngine.ts`
- `.plan/repo-change-detection/README.md`
