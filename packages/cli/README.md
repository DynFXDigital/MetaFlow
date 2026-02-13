# MetaFlow CLI

Command-line interface for the AI Metadata Overlay Sync System. Shares the same TypeScript engine (`@metaflow/engine`) as the VS Code extension.

## Install

```bash
cd packages/cli
npm install
npm run build
```

## Usage

```bash
# From workspace root (where ai-sync.json lives):
node packages/cli/out/src/cli.js <command> [options]

# Or with npm link:
metaflow <command> [options]
```

### Global Options

| Flag | Description | Default |
|------|-------------|---------|
| `-w, --workspace <path>` | Workspace root directory | `cwd` |
| `-V, --version` | Show version | |
| `-h, --help` | Show help | |

### Commands

#### `init`

Generate a starter `ai-sync.json` configuration file.

```bash
metaflow init                  # create config
metaflow init --force          # overwrite existing
```

#### `status`

Show overlay status: config, repos, layers, profile, file counts.

```bash
metaflow status
metaflow status --json         # machine-readable output
```

#### `preview`

List effective files and pending changes without writing anything.

```bash
metaflow preview
metaflow preview --json        # machine-readable output
```

#### `apply`

Materialize overlay outputs to `.github/` with provenance headers.

```bash
metaflow apply                 # skip drifted files
metaflow apply --force         # overwrite drifted files
```

#### `clean`

Remove all managed files (preserves drifted files).

```bash
metaflow clean
```

#### `promote`

Detect locally modified (drifted) materialized files.

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

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (missing config, invalid JSON, bad profile) or validation failure (`validate`) |
| 2 | Drift detected (`promote` command) |

## Development

```bash
# Build
npm -w @metaflow/cli run build

# Test (44 integration tests)
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
      apply.ts          # Materialize to .github/
      clean.ts          # Remove managed files
      promote.ts        # Detect drift
      validate.ts       # CI validation
      watch.ts          # File-system watcher
      profile.ts        # Profile management
  test/
    helpers.ts          # Test workspace builder + CLI runner
    cli.test.ts         # Integration tests
```

All business logic lives in `@metaflow/engine` — the CLI is a thin Commander.js wrapper.
