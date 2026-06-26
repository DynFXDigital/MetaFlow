# Changesets

Use Changesets to record release intent in feature PRs.

## Add a changeset in your PR

```bash
npm run changeset
```

Choose the packages impacted and a bump type (`patch`, `minor`, or `major`), then write a short human-readable summary.

## What happens on the active release lane

When changesets are present on `prerelease` during a preview cycle, or on `main` when no preview cycle is active,
GitHub Actions opens or updates a **Version Packages** PR that:

- bumps versions in `src/package.json`, `packages/engine/package.json`, and `packages/cli/package.json`
- updates changelog entries

After merging that PR, run the release workflow from the correct branch:

- `prerelease` branch for odd-minor prerelease publishing
- `main` for even-minor stable publishing
