# MetaFlow CLI

Command-line interface for AI metadata overlay management. Shares the same TypeScript engine (`@metaflow/engine`) as the VS Code extension.

## Install

```bash
cd packages/cli
npm install
npm run build
```

## Usage

```bash
# From workspace root (where .metaflow/config.jsonc lives):
node packages/cli/out/src/cli.js <command> [options]

# Or with npm link:
metaflow <command> [options]
```

### Global Options

| Flag                     | Description              | Default |
| ------------------------ | ------------------------ | ------- |
| `-w, --workspace <path>` | Workspace root directory | `cwd`   |
| `-V, --version`          | Show version             |         |
| `-h, --help`             | Show help                |         |

### Commands

#### `init`

Generate a starter `.metaflow/config.jsonc` configuration file.

```bash
metaflow init                  # create config
metaflow init --force          # overwrite existing
```

#### `status`

Show overlay status: config, repositories, configured capabilities, resolved capabilities, profile, warnings, and file counts.

```bash
metaflow status
metaflow status --json         # machine-readable output
```

The CLI accepts preview-era configs that still use `metadataRepo`, `layers`, or flat `layerSources`, but on successful load it rewrites them to the canonical repo-grouped `metadataRepos[*].capabilities` shape and prints a migration notice.

Human-readable `status` output also includes a `Target Capability Support` summary with per-target adapter versions, support-state counts, and runtime-only documentation references for configured capability metadata.

#### `preview`

List effective files and pending changes without writing anything.

```bash
metaflow preview
metaflow preview --json        # machine-readable output
```

If enabled capabilities surface the same effective path, `preview` reports warning details but does not block `apply`.

#### `apply`

Synchronize overlay outputs to their target paths with provenance headers.

```bash
metaflow apply                 # skip drifted files
metaflow apply --force         # overwrite drifted files
```

Human-readable `apply` output labels target-owned write, skip, and remove rows, such as `write  [codex] .agents/skills/release-readiness/SKILL.md`, so operators can distinguish Codex, GitHub Copilot, and neutral file changes during review.

#### `export-copilot-mcp`

Export canonical `.metaflow/mcp/*.json` metadata as a GitHub Copilot workspace MCP handoff.

```bash
metaflow export-copilot-mcp
metaflow export-copilot-mcp --json
metaflow export-copilot-mcp --out .vscode/mcp.json
metaflow export-copilot-mcp --out .vscode/mcp.json --force
```

By default, the command writes `.vscode/mcp.json` content to stdout and review warnings to stderr. It does not mutate workspace MCP configuration unless an explicit `--out` path is provided, and existing output files require `--force`.

#### `export-package-marketplace`

Export canonical `.metaflow/packages/*.json` marketplace entries as reviewable package marketplace candidates.

```bash
metaflow export-package-marketplace
metaflow export-package-marketplace --json
metaflow export-package-marketplace --target codex
metaflow export-package-marketplace --format codex-marketplace
metaflow export-package-marketplace --format github-copilot-marketplace
metaflow export-package-marketplace --out exports/package-marketplace.json --force
```

The default output is a compact target-grouped review object. `--json` includes source provenance, package warnings, and runtime validation records, including target capability concept links when package evidence names them. Host-shaped formats emit Codex `.agents/plugins/marketplace.json` or GitHub Copilot `.github/plugin/marketplace.json` candidate payloads from canonical package metadata, but the command does not mutate host marketplace files unless an explicit `--out` path is provided.

#### `target-support`

Inspect the target capability matrix without requiring a configured workspace.

```bash
metaflow target-support
metaflow target-support --target codex
metaflow target-support --target codex --support runtime-only
metaflow target-support --json --target codex --concept mcpServers
```

The command reports whether each canonical MetaFlow concept is supported, partial, runtime-only, unsupported, or represented by a generated substitute for each target adapter. Use it to review file-backed Codex projections separately from runtime-only Codex Cloud, channel, review, and MCP behaviors.

#### `codex-support-boundaries`

Print the Codex support boundary report without requiring a configured workspace.

```bash
metaflow codex-support-boundaries
metaflow codex-support-boundaries --json
metaflow codex-support-boundaries --fail-on release-ready
metaflow codex-support-boundaries --fail-on runtime-complete
metaflow codex-support-boundaries --fail-on missing-evidence,diagnostics
metaflow codex-support-boundaries --out reports/codex-support-boundaries.md
metaflow codex-support-boundaries --json --out reports/codex-support-boundaries.json
metaflow codex-support-boundaries --projection-boundary-review
metaflow codex-support-boundaries --projection-boundary-review --json --out reports/codex-projection-boundaries.json
metaflow codex-support-boundaries --runtime-evidence-template --out reports/codex-runtime-evidence-template.json
metaflow codex-support-boundaries --runtime-evidence-template-dir reports/runtime-evidence
metaflow codex-support-boundaries --runtime-evidence-template-dir reports/runtime-evidence --runtime-evidence-concept issuePrOperation
metaflow codex-support-boundaries --runtime-evidence-review-queue release-ready
metaflow codex-support-boundaries --runtime-evidence-review-queue runtime-complete
metaflow codex-support-boundaries --runtime-evidence-review-queue diagnostics --json --out reports/codex-runtime-evidence-diagnostics.json
metaflow codex-support-boundaries --runtime-evidence-review-queue partial
metaflow codex-support-boundaries --runtime-evidence-review-queue expired-evidence
metaflow codex-support-boundaries --runtime-evidence-review-queue stale-adapter-version
metaflow codex-support-boundaries --runtime-evidence-review-queue waived
metaflow codex-support-boundaries --runtime-evidence-guide --runtime-evidence-concept issuePrOperation
```

The command prints the same Markdown boundary report exposed by the VS Code `MetaFlow: Open Codex Support Boundaries` command. It separates file-backed and reviewable Codex surfaces from runtime-only and not-technically-projectable surfaces so terminal and CI reviews can use the same operator-facing boundary text. The report includes a runtime evidence readiness summary for the `release-ready` preset, a release-ready action plan, and a runtime-complete completion action plan before the detailed gate rows. Action plan items include concept-level native surfaces, expected proof, authority implications, matching runtime evidence record IDs, and current runtime evidence limitations.

Use `--fail-on` for release and CI checks while still emitting the report. Supported checks are `missing-evidence`, `diagnostics`, `error-diagnostics`, `failed`, `not-run`, and `partial`; presets are `release-ready`, `runtime-complete`, and `all`. The `release-ready` preset expands to missing evidence, diagnostics, failed evidence, and not-run evidence. The `runtime-complete` preset adds partial evidence so incomplete runtime proof fails without changing release-ready semantics.

Use `--projection-boundary-review` to emit a focused Markdown document, or add `--json`, that records file-backed surfaces, runtime-only surfaces, unsupported rows, not-achievable repository-projection items, and expected runtime evidence. Use `--runtime-evidence-review-queue <queue>` to emit a focused Markdown triage document, or add `--json`, for `all`, `release-ready`, `runtime-complete`, `missing-evidence`, `diagnostics`, `error-diagnostics`, `partial`, `expired-evidence`, `stale-adapter-version`, `failed`, `not-run`, or `waived` runtime evidence queues. The runtime-complete queue combines release-ready blockers with partial-evidence completion actions. Partial, waived, expired, and stale-adapter queues include advisory review items for matching concepts but do not add release gate blockers. Use `--runtime-evidence-guide --runtime-evidence-concept <concepts>` to emit a Markdown guide, or add `--json`, for collecting reviewable runtime proof for selected concepts before filling evidence records. Use `--runtime-evidence-template` to emit a review-only JSON bundle of suggested `.metaflow/runtime-evidence/*.json` records derived from the release-ready action plan, the completion action plan when release-ready has no blockers, or selected runtime-only concepts when `--runtime-evidence-concept` is supplied. The template contains suggested paths and fill-in record payloads; it does not create runtime proof or write canonical evidence records automatically. Use `--runtime-evidence-template-dir` to write the same fill-in records as individual JSON scaffold files under an explicit workspace-relative directory; existing files are protected unless `--force` is supplied. Add `--runtime-evidence-concept <concepts>` to limit template output to one or more comma-separated runtime-only Codex concepts while collecting evidence incrementally, including refresh or replacement scaffolds for concepts that already have partial or waived evidence.

#### `migration-suggestions`

Suggest canonical `.metaflow/` migration candidates for legacy or host-native metadata in configured layers.

```bash
metaflow migration-suggestions
metaflow migration-suggestions --json
metaflow migration-suggestions --out reports/migration-suggestions.md
metaflow migration-suggestions --json --out reports/migration-suggestions.json
```

The command is review-only. It reports candidate canonical paths, duplicate native/canonical copies, and manual-review notes. `--out` writes the report artifact only; the command does not write canonical metadata files, translate policy-sensitive Codex configuration automatically, or remove host-native metadata.

#### `clean`

Remove all managed files (preserves drifted files).

```bash
metaflow clean
```

Human-readable `clean` output labels target-owned removals and skips with the managed state's `projectionTarget` value. Managed files written before target labels existed remain cleanable; those older records simply omit the target label in clean output.

#### `promote`

Detect locally modified (drifted) synchronized files.

```bash
metaflow promote
# Exit code 0: no drift
# Exit code 2: drift detected
```

##### Auto-promotion

Automatically copy drifted files back to the metadata repo, create a branch, and commit:

```bash
metaflow promote --auto                       # auto-detect layer, generate branch
metaflow promote --auto --branch my-changes    # named branch
metaflow promote --auto --no-branch            # commit on current branch
metaflow promote --auto --layer company/core   # force target layer
metaflow promote --auto --message "my changes" # custom commit message
metaflow promote --auto --json                 # machine-readable output
```

#### `validate`

Validate managed files match expected overlay state. Designed for CI pipelines.

```bash
metaflow validate              # human-readable output
metaflow validate --json       # machine-readable output
# Exit code 0: valid
# Exit code 1: validation failed (drifted, missing, unmanaged, or stale files)
```

Human-readable `validate` output preserves drift and stale-file validation semantics and includes the same `Target Capability Support` summary as `status`, so CI logs expose file-backed, partial, runtime-only, and unsupported target surfaces without running a separate command.

#### `watch`

Watch for config and metadata changes, auto-apply on change.

```bash
metaflow watch                 # watch with 300ms debounce
metaflow watch --debounce 500  # custom debounce interval
metaflow watch --force         # overwrite drifted files on auto-apply
```

#### `profile list`

List available activation profiles.

```bash
metaflow profile list
```

#### `profile set <name>`

Switch the active profile.

```bash
metaflow profile set lean
```

## Exit Codes

| Code | Meaning                                                                              |
| ---- | ------------------------------------------------------------------------------------ |
| 0    | Success                                                                              |
| 1    | Error (missing config, invalid JSON, bad profile) or validation failure (`validate`) |
| 2    | Drift detected (`promote` command)                                                   |

## Development

```bash
# Build
npm -w @metaflow/cli run build

# Test
npm -w @metaflow/cli test

# Watch
npm -w @metaflow/cli run watch
```

## Architecture

```
packages/cli/
  src/
    cli.ts              # Entry point + createProgram()
    commands/
      common.ts         # Shared helpers (config loading, file resolution)
      init.ts           # Generate starter config
      status.ts         # Show overlay status
      preview.ts        # Preview effective files
      apply.ts          # Synchronize to .github/
      clean.ts          # Remove managed files
      exportPackageMarketplace.ts # Export package marketplace candidates
      targetSupport.ts  # Inspect target capability support
      promote.ts        # Detect drift
      validate.ts       # CI validation
      watch.ts          # File-system watcher
      profile.ts        # Profile management
  test/
    helpers.ts          # Test workspace builder + CLI runner
    cli.test.ts         # Integration tests
```

All business logic lives in `@metaflow/engine` — the CLI is a thin Commander.js wrapper.

For Codex-specific support boundaries, including runtime-only cloud, channel,
review, and MCP behavior that cannot be proven by repository projection alone,
see [Codex Support Boundaries](../../docs/CODEX-SUPPORT.md).

For the Codex operator review loop around `preview`, adapter readiness, guarded
native outputs, package marketplace export, and runtime-validation records, see
[Codex Operator Walkthrough](../../docs/CODEX-OPERATOR-WALKTHROUGH.md).
