# Open Source Readiness Rubric – Context

- **Last updated:** 2026-03-03
- **Status:** Planning complete; execution queued
- **Owner:** MetaFlow maintainers (DynF/X Digital)

## Feature Overview

This effort closes practical open-source readiness gaps identified in a March 2026 rubric-based review of MetaFlow. The objective is to keep current technical quality while improving repository consumability for external users: clearer expectations for a preview-stage extension, better release/change visibility, stronger onboarding artifacts, and explicit hygiene/risk handling.

## Current Focus

1. Establish a plan-first execution path for readiness gap closure.
2. Prioritize low-friction, high-signal documentation and release-hygiene improvements.
3. Sequence work so public-facing clarity lands before launch/promotion actions.

## Next Steps

- [ ] Create root `CHANGELOG.md` and align it with `src/CHANGELOG.md` release entries.
- [ ] Update `README.md` with `Known Issues / Limitations` and `Roadmap` sections.
- [ ] Add screenshot/GIF references to demonstrate core extension workflows.
- [ ] Run `npm audit`, classify findings (fix now vs accepted risk), and document decisions.
- [ ] Publish a short launch checklist for repo visibility settings (Issues, Discussions, releases, tags).
- [ ] Validate clean clone commands and record evidence in PR validation notes.

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

## Open Questions & Risks

- Who is the final owner for changelog governance across root, extension, engine, and CLI scopes?
- Do maintainers want Discussions enabled at launch, or defer until issue volume justifies moderation overhead?
- Dependency advisories may include transitive findings without immediate upstream patches; risk acceptance criteria must be explicit.
- Missing visual assets (screenshot/GIF) could delay final README polish if not prepared early.
