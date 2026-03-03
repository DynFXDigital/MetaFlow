# Open Source Readiness Rubric – Context

- **Last updated:** 2026-03-03
- **Status:** Phase 1 complete; Phase 2 in progress
- **Owner:** MetaFlow maintainers (DynF/X Digital)

## Feature Overview

This effort closes practical open-source readiness gaps identified in a March 2026 rubric-based review of MetaFlow. The objective is to keep current technical quality while improving repository consumability for external users: clearer expectations for a preview-stage extension, better release/change visibility, stronger onboarding artifacts, and explicit hygiene/risk handling.

## Current Focus

1. Execute Phase 2 baseline verification commands on clean workspace state.
2. Triage dependency advisories and document explicit fix/defer/accept decisions.
3. Capture security hygiene statements needed for open-source launch clarity.

## Next Steps

- [ ] Execute and record baseline commands (`npm ci`, `npm run build`, `npm run test:unit`).
- [ ] Run `npm audit`, classify findings (fix now vs accepted risk), and document decisions.
- [ ] Confirm no secrets/internal endpoints in tracked files (regex + manual review).
- [ ] Document runtime env-var expectations (`.env.example` required or not required).
- [ ] Publish a short launch checklist for repo visibility settings (Issues, Discussions, releases, tags).

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

## Open Questions & Risks

- Who is the final owner for changelog governance across root, extension, engine, and CLI scopes?
- Do maintainers want Discussions enabled at launch, or defer until issue volume justifies moderation overhead?
- Dependency advisories may include transitive findings without immediate upstream patches; risk acceptance criteria must be explicit.
- Missing visual assets (screenshot/GIF) could delay final README polish if not prepared early.
