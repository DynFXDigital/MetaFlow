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
