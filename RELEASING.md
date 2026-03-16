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

Token sources:

- `VSCE_PAT` is an Azure DevOps / Visual Studio Marketplace Personal Access Token with `Marketplace (Manage)` scope.
- `OVSX_PAT` is an Open VSX access token from `https://open-vsx.org/user-settings/tokens`.

Publisher permissions:

- The account used to create `VSCE_PAT` must already have permission to publish under the existing Marketplace publisher (`dynfxdigital`).
- A valid token without publisher membership is not sufficient; publish will fail with an access-denied error for publishing new extensions to the existing publisher.

Extension identity constraints:

- The VS Code Marketplace requires the extension `name` in `src/package.json` to be globally unique.
- Publisher scope alone does not avoid collisions. If Marketplace reports that the extension already exists, choose a new unique `name` and repackage before publishing.
- The current Marketplace extension ID is `dynfxdigital.metaflow-ai`.

Token handling policy:

- Keep `VSCE_PAT` and `OVSX_PAT` only in GitHub Actions secrets.
- Never commit tokens, place them in tracked `.env` files, or paste them into issues/PRs.
- Rotate tokens immediately if exposure is suspected.

Packaging and publish path:

- Publish the already-built VSIX rather than running a plain `vsce publish` from `src/`.
- This repository's extension package depends on a local workspace package (`@metaflow/engine` via `file:../packages/engine`), so a plain `vsce publish` can try to package parent-workspace content.
- Use the checked-in package script to create the VSIX:

```powershell
npm -C src run package
```

- Then publish that VSIX explicitly:

```powershell
$pat = $env:VSCE_PAT
if (-not $pat) { $pat = [Environment]::GetEnvironmentVariable('VSCE_PAT','User') }
if (-not $pat) { $pat = [Environment]::GetEnvironmentVariable('VSCE_PAT','Machine') }
npx @vscode/vsce publish --packagePath .\src\metaflow-ai-0.1.0.vsix -p $pat
```

- The GitHub workflow already follows this `--packagePath` pattern for marketplace publishing.

Recommended flow:

1. Push release tag (`vX.Y.Z`) to create GitHub Release + VSIX asset.
2. (Optional) Run **Release Extension** manually for that same tag with `publish_to_marketplaces=true` after approval.
3. If CLI publishing is blocked by publisher permissions, use the Marketplace management UI to upload the generated VSIX as a fallback while publisher membership is being corrected.

## Rollback and hotfix

1. Create a hotfix branch from last stable release.
2. Apply minimal fix and run required tests.
3. Tag with next patch version (or pre-release suffix if validating).
4. Publish via standard release workflow.
5. Document rollback/hotfix details in release notes.
