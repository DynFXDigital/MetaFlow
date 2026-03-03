# Open Source Readiness Rubric Closure Plan

## Overview

This plan operationalizes the March 2026 open-source readiness review for MetaFlow into concrete, trackable steps. The goal is to make the repository immediately consumable by external contributors, reduce onboarding ambiguity, and establish a low-risk path from "works today" to "safe to operate publicly at scale."

## Problem Statement

MetaFlow already has strong CI, release automation, and governance scaffolding, but a few practical readiness gaps remain for first-time external users: no root-level changelog, no explicit Known Issues/Roadmap signaling in the public README, limited visual product context in docs, and unresolved dependency-vulnerability triage output from clean install. These are not architecture blockers, but they materially affect contributor trust, issue quality, and release confidence.

## Scope

### In Scope

- Add and maintain a root `CHANGELOG.md` suitable for repository-level release notes.
- Update root `README.md` with:
  - explicit `Known Issues / Limitations`
  - explicit `Roadmap / Near-term milestones`
  - one or more product screenshots/GIF links
  - clear expectation banner for pre-1.0 preview maturity.
- Perform dependency hygiene triage (`npm audit`) and capture remediation/acceptance plan.
- Validate "stranger clone" baseline (`npm ci`, `npm run build`, `npm run test:unit`) and document outcomes.
- Align GitHub templates/release process references with updated docs where needed.

### Out of Scope

- Core extension architecture redesign.
- New product features unrelated to open-source onboarding/readiness.
- Marketplace branding overhaul beyond minimal screenshot/demo improvements.
- Replacing existing release pipelines or package manager strategy.

## Constraints

- Preserve current npm workspace layout and commands.
- Avoid breaking current CI/release workflows under `.github/workflows/`.
- Keep messaging honest: project remains pre-1.0 and preview-grade.
- Changes should be incremental and reviewable in small PRs.

## Phases

| Phase | Document | Goal |
|---|---|---|
| 1 | `Phase1-Repo-Consumability.md` | Ensure core docs are complete and expectation-setting is explicit |
| 2 | `Phase2-Hygiene-And-Baseline.md` | Resolve or document security/dependency hygiene and validate clean-clone quality bar |
| 3 | `Phase3-Launch-Mechanics.md` | Finalize GitHub launch mechanics (issues/discussions/templates/releases) and publish posture |

## Dependencies

- Maintainer owner for docs and release messaging decisions.
- Access to dependency/security triage (`npm audit` + advisory review).
- Optional: design assets (screenshots/GIF) from current extension UI.
- Optional: repository admin access for Discussions enablement and release checklist updates.

## Owners

- Primary: MetaFlow maintainers (DynF/X Digital)
- Contributors: extension maintainers, docs maintainers, release managers

## Success Criteria

- External user can understand value, install, and run from README without hidden assumptions.
- Root-level changelog exists and is kept current with releases.
- Known issues and roadmap are explicit enough to reduce duplicate issue churn.
- Dependency risk posture is documented with either fixes or accepted-risk rationale.
- Launch checklist supports predictable `v0.x` release cadence with GitHub + Marketplace alignment.
