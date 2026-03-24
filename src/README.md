# MetaFlow

AI metadata overlays for Copilot instructions, prompts, skills, and agents.

## Features

- **Overlay Resolution**: Combine multiple repositories and enabled capabilities (instructions, prompts, skills, agents) into one effective workspace configuration.
- **Synchronization with Provenance**: Write files to `.github/` with machine-readable provenance headers for traceability.
- **Profile Management**: Switch between profiles to enable/disable artifact subsets.
- **Capability Management**: Toggle individual capabilities on/off, bulk-toggle folder branches in tree mode, browse artifact contents under each layer, and work across multiple repositories.
- **Capability Details Webview**: Open a reusable capability-details panel that shows metadata, warnings, artifact inventory, and rendered `CAPABILITY.md` content.
- **Drift Detection**: Detect locally-edited synchronized files; protect from overwrite.
- **Settings Injection**: Configure Copilot alternate-path settings for settings-backed artifacts.
- **TreeView UI**: Visual tree views for config summary, profiles, capabilities, warnings, and effective files.

## Recommended mode (automatic)

MetaFlow works best in automatic mode, which is the default.

- Set up `.metaflow/config.jsonc` once.
- Save config changes.
- MetaFlow refreshes and applies automatically.

Use command palette actions for diagnostics and explicit control, not as the primary day-to-day workflow.

## Installation

Install from VSIX:

```powershell
powershell -File ./scripts/install-vsix.ps1 -VsixPath ../<metaflow-release>.vsix -Cli code
```

Install the newest locally packaged VSIX automatically:

```powershell
powershell -File ./scripts/install-latest-vsix.ps1 -WorkspaceRoot .. -Cli code -AllProfiles

# Install into stable and insiders across all local profiles
powershell -File ./scripts/install-latest-vsix.ps1 -WorkspaceRoot .. -Cli code,code-insiders -AllProfiles
```

Direct CLI fallback:

```bash
code --install-extension <metaflow-release>.vsix --force
```

If VS Code shows "Please restart VS Code before reinstalling ...", close all VS Code windows and run:

```powershell
Stop-Process -Name "CodeSetup-*" -ErrorAction SilentlyContinue
```

Then retry the script command above.

## Configuration

Create `.metaflow/config.jsonc` in your workspace root (or run `MetaFlow: Initialize Configuration`):

```jsonc
{
    "metadataRepos": [
        {
            "id": "primary",
            "name": "primary",
            "localPath": "../my-ai-metadata", // path to metadata repo clone
            "enabled": true,
            "capabilities": [
                { "path": "company/core", "enabled": true },
                { "path": "standards/sdlc", "enabled": false },
            ],
        },
    ],
    "filters": {
        "include": [],
        "exclude": [],
    },
    "profiles": {
        "default": { "enable": ["**/*"], "disable": [] },
        "lean": { "disable": ["agents/**"] },
    },
    "activeProfile": "default",
    "injection": {
        "instructions": "settings",
        "prompts": "settings",
        "skills": "synchronize",
        "agents": "synchronize",
    },
}
```

`MetaFlow: Initialize Configuration` seeds `primary` as enabled and discovered capabilities as disabled so capability activation is opt-in.

Legacy preview configs that still use `metadataRepo`, `layers`, or flat `layerSources` are accepted during the pre-release window. On load/open, MetaFlow rewrites them to the canonical repo-grouped `metadataRepos[*].capabilities` shape and shows a migration notice.

If enabled capabilities surface the same effective relative path, MetaFlow reports a warning in the Capabilities view, `Preview`, `Status`, and the apply summary. Apply remains non-blocking and uses the later-wins result selected by the engine.

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

This metadata is shown in `metaflow status`, in the Capabilities/Effective Files views, and in the capability details webview.

### Capabilities tree branch toggles

The Capabilities view uses hierarchical mode by default. When the view is in tree mode, folder rows expose checkboxes for branch-wide enable or disable operations.

- Checking a folder enables every descendant capability under that path prefix.
- Unchecking a folder disables every descendant capability under that path prefix.
- A folder checkbox is shown as checked only when every descendant capability is enabled.
- Mixed and fully disabled branches both render as unchecked, with the tooltip and description showing the enabled ratio for mixed branches.
- Concrete capability rows and artifact-type rows keep their existing checkbox behavior.

Artifact-type rows such as `instructions`, `prompts`, `agents`, and `skills` can also expand when the selected layer contains metadata under that class.

- Artifact-type rows stay toggleable at the class level.
- Nested folders and files under an artifact type are browse-only and do not expose checkboxes.
- Browse rows prefer frontmatter or manifest display names when available.
- Browse tooltips retain the canonical artifact path and description so friendly labels do not hide the internal identifier.

### Optional `METAFLOW.md` per repository root

Metadata repository roots may include `METAFLOW.md` to provide repository-level metadata consumed by MetaFlow tooltips.

```md
---
name: Primary
description: Shared repository-level metadata for this workspace.
---
```

- `name` and `description` are optional.
- The manifest is distinct from the repository `README.md`.
- Repository metadata is currently surfaced in repository tooltips.

## Commands

| Command                                    | Description                                                                                                       | Keybinding     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `MetaFlow: Refresh`                        | Reload config and re-resolve overlay                                                                              | `Ctrl+Shift+R` |
| `MetaFlow: Preview`                        | Show pending changes in output channel                                                                            |                |
| `MetaFlow: Apply`                          | Synchronize files to `.github/`                                                                                   |                |
| `MetaFlow: Clean`                          | Remove synchronized files                                                                                         |                |
| `MetaFlow: Status`                         | Show current status in output channel                                                                             |                |
| `MetaFlow: Switch Profile`                 | Select active profile                                                                                             |                |
| `MetaFlow: Toggle Capability`              | Enable/disable a capability                                                                                       |                |
| `Select All`                               | Enable all descendant capabilities for the selected folder branch from the Capabilities view context menu         |                |
| `Deselect All`                             | Disable all descendant capabilities for the selected folder branch from the Capabilities view context menu        |                |
| `MetaFlow: Rescan Repository`              | Force runtime discovery rescan for the selected metadata repo row                                                 |                |
| `MetaFlow: Check Repository Updates`       | Fetch and compute upstream ahead/behind status for git-backed metadata repos                                      |                |
| `MetaFlow: Pull Repository Updates`        | Run `git pull --ff-only` for a selected git-backed metadata repo                                                  |                |
| `MetaFlow: Initialize MetaFlow Capability` | Choose synchronization mode (`synchronize` in config) or built-in settings-only mode persisted in workspace state |                |
| `MetaFlow: Remove MetaFlow Capability`     | Disable built-in capability mode or remove tracked synchronized `.github` capability files                        |                |
| `MetaFlow: Open Config File`               | Open `.metaflow/config.jsonc` in editor                                                                           |                |
| `MetaFlow: View Capability Details`        | Open or reuse the capability details webview for the selected capability layer                                    |                |
| `MetaFlow: Initialize Configuration`       | Scaffold new `.metaflow/config.jsonc`                                                                             |                |
| `MetaFlow: Promote`                        | Detect drifted files for upstream promotion                                                                       |                |

## Settings

| Setting                            | Default | Description                                                                                                                                  |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `metaflow.enabled`                 | `true`  | Enable/disable the extension                                                                                                                 |
| `metaflow.autoApply`               | `true`  | Auto-apply on config change (recommended)                                                                                                    |
| `metaflow.aiMetadataAutoApplyMode` | `off`   | Force built-in AI metadata bootstrap mode on refresh: `off`, `synchronize` to synchronize capability files into `.github`, or `builtinLayer` |
| `metaflow.logLevel`                | `info`  | Log verbosity (debug/info/warn/error)                                                                                                        |
| `metaflow.hooksEnabled`            | `true`  | Enable Copilot hooks injection                                                                                                               |
| `metaflow.repoUpdateCheckInterval` | `daily` | Background cadence for checking git-backed metadata repos for upstream updates (`hourly`, `daily`, `weekly`, `monthly`)                      |

## Managed State

MetaFlow persists local operational state in `.metaflow/state.json`.

- Synchronized file tracking, hashes, and provenance state are stored there for drift detection and clean/apply workflows.
- Capabilities view layout is persisted there and defaults to hierarchical `tree` mode.
- Effective Files view layout is persisted there and defaults to flat `unified` mode.
- These layout preferences are not stored in VS Code settings.

### Copilot settings injected by `MetaFlow: Apply`

- `chat.instructionsFilesLocations` (and legacy `github.copilot.chat.codeGeneration.instructionFiles`)
- `chat.promptFilesLocations` (and legacy `github.copilot.chat.promptFiles`)
- `chat.agentFilesLocations`
- `chat.agentSkillsLocations`
- `chat.hookFilesLocations` (file-based hook entries from `hooks.preApply` / `hooks.postApply`)

`MetaFlow: Clean` removes the above injected keys from workspace settings.

## Architecture

The extension uses a pure TypeScript engine (no VS Code imports) for overlay resolution, enabling fast unit testing. The engine modules live in the workspace package at `packages/engine/src/engine/` and handle:

- Capability resolution and file-map building
- Include/exclude filter evaluation
- Profile enable/disable pattern application
- Artifact classification (settings vs synchronized files)
- Provenance header generation and drift detection
- Synchronization with state tracking

VS Code integration (commands, views, diagnostics) wraps the engine in `src/src/commands/` and `src/src/views/`.

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

- `MetaFlow: Lint Extension`
- `MetaFlow: Compile Extension (TS)`
- `MetaFlow: Test Extension Unit`
- `MetaFlow: Build Extension`

The lint monitor and summary helpers are available as npm scripts rather than workspace tasks. Run `npm run lint:monitor`, `npm run lint:summary`, or `npm run lint:monitor:summary` from `src/` when you need those reports.

## GitHub CI and Release

This repository uses GitHub Actions to validate and publish the extension:

- `.github/workflows/ci.yml` runs `npm run gate:quick` (build + lint + unit tests) plus `npm run gate:integration` under headless `xvfb-run` on PRs and pushes.
- `.github/workflows/release.yml` packages and publishes on `v*` tags, and can also be triggered manually.

### Publishing secrets

Set these repository secrets before publishing:

- `VSCE_PAT` — VS Code Marketplace Personal Access Token
- `OVSX_PAT` — Open VSX token

If one secret is missing, the workflow skips publishing to that marketplace and continues with any remaining configured target.

## License

MIT
