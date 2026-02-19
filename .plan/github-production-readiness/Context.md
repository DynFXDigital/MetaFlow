# GitHub Production Readiness – Context

- **Last updated:** 2026-02-13
- **Status:** Implementation mostly complete; blocked on external GitHub validation/admin steps
- **Owner:** DynF/X Digital (proposed)

## Feature Overview

MetaFlow has an OSS baseline (CI, release workflow, templates, dependabot), but it is not yet aligned with production-grade extension repositories (e.g., VS Code ecosystem norms) for CI depth, security scanning, release governance, and maintainability operations. The goal of this plan is to harden GitHub repository operations so extension quality and publishing reliability are enforceable, auditable, and low-friction for maintainers and external contributors.

## Current Focus

1. Validate new workflows through real GitHub PR/tag runs.
2. Apply branch protection required checks in repository settings.
3. Execute a release rehearsal with configured marketplace secrets.

## Next Steps

- [ ] Configure branch protection to require: `Build and unit tests (ubuntu-latest)`, `Build and unit tests (windows-latest)`, and `Extension integration tests`.
- [ ] Open a PR to validate CI matrix, dependency-review, and CodeQL workflows.
- [ ] Run manual release workflow dry-run (`ref=main`, `publish=false`).
- [ ] Run tag-based rehearsal (`vX.Y.Z-preview.N`) with `VSCE_PAT` and `OVSX_PAT` configured.
- [ ] Verify release draft output quality and refine labels/categories as needed.

## References

- `.plan/github-production-readiness/README.md` – main roadmap and success criteria
- `.plan/github-production-readiness/Phase1-CI-Hardening.md`
- `.plan/github-production-readiness/Phase2-Security-SupplyChain.md`
- `.plan/github-production-readiness/Phase3-Release-Governance.md`
- `.plan/github-production-readiness/Phase4-Operations-Maintenance.md`
- `.github/workflows/ci.yml` – current CI baseline
- `.github/workflows/release.yml` – current release baseline
- `.github/dependabot.yml` – current dependency automation

## Decision Log

- **2026-02-13** – Prioritize production controls in this order: CI reliability, security scanning, release governance, then maintenance automation.
- **2026-02-13** – Preserve existing publish model (VSCE + Open VSX) and harden around it rather than replacing it.
- **2026-02-13** – Keep plan implementation incremental to avoid destabilizing daily contributor workflow.
- **2026-02-13** – Implemented CI hardening: Linux+Windows matrix, separate integration job, package artifact retention, timeouts, lockfile drift guard.
- **2026-02-13** – Added security workflows: `codeql.yml` and `dependency-review.yml`; expanded security policy with SLA and triage process.
- **2026-02-13** – Hardened release workflow with ref validation, CI gating wait loop, prerelease semantics, publish safety checks, and duplicate-safe publish.
- **2026-02-13** – Chose Release Drafter for changelog automation; added workflow and category configuration.
- **2026-02-13** – Added support and maintainer operations docs (`SUPPORT.md`, `RELEASING.md`, `.github/MAINTAINERS.md`) and refined Dependabot grouping/labels/reviewers.

## Open Questions & Risks

- Should macOS be required in CI immediately, or deferred after Linux+Windows stability?
- CI check names are now explicit; repository settings must be updated to enforce them.
- Release rehearsal requires valid `VSCE_PAT` and `OVSX_PAT` secrets and cannot be completed from local workspace alone.
