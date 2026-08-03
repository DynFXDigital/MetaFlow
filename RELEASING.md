# Releasing MetaFlow

## Version lane model

VS Code Marketplace does not support semver prerelease suffixes (`1.2.3-beta.1` style).
Use even/odd minor versions instead:

- Stable lane: even minor versions such as `0.2.0`, `0.2.1`, and `0.4.0`
- Prerelease lane: odd minor versions such as `0.3.0` and `0.3.1`

The `--pre-release` flag on `vsce package` and `vsce publish` marks the extension as prerelease
in the Marketplace UI. The version number alone is not enough.

## Branch model

- `main` is the stable branch. Publish even-minor stable releases from `main` only.
- `prerelease` is a temporary convergence branch for odd-minor preview releases.
- Create `prerelease` from `main` only when you have release-ready work worth previewing.
- Merge preview-bound `feature/*` and `fix/*` branches into `prerelease` while that lane is active.
- Before shipping a stable even-minor release, merge `prerelease` back into `main` so both branches point at the same release commit.
- After the stable release ships, delete `prerelease` until the next preview cycle starts.

## Release cycle

### 1. Start a prerelease cycle when needed

Create `prerelease` from the current `main` tip only when you have new work ready for preview distribution.

```powershell
git checkout main
git pull
git checkout -b prerelease
git push -u origin prerelease
```

Keep `main` stable while the cycle is active. Merge release-ready feature work into `prerelease`, not `main`.

### 2. Add a changeset (in your feature branch)

```powershell
npm run changeset
```

Choose bump type: `patch` for fixes, `minor` for features, `major` for breaking changes.
Commit the generated `.changeset/*.md` file with your changes.

### 3. Merge to the active release lane

When your feature branch PR merges into `prerelease` during a preview cycle, or into `main`
when no preview cycle is active, the **Version Packages** workflow
(`.github/workflows/version-packages.yml`) automatically opens a PR titled
`chore(release): version packages`.

Review and merge that PR. It bumps `src/package.json`, `packages/engine/package.json`,
and `packages/cli/package.json` in lockstep and creates provisional package changelog
entries. It does **not** own the root `CHANGELOG.md` and does not create the final stable
release notes.

### 4. Publish prereleases from `prerelease`

Once the version PR is merged and `prerelease` is green, go to:

`Actions -> Release Extension -> Run workflow`

Inputs:

| Input     | Value        |
| --------- | ------------ |
| `channel` | `prerelease` |

Run prerelease publishes from the `prerelease` branch only. The workflow rejects prerelease
publishes from any other branch and also verifies that the version has an odd minor number.

### 5. Converge back to `main` for stable release

When the preview cycle is ready to ship as a stable release:

1. Run the stable-promotion command on `prerelease` with the even-minor target:

    ```powershell
    npm run release:prepare-stable -- --promote-version 0.6.0
    ```

    The command moves `Unreleased` notes and the preceding odd-minor package
    changelog entries into the stable `0.6.0` entry, aligns all workspace package
    versions and lock entries, and leaves no `Unreleased` heading on the stable
    candidate. Review the generated changelog as part of the release PR.

2. Run `npm run release:check-stable -- --version 0.6.0` and the full release gate.
3. Merge `prerelease` back into `main`.
4. Confirm `main` and `prerelease` point at the same release commit.
5. Publish the stable release from `main`.
6. Delete `prerelease` after the stable release ships.

Stable publishes run from `main` only. The workflow rejects stable publishes from `prerelease`
and verifies that the version has an even minor number.

### 6. Publish stable

Once the convergence merge is on `main` and `main` is green, go to:

`Actions -> Release Extension -> Run workflow`

Inputs:

| Input     | Value    |
| --------- | -------- |
| `channel` | `stable` |

The workflow:

1. Rejects a stable release if its changelogs retain `Unreleased` or preceding
   prerelease-version headings
2. Packages the VSIX with the appropriate channel flag
3. Waits for manual approval via the GitHub Environment (`production` or `prerelease`)
4. Publishes to VS Code Marketplace and Open VSX
5. Creates the git tag `vX.Y.Z`
6. Creates the GitHub Release with the VSIX attached

The tag is created **after** publish succeeds, so a failed gate never leaves a dangling tag.

## Branch invariants enforced by automation

- `prerelease` channel releases must run from the `prerelease` branch.
- `prerelease` channel releases must use an odd minor version.
- `stable` channel releases must run from `main` or a `release/*` hotfix branch.
- `stable` channel releases must use an even minor version.

## Package scripts

All run from `src/` (or `npm -C src run <script>` from the workspace root):

```powershell
npm run typecheck        # type-check without emitting
npm run package:stable   # build stable VSIX → src/artifacts/
npm run package:pre      # build prerelease VSIX → src/artifacts/
```

## Prerelease vs stable packaging

| Script           | vsce flag       | Marketplace lane |
| ---------------- | --------------- | ---------------- |
| `package:stable` | (none)          | Stable           |
| `package:pre`    | `--pre-release` | Prerelease       |

Users opt into the prerelease lane through the extension install UI in VS Code.
Both channels share the same extension identity (`dynfxdigital.metaflow-ai`).

## Required setup

### GitHub Environments

Create two environments in repository Settings → Environments:

| Environment name | Used for                    |
| ---------------- | --------------------------- |
| `production`     | Stable channel releases     |
| `prerelease`     | Prerelease channel releases |

Add required reviewers to each environment for a manual approval gate before publish.

### Secrets

| Secret     | Source                                                           |
| ---------- | ---------------------------------------------------------------- |
| `VSCE_PAT` | Azure DevOps personal access token, `Marketplace (Manage)` scope |
| `OVSX_PAT` | Open VSX token from `https://open-vsx.org/user-settings/tokens`  |

Keep secrets only in GitHub Actions secrets. Never commit tokens or paste them in issues/PRs.
Rotate immediately if exposure is suspected.

### Publisher membership

The account that owns `VSCE_PAT` must be a member of the `dynfxdigital` publisher.
A valid token without publisher membership is not sufficient.

## Hotfix

1. Create a `release/vX.Y.Z` branch from the last stable tag.
2. Apply the minimal fix. Run the gate.
3. Trigger the stable publish workflow from that branch.
4. Cherry-pick the fix to `main`.

Hotfix branches publish stable releases only. Do not use a `release/*` branch for prerelease distribution.

## Dependency and artifact hardening

- Publish the built VSIX (`--packagePath`), not a fresh `vsce publish` from source.
- This extension depends on a local workspace package (`@metaflow/engine` via `file:../packages/engine`);
  a plain `vsce publish` can bundle unexpected workspace content.
- Before each release, verify VSIX contents and dependency graph.
- If a packaging step shows unexpected network access or new lifecycle scripts, stop the
  release, treat the environment as potentially compromised, and rotate secrets before rebuilding.
