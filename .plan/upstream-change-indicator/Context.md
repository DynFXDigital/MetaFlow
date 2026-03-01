# UpstreamChangeIndicator - Context

- **Last updated:** 2026-03-01
- **Status:** Implemented and verified (unit + integration)
- **Owner:** TBD

## Feature Overview

MetaFlow currently recognizes git-backed metadata repositories and supports local rescan/refresh flows, but it does not detect when local metadata clones are behind their upstream remotes. This enhancement adds upstream change awareness for git-backed repos in the Config view, including an arrow indicator and tooltip when updates are available, plus an explicit pull workflow option. It now also includes automatic checks on startup and on a configurable background cadence. Success means users can quickly see when metadata sources are stale and update them safely without leaving MetaFlow context.

## Current Focus

1. Validate behavior on additional real-world git topologies (ahead/diverged/no-upstream).
2. Validate scheduler cadence behavior in long-running extension sessions.
3. Expand docs/traceability mappings if this feature graduates from preview.

## Next Steps

- [x] Implement a repo sync status service in extension code that computes ahead/behind from tracking branches.
- [x] Add a command to check git-backed repository update status and refresh Config view metadata.
- [x] Add Config tree indicator and tooltip messaging for up-to-date, behind, ahead, diverged, and unknown states.
- [x] Add an explicit pull command using fast-forward-only semantics, with clear conflict/failure messaging.
- [x] Add unit and integration tests for status detection, icon/tooltip rendering, and command behavior.
- [x] Update docs and traceability artifacts for new command(s), UX behavior, and constraints.
- [x] Add automatic checks on startup and a configurable check interval with preset cadence values.

## References

- `.plan/upstream-change-indicator/README.md` - feature plan, scope, and architecture.
- `.plan/upstream-change-indicator/Phase1-Repo-Status-Detection.md` - git status detection design and tasks.
- `.plan/upstream-change-indicator/Phase2-Config-UI-Indicator.md` - Config tree icon and tooltip integration.
- `.plan/upstream-change-indicator/Phase3-Pull-Workflow-and-Verification.md` - pull command, tests, and rollout.
- `src/src/views/configTreeView.ts` - current git marker and tooltip behavior.
- `src/src/commands/commandHandlers.ts` - existing refresh/rescan command registration and state orchestration.
- `src/src/commands/commandHelpers.ts` - refresh command options and repo ID extraction helpers.
- `src/package.json` - command and view contribution points.
- `packages/engine/src/engine/overlayEngine.ts` - current discovery is local-only; no remote querying.
- `.plan/repo-change-detection/README.md` - prior decision to keep discovery local-only.

## Decision Log

- **2026-03-01** - Keep remote status and pull behavior in extension code only; engine remains pure and git-agnostic.
- **2026-03-01** - Add automatic background checks on startup and on configurable cadence (`hourly`/`daily`/`weekly`/`monthly`, default `daily`).
- **2026-03-01** - Use `git pull --ff-only` for in-extension pull to avoid implicit merge commits.
- **2026-03-01** - Keep existing local discovery behavior unchanged; upstream status is additive UX, not a replacement.

## Open Questions & Risks

- Should `git fetch` run automatically during `metaflow.refresh`, or only via explicit check/pull commands?
- How should remote auth/network failures be represented in UI without creating noisy warnings?
- Should non-git local paths still show neutral state, or hide status affordances entirely?
- Remote workspaces and constrained environments may not have git CLI available in PATH.
- Pulling updates can invalidate prior layer assumptions; refresh/apply chaining must remain deterministic.
