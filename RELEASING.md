# Releasing MetaFlow

## Versioning and tags

- Stable releases use tags: `vX.Y.Z`
- Pre-releases use suffixes: `vX.Y.Z-alpha.N`, `vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, or `vX.Y.Z-preview.N`

For early-stage development (pre-`1.0.0`), prefer `0.x` tags and pre-releases such as `v0.2.0-beta.1`.
During `v0.x`, treat non-trivial behavior changes as preview semantics changes and call them out clearly in release notes.

## Bumping versions

Canonical versioning is now automated with Changesets.

### In feature PRs

From repository root:

- `npm run changeset`

Add a changeset whenever a PR should affect release versioning.

### On `main`

Workflow `.github/workflows/version-packages.yml` automatically opens/updates a
`chore(release): version packages` PR when pending changesets exist.

Merging that PR applies synchronized version bumps to:

- `src/package.json`
- `packages/engine/package.json`
- `packages/cli/package.json`

and updates changelog entries.

### Create release

After merging the version PR, tag the merge commit with `vX.Y.Z` to trigger release packaging.

## Release paths

- **Tag push (`v*`)**: automatic package + GitHub Release with VSIX asset.
- **Manual dispatch**: run the same release flow by specifying a tag-like ref (`vX.Y.Z`).

## Preconditions

- CI checks must be green.
- Push permission to create tags and releases.

## Publishing to marketplaces

Marketplace publish is optional and handled by `.github/workflows/release.yml`.

- Trigger: **Actions → Release Extension → Run workflow**
- Inputs:
    - `ref`: release tag (example: `v0.1.0`)
    - `publish_to_marketplaces`: set to `true`

Required setup:

1. Configure repository secrets:
    - `VSCE_PAT`
    - `OVSX_PAT`
2. Create a GitHub Environment named `marketplace-publish`.
3. Add required reviewers on that environment for manual approval before publish.

Token handling policy:

- Keep `VSCE_PAT` and `OVSX_PAT` only in GitHub Actions secrets.
- Never commit tokens, place them in tracked `.env` files, or paste them into issues/PRs.
- Rotate tokens immediately if exposure is suspected.

Recommended flow:

1. Push release tag (`vX.Y.Z`) to create GitHub Release + VSIX asset.
2. (Optional) Run **Release Extension** manually for that same tag with `publish_to_marketplaces=true` after approval.

## Rollback and hotfix

1. Create a hotfix branch from last stable release.
2. Apply minimal fix and run required tests.
3. Tag with next patch version (or pre-release suffix if validating).
4. Publish via standard release workflow.
5. Document rollback/hotfix details in release notes.
