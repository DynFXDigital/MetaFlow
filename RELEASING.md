# Releasing MetaFlow

## Version lane model

VS Code Marketplace does not support semver prerelease suffixes (`1.2.3-beta.1` style).
Use even/odd minor versions instead:

| Lane | Minor | Example |
|------|-------|---------|
| Stable | Even | `0.2.0`, `0.2.1`, `0.4.0` |
| Prerelease | Odd | `0.3.0`, `0.3.1` |

The `--pre-release` flag on `vsce package` and `vsce publish` marks the extension as prerelease
in the Marketplace UI. The version number alone is not enough.

## Normal release cycle

### 1. Add a changeset (in your feature branch)

```powershell
npm run changeset
```

Choose bump type: `patch` for fixes, `minor` for features, `major` for breaking changes.
Commit the generated `.changeset/*.md` file with your changes.

### 2. Merge to main

When your feature branch PR merges, the **Version Packages** workflow
(`.github/workflows/version-packages.yml`) automatically opens a PR titled
`chore(release): version packages`.

Review and merge that PR. It bumps `src/package.json`, `packages/engine/package.json`,
and `packages/cli/package.json` in lockstep, and updates `CHANGELOG.md`.

### 3. Publish

Once the version PR is merged and `main` is green, go to:

**Actions → Release Extension → Run workflow**

Inputs:

| Input | Value |
|-------|-------|
| `channel` | `stable` (even minor) or `prerelease` (odd minor) |

The workflow:
1. Runs the full gate (quick + integration)
2. Packages the VSIX with the appropriate channel flag
3. Waits for manual approval via the GitHub Environment (`production` or `prerelease`)
4. Publishes to VS Code Marketplace and Open VSX
5. Creates the git tag `vX.Y.Z`
6. Creates the GitHub Release with the VSIX attached

The tag is created **after** publish succeeds, so a failed gate never leaves a dangling tag.

## Package scripts

All run from `src/` (or `npm -C src run <script>` from the workspace root):

```powershell
npm run typecheck        # type-check without emitting
npm run package:stable   # build stable VSIX → src/artifacts/
npm run package:pre      # build prerelease VSIX → src/artifacts/
```

## Prerelease vs stable packaging

| Script | vsce flag | Marketplace lane |
|--------|-----------|-----------------|
| `package:stable` | (none) | Stable |
| `package:pre` | `--pre-release` | Prerelease |

Users opt into the prerelease lane through the extension install UI in VS Code.
Both channels share the same extension identity (`dynfxdigital.metaflow-ai`).

## Required setup

### GitHub Environments

Create two environments in repository Settings → Environments:

| Environment name | Used for |
|-----------------|----------|
| `production` | Stable channel releases |
| `prerelease` | Prerelease channel releases |

Add required reviewers to each environment for a manual approval gate before publish.

### Secrets

| Secret | Source |
|--------|--------|
| `VSCE_PAT` | Azure DevOps personal access token, `Marketplace (Manage)` scope |
| `OVSX_PAT` | Open VSX token from `https://open-vsx.org/user-settings/tokens` |

Keep secrets only in GitHub Actions secrets. Never commit tokens or paste them in issues/PRs.
Rotate immediately if exposure is suspected.

### Publisher membership

The account that owns `VSCE_PAT` must be a member of the `dynfxdigital` publisher.
A valid token without publisher membership is not sufficient.

## Hotfix

1. Create a `release/vX.Y.Z` branch from the last stable tag.
2. Apply the minimal fix. Run the gate.
3. Merge back to the release branch and trigger the publish workflow from that branch.
4. Cherry-pick the fix to `main`.

## Dependency and artifact hardening

- Publish the built VSIX (`--packagePath`), not a fresh `vsce publish` from source.
- This extension depends on a local workspace package (`@metaflow/engine` via `file:../packages/engine`);
  a plain `vsce publish` can bundle unexpected workspace content.
- Before each release, verify VSIX contents and dependency graph.
- If a packaging step shows unexpected network access or new lifecycle scripts, stop the
  release, treat the environment as potentially compromised, and rotate secrets before rebuilding.
