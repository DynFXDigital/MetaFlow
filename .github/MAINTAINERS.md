# Maintainer Runbook

## Weekly cadence

- Review Dependabot PRs and merge low-risk updates.
- Review open issues and assign labels/owners.
- Check CI/release workflow health and flaky failures.

## Pre-release checklist

- Confirm required CI checks pass.
- Confirm release notes draft is accurate.
- Confirm publish secrets are valid.
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
4. Run build + tests before tag.
5. Tag and publish patch release.
6. Communicate impact and mitigation in release notes.

## Triage automation policy

- Stale/lock automation is currently deferred until issue volume justifies it.
- Re-evaluate quarterly or when backlog growth indicates maintainability risk.
