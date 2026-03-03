# Phase 1: Repository Consumability

## Goal

Make the repository understandable and usable by first-time external contributors without prior context.

## Scope

- Root-level docs for release visibility and contributor expectations.
- Public-facing README clarity and maturity signaling.
- Visual product context for faster onboarding.

## Work Items

- [ ] Add root `CHANGELOG.md` with initial entries and links to package changelogs.
- [ ] Add a concise README maturity banner (`v0.x preview`, stability caveat).
- [ ] Add `Known Issues / Limitations` section with concrete current constraints.
- [ ] Add `Roadmap` section with near-term milestones and ownership hints.
- [ ] Add screenshot and optional GIF references for key extension workflows.
- [ ] Verify all README links resolve (`README.md`, `SUPPORT.md`, release links).

## Acceptance Criteria

- Root `CHANGELOG.md` exists and is linked from `README.md`.
- README includes installation, usage, known limitations, and roadmap in one scan.
- At least one image demonstrates extension UI/value.
- Reviewer can identify project maturity and support expectations within 30 seconds.

## Evidence

- PR diff touching `README.md`, `CHANGELOG.md`, and linked assets.
- Link-check output or manual verification notes in PR description.

## Risks

- Overly vague Known Issues section can still trigger duplicate issues.
- Missing screenshots at merge time reduces perceived product readiness.
