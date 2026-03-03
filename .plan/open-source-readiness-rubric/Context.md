# Open Source Readiness Rubric – Context

- **Last updated:** 2026-03-03
- **Status:** Phase 2 complete; Phase 3 in progress
- **Owner:** MetaFlow maintainers (DynF/X Digital)

## Feature Overview

This effort closes practical open-source readiness gaps identified in a March 2026 rubric-based review of MetaFlow. The objective is to keep current technical quality while improving repository consumability for external users: clearer expectations for a preview-stage extension, better release/change visibility, stronger onboarding artifacts, and explicit hygiene/risk handling.

## Current Focus

1. Execute Phase 3 launch-mechanics checks against current templates and release docs.
2. Publish a concise launch checklist for Issues, Discussions, tags, and release notes.
3. Validate Marketplace publication prerequisites documentation and token-handling guidance.

## Next Steps

- [ ] Verify issue templates and PR template align with updated README/support policy.
- [ ] Confirm release process docs reflect `v0.x` preview semantics and versioning policy.
- [ ] Add launch checklist for Issues/Discussions/tags/release-note expectations.
- [ ] Validate Marketplace publication prerequisites and token handling docs.
- [ ] Rehearse one preview release path (tag or manual dispatch dry run evidence).

## References

- `.plan/open-source-readiness-rubric/README.md` – main roadmap and scope
- `.plan/open-source-readiness-rubric/Phase1-Repo-Consumability.md`
- `.plan/open-source-readiness-rubric/Phase2-Hygiene-And-Baseline.md`
- `.plan/open-source-readiness-rubric/Phase3-Launch-Mechanics.md`
- `README.md` – current public-facing repo onboarding
- `.github/CONTRIBUTING.md` – contributor workflow baseline
- `.github/workflows/ci.yml` – automated build/test checks
- `.github/workflows/release.yml` – release and marketplace publication flow
- `src/CHANGELOG.md` – existing package-level release history

## Decision Log

- **2026-03-03** – Keep this as a focused readiness-gap plan, not a broader product roadmap rewrite.
- **2026-03-03** – Prioritize public-documentation clarity before automation changes.
- **2026-03-03** – Treat unresolved dependency advisories as a tracked decision (fix/defer/accept), never implicit.
- **2026-03-03** – Maintain pre-1.0 signaling in docs and releases to set accurate stability expectations.
- **2026-03-03** – Completed Phase 1 repository consumability updates (root changelog, preview messaging, known limitations, roadmap, and README link verification).
- **2026-03-03** – Completed Phase 2 hygiene baseline: clean-clone command pass, audit triage report, remediation backlog, tracked-file secret/internal-url scan, and explicit no-runtime-env documentation.

## Open Questions & Risks

- Who is the final owner for changelog governance across root, extension, engine, and CLI scopes?
- Do maintainers want Discussions enabled at launch, or defer until issue volume justifies moderation overhead?
- Dependency advisories may include transitive findings without immediate upstream patches; risk acceptance criteria must be explicit.
- Missing visual assets (screenshot/GIF) could delay final README polish if not prepared early.
