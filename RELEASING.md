# Releasing MetaFlow

## Versioning and tags

- Stable releases use tags: `vX.Y.Z`
- Pre-releases use suffixes: `vX.Y.Z-alpha.N`, `vX.Y.Z-beta.N`, `vX.Y.Z-rc.N`, or `vX.Y.Z-preview.N`

## Release paths

- **Tag push (`v*`)**: automatic package + publish workflow.
- **Manual dispatch**: package-only by default; optional publish when explicitly enabled.

## Preconditions

- CI checks must be green.
- Repository secrets must exist:
  - `VSCE_PAT`
  - `OVSX_PAT`

## Rollback and hotfix

1. Create a hotfix branch from last stable release.
2. Apply minimal fix and run required tests.
3. Tag with next patch version (or pre-release suffix if validating).
4. Publish via standard release workflow.
5. Document rollback/hotfix details in release notes.
