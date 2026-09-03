# Maintainer Runbook

## Weekly cadence

- Review Dependabot PRs and merge low-risk updates.
- Review dependency updates for provenance, soak time, and unexpected install-time behavior before merge.
- Review open issues and assign labels/owners.
- Check CI/release workflow health and flaky failures.

## Dependency update policy

- Dependabot is configured to raise grouped security updates only; routine version upgrades are handled as deliberate maintenance work.
- Npm security updates may span the root, extension, engine, and CLI manifests in one PR. Review every manifest and lockfile change before merge.
- GitHub Actions security updates remain in a separate grouped PR from npm updates.
- Do not use broad ignore rules or close a security PR solely to reduce volume. Reconcile stale or superseded PRs against the current branch baseline instead.
- Run the relevant build, unit, integration, and release-branch gates before merging a dependency update that affects shipped artifacts.

## Pre-release checklist

- Confirm release build starts from a clean checkout and `npm ci` state.
- Confirm required CI checks pass.
- Confirm dependency and lockfile diffs were reviewed for new packages, lifecycle scripts, and unexpected transitive changes.
- Confirm release notes draft is accurate.
- Confirm publish secrets are valid.
- Confirm VSIX contents are intentional and match the reviewed source and dependency diff.
- Confirm VSIX artifact is attached to GitHub release.

## Open-source launch checklist (v0.x preview)

- Confirm repository `Issues` is enabled and templates load (`bug_report.yml`, `feature_request.yml`).
- Record `Discussions` decision for current release window (`enabled` or `deferred`) with rationale.
- Confirm release tags use `v0.x` semantics (`v0.1.0`, `v0.2.0-preview.1`, etc.).
- Confirm GitHub release uses generated notes plus maintainer-added context for known limitations.
- Confirm root `CHANGELOG.md` and package changelogs are updated before tagging.
- Confirm release workflow run references the intended tag/ref and archives VSIX successfully.

## Emergency patch process

1. Triage severity and impact.
2. Create minimal hotfix branch.
3. Add/adjust tests for the defect.
4. Review any dependency delta for provenance and install-time risk before proceeding.
5. Run build + tests before tag.
6. Tag and publish patch release.
7. Communicate impact and mitigation in release notes.

## Triage automation policy

- Stale/lock automation is currently deferred until issue volume justifies it.
- Re-evaluate quarterly or when backlog growth indicates maintainability risk.
