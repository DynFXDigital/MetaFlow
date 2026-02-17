# Releasing MetaFlow

## Versioning and tags

- Stable releases use tags: `vX.Y.Z`
- Pre-releases use suffixes: `vX.Y.Z-alpha.N`, `vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, or `vX.Y.Z-preview.N`

## Release paths

- **Tag push (`v*`)**: automatic package + GitHub Release with VSIX asset.
- **Manual dispatch**: run the same release flow by specifying a tag-like ref (`vX.Y.Z`).

## Preconditions

- CI checks must be green.
- Push permission to create tags and releases.

## Publishing to marketplaces

This repository now includes an optional manual publish workflow:

- Workflow: `.github/workflows/publish-marketplaces.yml`
- Trigger: **Actions → Publish to Marketplaces → Run workflow**
- Input: release tag (example: `v0.1.0`)

Required setup:

1. Configure repository secrets:
	- `VSCE_PAT`
	- `OVSX_PAT`
2. Create a GitHub Environment named `marketplace-publish`.
3. Add required reviewers on that environment for manual approval before publish.

Recommended flow:

1. Push release tag (`vX.Y.Z`) to create GitHub Release + VSIX asset.
2. Run **Publish to Marketplaces** for that same tag after approval.

## Rollback and hotfix

1. Create a hotfix branch from last stable release.
2. Apply minimal fix and run required tests.
3. Tag with next patch version (or pre-release suffix if validating).
4. Publish via standard release workflow.
5. Document rollback/hotfix details in release notes.
