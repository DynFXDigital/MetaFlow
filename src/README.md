# MetaFlow

AI metadata overlays for Copilot instructions, prompts, skills, and agents.

## Features

- **Overlay Resolution**: Combine multiple repositories and enabled capabilities (instructions, prompts, skills, agents) into one effective workspace configuration.
- **Synchronization with Provenance**: Write files to `.github/` with machine-readable provenance headers for traceability.
- **Profile Management**: Switch between profiles to select complete capability sets.
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
    "compatibilityVersion": 2,
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
    "profiles": {
        "default": {
            "enabledCapabilities": ["primary:company/core", "primary:standards/sdlc"],
        },
        "lean": { "enabledCapabilities": ["primary:company/core"] },
    },
    "activeProfile": "default",
    "injection": {
        "instructions": "plugin",
        "prompts": "settings",
        "skills": "plugin",
        "agents": "plugin",
    },
}
```

Repository `localPath` values are resolved from the workspace root. MetaFlow-generated
configuration prefers portable relative paths, including sibling paths such as
`../my-ai-metadata`; absolute paths remain supported and are retained when the workspace
and repository do not share a compatible filesystem root, such as different Windows drives
or UNC shares.

Supported injection modes are:

- `settings`: inject alternate-path settings such as `chat.instructionsFilesLocations`
- `synchronize`: materialize files into the workspace `.github` directory
- `plugin`: inject capability roots into `chat.pluginLocations` for local Copilot plugin discovery

`plugin` mode is now the default for `instructions`, `skills`, `agents`, and Copilot hook artifacts. Prompts still need `settings` or `synchronize`. Legacy `hooks.preApply` and `hooks.postApply` remain settings-backed script paths because they are not Copilot `hooks.json` event definitions.

> **Known limitation (plugin-mode host discovery).** MetaFlow registers enabled capability roots in `chat.pluginLocations` and records enablement intent, but final visibility of a repo-local capability still depends on the GitHub Copilot host's own plugin discovery and enablement lifecycle. Enabling a capability in MetaFlow expresses _desired_ state; if the host has not discovered or installed a repo-local plugin root, the capability may not surface even though MetaFlow shows it as enabled. Prompts delivered via `settings` can appear independently, which can make a partially visible capability look like a discovery failure. Converging MetaFlow's plugin activation with the host-native plugin lifecycle is tracked as follow-up work.

`MetaFlow: Initialize Configuration` seeds `compatibilityVersion` to the current released config contract, seeds `primary` as enabled, and leaves discovered capabilities disabled so capability activation is opt-in.

After initialization succeeds, MetaFlow automatically enables the built-in MetaFlow capability with plugin-first defaults and refreshes once so bundled guidance is active immediately. `MetaFlow: Initialize MetaFlow Capability` does the same thing later without asking for a delivery mode. Use the built-in repo row's injection policy menu or `metaflow.aiMetadataAutoApplyMode=synchronize` when you need to change the policy after setup.

`MetaFlow: Add Repository Source` also recognizes local metadata authoring workflows:

- existing local git repositories are treated as local git-backed metadata repos immediately, even before a remote URL is configured
- if the selected directory is not a git repository yet, MetaFlow offers to initialize it with `git init` plus an empty initial commit
- update checks and pull actions stay limited to repositories that also have a configured remote URL

For new capability authoring, `MetaFlow: Create CAPABILITY.md` opens the bundled contract guidance, a real example capability contract, and a seeded untitled `CAPABILITY.md` draft so authors can start from the shipped conventions instead of hunting for files manually.

Legacy preview configs that still use `metadataRepo`, `layers`, or flat `layerSources` are accepted during the pre-release window. Released configs authored against an older compatibility version are also upgraded automatically. On load/open, MetaFlow rewrites stale configs to the current contract, persists the current `compatibilityVersion`, and shows a migration notice.

If enabled capabilities surface the same effective relative path, MetaFlow reports a warning in the Capabilities view, `Preview`, `Status`, and the apply summary. Apply remains non-blocking and uses the later-wins result selected by the engine.

### Capability units and organizational containers

A capability unit is a folder that contains both a `.github/` subdirectory with capability metadata and a required `CAPABILITY.md` contract at the folder root.

An organizational container only groups related descendant capabilities and has no `.github/` subdirectory of its own. It does not require `CAPABILITY.md`; it may include an optional `README.md` when human-oriented discovery or navigation would help.

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

Classify each folder independently at every nesting level: descendant capabilities do not make their parent a capability unit. Capability-unit metadata is shown in `metaflow status`, in the Capabilities/Effective Files views, and in the capability details webview.

### Capabilities tree branch toggles

The Capabilities view uses hierarchical mode by default. When the view is in tree mode, folder rows expose checkboxes for branch-wide enable or disable operations.

- Checking a folder enables every descendant capability under that path prefix.
- Unchecking a folder disables every descendant capability under that path prefix.
- A folder checkbox is shown as checked only when every descendant capability is enabled.
- Mixed and fully disabled branches both render as unchecked, with the tooltip and description showing the enabled ratio for mixed branches.
- Concrete capability rows remain checkbox-driven; artifact-type rows are browse-only.

Artifact-type rows such as `instructions`, `prompts`, `agents`, and `skills` can also expand when the selected layer contains metadata under that class.

- Artifact-type rows do not expose enablement checkboxes; capability activation is atomic.
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

| Command                                    | Description                                                                                                                | Keybinding     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `MetaFlow: Refresh`                        | Reload config and re-resolve overlay                                                                                       | `Ctrl+Shift+R` |
| `MetaFlow: Preview`                        | Show pending changes in output channel                                                                                     |                |
| `MetaFlow: Apply`                          | Synchronize files to `.github/`                                                                                            |                |
| `MetaFlow: Clean`                          | Remove synchronized files                                                                                                  |                |
| `MetaFlow: Status`                         | Show current status in output channel                                                                                      |                |
| `MetaFlow: Switch Profile`                 | Select active profile                                                                                                      |                |
| `MetaFlow: Toggle Capability`              | Enable/disable a capability                                                                                                |                |
| `Select All`                               | Enable all descendant capabilities for the selected folder branch from the Capabilities view context menu                  |                |
| `Deselect All`                             | Disable all descendant capabilities for the selected folder branch from the Capabilities view context menu                 |                |
| `MetaFlow: Rescan Repository`              | Force runtime discovery rescan for the selected metadata repo row                                                          |                |
| `MetaFlow: Check Repository Updates`       | Fetch and compute upstream ahead/behind status for git-backed metadata repos                                               |                |
| `MetaFlow: Pull Repository Updates`        | Run `git pull --ff-only` for a selected git-backed metadata repo                                                           |                |
| `MetaFlow: Initialize MetaFlow Capability` | Enable the built-in MetaFlow capability with plugin-first defaults persisted in workspace state                            |                |
| `MetaFlow: Remove MetaFlow Capability`     | Disable built-in capability mode or remove tracked synchronized `.github` capability files                                 |                |
| `MetaFlow: Open Config File`               | Open `.metaflow/config.jsonc` in editor                                                                                    |                |
| `MetaFlow: View Capability Details`        | Open or reuse the capability details webview for the selected capability layer                                             |                |
| `MetaFlow: Create CAPABILITY.md`           | Open bundled contract guidance, an example contract, and a seeded `CAPABILITY.md` draft                                    |                |
| `MetaFlow: Initialize Configuration`       | Scaffold new `.metaflow/config.jsonc` and automatically enable the built-in MetaFlow capability with plugin-first defaults |                |
| `MetaFlow: Promote`                        | Detect drifted files for upstream promotion                                                                                |                |

## Settings

| Setting                             | Default | Description                                                                                                                                                                  |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metaflow.enabled`                  | `true`  | Enable/disable the extension                                                                                                                                                 |
| `metaflow.autoApply`                | `true`  | Auto-apply on config change (recommended)                                                                                                                                    |
| `metaflow.autoAcceptRefreshUpdates` | `false` | Skip refresh-time confirmation prompts and persist discovered config or built-in capability repair updates automatically; can also be enabled from the refresh prompt itself |
| `metaflow.aiMetadataAutoApplyMode`  | `off`   | Force built-in AI metadata bootstrap mode on refresh: `off`, `synchronize` to synchronize capability files into `.github`, or `builtinLayer`                                 |
| `metaflow.logLevel`                 | `info`  | Log verbosity (debug/info/warn/error)                                                                                                                                        |
| `metaflow.repoUpdateCheckInterval`  | `daily` | Background cadence for checking git-backed metadata repos for upstream updates (`hourly`, `daily`, `weekly`, `monthly`)                                                      |

## Managed State

MetaFlow persists local operational state in `.metaflow/state.json`.

- Synchronized file tracking, hashes, and provenance state are stored there for drift detection and clean/apply workflows.
- Capabilities view layout is persisted there and defaults to hierarchical `tree` mode.
- Effective Files view layout is persisted there and defaults to flat `unified` mode.
- These layout preferences are not stored in VS Code settings.

### Copilot settings injected by `MetaFlow: Apply`

- `chat.instructionsFilesLocations`
- `chat.promptFilesLocations`
- `chat.agentFilesLocations`
- `chat.agentSkillsLocations`
- `chat.hookFilesLocations` (file-based hook entries from `hooks.preApply` / `hooks.postApply`)

`MetaFlow: Clean` removes the above injected keys from workspace settings.

## Architecture

The extension uses a pure TypeScript engine (no VS Code imports) for overlay resolution, enabling fast unit testing. The engine modules live in the workspace package at `packages/engine/src/engine/` and handle:

- Capability resolution and file-map building
- Profile capability selection
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
