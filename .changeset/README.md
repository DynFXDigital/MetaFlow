# Changesets

Use Changesets to record release intent in feature PRs.

## Add a changeset in your PR

```bash
npm run changeset
```

Choose the packages impacted and a bump type (`patch`, `minor`, or `major`), then write a short human-readable summary.

## What happens on `main`

When changesets are present on `main`, GitHub Actions opens or updates a **Version Packages** PR that:

- bumps versions in `src/package.json`, `packages/engine/package.json`, and `packages/cli/package.json`
- updates changelog entries

After merging that PR, tag the merge commit as `vX.Y.Z` to run the release workflow.
