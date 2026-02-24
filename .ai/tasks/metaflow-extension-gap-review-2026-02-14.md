# MetaFlow Extension Gap Review (2026-02-14)

Checklist of high-priority deltas between concept/spec/plan and current implementation.

Roadmap adaptation goal: incorporate proven UX patterns from instruction-sync extensions (easy onboarding, clear preview/diff, conflict guidance, selective sync), while keeping MetaFlow's deterministic managed-state + promotion governance model as the core differentiator.

## Settings Injection

- [x] Inject settings for skills when `injection.skills = "settings"`.
- [x] Inject settings for agents when `injection.agents = "settings"`.
- [x] Inject hook file paths into Copilot hook settings (not only `metaflow.hooks.*`).
- [x] Remove injected settings keys during `metaflow.clean`.
- [x] Honor `metaflow.hooksEnabled` setting to gate hook path injection.

## Materialization Behavior

- [x] Apply source-scoped filename format `_<repo>-<dir>-<dir>__<metadata-name>.md` for materialized artifacts.
- [x] Ensure managed-state tracking and drift detection use prefixed output paths consistently.

## Command/UI Gaps

- [x] Add progress UI for `metaflow.clean` to match apply progress behavior.
- [x] Decide and implement single-repo layer toggling behavior (or explicitly mark unsupported). <!-- single-repo layers rendered with toggleable:true via ensureMultiRepoConfig normalization; description shows '(single-repo, fixed order)' only when toggleable:false -->

## Spec & Tests Alignment

- [ ] Reconcile concept/spec statements for skills/agents default realization (materialized vs settings-capable).
- [x] Add integration tests that assert workspace settings updates after `metaflow.apply`. <!-- commands.test.ts:111 -->
- [x] Add integration tests that assert settings cleanup after `metaflow.clean`. <!-- commands.test.ts:295 -->
- [x] Add tests for source-scoped materialization naming behavior.

## Roadmap Adaptation (Pattern-Driven)

### Milestone 1 — Fast Adoption & Trust (Now)

- [ ] Add a first-run command flow: `initConfig` -> `preview` -> `apply` -> `status` with concise success/failure summaries. <!-- initConfig exists standalone; no chained onboarding flow -->
- [x] Make preview output explicitly list pending `add/update/skip/remove` per file in a user-scannable format. <!-- PendingAction type + CLI preview outputs ${c.action} per change -->
- [ ] Add clear conflict resolution guidance when drift blocks apply/clean (`keep local`, `take shared`, `merge manually`). <!-- drifted files show 'skip' but no resolution hints surfaced to user -->
- [ ] Add selective apply scope support (artifact type and/or path filters) for safer incremental rollout. <!-- no --type or --path flags on apply command -->

### Milestone 2 — Governance UX (Next)

- [ ] Add a consolidated status surface (command output and/or view) showing: last apply time, drift count, managed count, active profile, and settings injection state. <!-- Extension metaflow.status has most fields (config, profile, managed count, last apply, drift count) but lacks settings injection state. CLI status missing last apply, drift count, managed count. -->
- [ ] Standardize provenance visibility by surfacing source repo/layer/path for materialized files in preview/status output. <!-- sourceLayer/sourceRepo tracked in engine and exposed in JSON mode; human-readable preview omits them -->
- [ ] Add a dry-run option for clean/status workflows to increase confidence before destructive actions.
- [ ] Document a team operator playbook for conflict handling and promotion decision points.

### Milestone 3 — Promotion Workflow Hardening (Later)

- [x] Expand `metaflow.promote` from detection-only toward guided branch/commit/PR scaffolding (no auto-push). <!-- promote --auto: creates branch + commits drifted files to metadata repo; no auto-push -->
- [ ] Add commit/PR template generation for metadata promotions to improve consistency across repos.
- [ ] Add policy checks before promotion (required provenance, drift-free prerequisites, config validity).
- [ ] Add integration tests covering end-to-end promote preparation workflow from drift detection to staged artifacts. <!-- only no-drift smoke test exists; no full drift→branch→commit test -->
