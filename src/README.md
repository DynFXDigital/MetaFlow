# MetaFlow

Deterministic AI metadata overlays for Copilot instructions, prompts, skills, and agents.

## Features

- **Overlay Resolution**: Combine multiple metadata layers (instructions, prompts, skills, agents) with deterministic later-wins precedence.
- **Materialization with Provenance**: Write files to `.github/` with machine-readable provenance headers for traceability.
- **Profile Management**: Switch between profiles to enable/disable artifact subsets.
- **Layer Management**: Toggle individual layers on/off; multi-repo support.
- **Drift Detection**: Detect locally-edited managed files; protect from overwrite.
- **Settings Injection**: Configure Copilot alternate-path settings for settings-backed artifacts.
- **TreeView UI**: Visual tree views for config summary, profiles, layers, and effective files.

## Recommended mode (automatic)

MetaFlow works best in automatic mode, which is the default.

- Set up `.metaflow/config.jsonc` once.
- Save config changes.
- MetaFlow refreshes and applies automatically.

Use command palette actions for diagnostics and explicit control, not as the primary day-to-day workflow.

## Installation

Install from VSIX:

```
code --install-extension metaflow-0.1.0.vsix
```

## Configuration

Create `.metaflow/config.jsonc` in your workspace root (or run `MetaFlow: Initialize Configuration`):

```jsonc
{
  "metadataRepo": {
    "localPath": "../my-ai-metadata"  // path to metadata repo clone
  },
  "layers": [
    "company/core",
    "standards/sdlc"
  ],
  "filters": {
    "include": [],
    "exclude": []
  },
  "profiles": {
    "default": { "enable": ["**/*"], "disable": [] },
    "lean":    { "disable": ["agents/**"] }
  },
  "activeProfile": "default",
  "injection": {
    "instructions": "settings",
    "prompts": "settings",
    "skills": "materialize",
    "agents": "materialize"
  }
}
```

### Optional `CAPABILITY.md` per layer

Layer roots may include `CAPABILITY.md` to provide capability metadata consumed by MetaFlow.

```md
---
name: SDLC Traceability
description: Shared SDLC traceability metadata.
license: MIT
---
```

- `name` and `description` are required.
- `license` is optional (`MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, or `SEE-LICENSE-IN-REPO`).
- Unknown fields are tolerated with warning diagnostics.

This metadata is shown in `metaflow status` and in the Layers/Effective Files views.

## Commands

| Command | Description | Keybinding |
|---|---|---|
| `MetaFlow: Refresh` | Reload config and re-resolve overlay | `Ctrl+Shift+R` |
| `MetaFlow: Preview` | Show pending changes in output channel | |
| `MetaFlow: Apply` | Materialize files to `.github/` | |
| `MetaFlow: Clean` | Remove managed files | |
| `MetaFlow: Status` | Show current status in output channel | |
| `MetaFlow: Switch Profile` | Select active profile | |
| `MetaFlow: Toggle Layer` | Enable/disable a layer | |
| `MetaFlow: Rescan Repository` | Force runtime discovery rescan for the selected metadata repo row | |
| `MetaFlow: Check Repository Updates` | Fetch and compute upstream ahead/behind status for git-backed metadata repos | |
| `MetaFlow: Pull Repository Updates` | Run `git pull --ff-only` for a selected git-backed metadata repo | |
| `MetaFlow: Initialize MetaFlow Capability` | Choose materialize mode (overwrite managed `.github` capability files) or built-in settings-only mode persisted in workspace state | |
| `MetaFlow: Remove MetaFlow Capability` | Disable built-in capability mode or remove tracked materialized capability files from `.github` | |
| `MetaFlow: Open Config` | Open `.metaflow/config.jsonc` in editor | |
| `MetaFlow: Initialize Configuration` | Scaffold new `.metaflow/config.jsonc` | |
| `MetaFlow: Promote` | Detect drifted files for upstream promotion | |

## Settings

| Setting | Default | Description |
|---|---|---|
| `metaflow.enabled` | `true` | Enable/disable the extension |
| `metaflow.autoApply` | `true` | Auto-apply on config change (recommended) |
| `metaflow.logLevel` | `info` | Log verbosity (debug/info/warn/error) |
| `metaflow.hooksEnabled` | `true` | Enable Copilot hooks injection |
| `metaflow.repoUpdateCheckInterval` | `daily` | Background cadence for checking git-backed metadata repos for upstream updates (`hourly`, `daily`, `weekly`, `monthly`) |

### Copilot settings injected by `MetaFlow: Apply`

- `chat.instructionsFilesLocations` (and legacy `github.copilot.chat.codeGeneration.instructionFiles`)
- `chat.promptFilesLocations` (and legacy `github.copilot.chat.promptFiles`)
- `chat.agentFilesLocations`
- `chat.agentSkillsLocations`
- `chat.hookFilesLocations` (file-based hook entries from `hooks.preApply` / `hooks.postApply`)

`MetaFlow: Clean` removes the above injected keys from workspace settings.

## Architecture

The extension uses a pure TypeScript engine (no VS Code imports) for overlay resolution, enabling fast unit testing. The engine modules live in `src/engine/` and handle:

- Layer resolution and file-map building
- Include/exclude filter evaluation
- Profile enable/disable pattern application
- Artifact classification (settings vs materialized)
- Provenance header generation and drift detection
- Materialization with managed state tracking

VS Code integration (commands, views, diagnostics) wraps the engine in `src/commands/` and `src/views/`.

## Development

```powershell
cd src
npm install
npm run compile
npm run test:unit    # unit tests
npm run gate:integration # integration tests (Extension Host)
npm run lint
```

### Lint monitoring (non-blocking warnings)

Warnings are intentionally non-failing, but still monitored:

- `npm run lint` — runs ESLint; warnings are allowed.
- `npm run lint:monitor` — writes JSON report to `.eslint-report.json`.
- `npm run lint:summary` — prints totals and top warning rule IDs.
- `npm run lint:monitor:summary` — monitor + summary in one command.

Example summary output:

`[lint-summary] files=28 errors=0 warnings=5`

`[lint-summary] top-warning-rules=@typescript-eslint/naming-convention:5`

### VS Code tasks

From **Terminal → Run Task**:

- `Extension: Lint (Monitor Report)`
- `Extension: Lint Summary`
- `Extension: Lint (Monitor + Summary)`

## GitHub CI and Release

This repository uses GitHub Actions to validate and publish the extension:

- `.github/workflows/ci.yml` runs `npm run gate:quick` (build + lint + unit tests) plus `npm run gate:integration` under headless `xvfb-run` on PRs and pushes.
- `.github/workflows/release.yml` packages and publishes on `v*` tags, and can also be triggered manually.

### Publishing secrets

Set these repository secrets before publishing:

- `VSCE_PAT` — VS Code Marketplace Personal Access Token
- `OVSX_PAT` — Open VSX token

If one secret is missing, the workflow will skip publishing to that marketplace.

## License

MIT
