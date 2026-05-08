# MetaFlow

AI metadata overlays for Copilot instructions, prompts, skills, agents, and Claude Code rules, agents, and skills.

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

`MetaFlow: Initialize Configuration` seeds `compatibilityVersion` to the current released config contract, seeds `primary` as enabled, and leaves discovered capabilities disabled so capability activation is opt-in.

After initialization succeeds, MetaFlow now automatically enables the built-in MetaFlow capability in settings-only mode and refreshes once so bundled guidance is active immediately. Use `MetaFlow: Initialize MetaFlow Capability` only when you want to switch explicitly to synchronized `.github/` installation or re-enable the built-in mode manually later.

`MetaFlow: Add Repository Source` also recognizes local metadata authoring workflows:

- existing local git repositories are treated as local git-backed metadata repos immediately, even before a remote URL is configured
- if the selected directory is not a git repository yet, MetaFlow offers to initialize it with `git init` plus an empty initial commit
- update checks and pull actions stay limited to repositories that also have a configured remote URL

For new capability authoring, `MetaFlow: Create CAPABILITY.md` opens the bundled contract guidance, a real example capability contract, and a seeded untitled `CAPABILITY.md` draft so authors can start from the shipped conventions instead of hunting for files manually.

Legacy preview configs that still use `metadataRepo`, `layers`, or flat `layerSources` are accepted during the pre-release window. Released configs authored against an older compatibility version are also upgraded automatically. On load/open, MetaFlow rewrites stale configs to the current contract, persists the current `compatibilityVersion`, and shows a migration notice.

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

| Command                                    | Description                                                                                                           | Keybinding     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------- |
| `MetaFlow: Refresh`                        | Reload config and re-resolve overlay                                                                                  | `Ctrl+Shift+R` |
| `MetaFlow: Preview`                        | Show pending changes in output channel                                                                                |                |
| `MetaFlow: Apply`                          | Synchronize files to `.github/`                                                                                       |                |
| `MetaFlow: Clean`                          | Remove synchronized files                                                                                             |                |
| `MetaFlow: Status`                         | Show current status in output channel                                                                                 |                |
| `MetaFlow: Switch Profile`                 | Select active profile                                                                                                 |                |
| `MetaFlow: Toggle Capability`              | Enable/disable a capability                                                                                           |                |
| `Select All`                               | Enable all descendant capabilities for the selected folder branch from the Capabilities view context menu             |                |
| `Deselect All`                             | Disable all descendant capabilities for the selected folder branch from the Capabilities view context menu            |                |
| `MetaFlow: Rescan Repository`              | Force runtime discovery rescan for the selected metadata repo row                                                     |                |
| `MetaFlow: Check Repository Updates`       | Fetch and compute upstream ahead/behind status for git-backed metadata repos                                          |                |
| `MetaFlow: Pull Repository Updates`        | Run `git pull --ff-only` for a selected git-backed metadata repo                                                      |                |
| `MetaFlow: Initialize MetaFlow Capability` | Choose synchronization mode (`synchronize` in config) or built-in settings-only mode persisted in workspace state     |                |
| `MetaFlow: Remove MetaFlow Capability`     | Disable built-in capability mode or remove tracked synchronized `.github` capability files                            |                |
| `MetaFlow: Open Config File`               | Open `.metaflow/config.jsonc` in editor                                                                               |                |
| `MetaFlow: View Capability Details`        | Open or reuse the capability details webview for the selected capability layer                                        |                |
| `MetaFlow: Create CAPABILITY.md`           | Open bundled contract guidance, an example contract, and a seeded `CAPABILITY.md` draft                               |                |
| `MetaFlow: Initialize Configuration`       | Scaffold new `.metaflow/config.jsonc` and automatically enable the built-in MetaFlow capability in settings-only mode |                |
| `MetaFlow: Promote`                        | Detect drifted files for upstream promotion                                                                           |                |

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

## Platform Metadata Support

MetaFlow supports three platform surfaces with different delivery models:

- GitHub Copilot / VS Code Chat: settings injection by default, with optional `.github/**` synchronization.
- Claude Code: root-relative `.claude/**` synchronization.
- Codex: root-relative `.agents/skills/**` repository-skill synchronization.

### GitHub Copilot metadata

GitHub Copilot is the broadest supported target. Capability files can use top-level artifact roots or equivalent `.github/` roots:

| Artifact type | Capability path patterns | Default delivery | Synchronized output |
| --- | --- | --- | --- |
| `instructions` | `instructions/**`, `.github/instructions/**` | VS Code settings | `.github/instructions/**` |
| `prompts` | `prompts/**`, `.github/prompts/**` | VS Code settings | `.github/prompts/**` |
| `agents` | `agents/**`, `.github/agents/**` | VS Code settings | `.github/agents/**` |
| `skills` | `skills/**`, `.github/skills/**` | VS Code settings | `.github/skills/**` |
| `hooks` | `hooks/**` | VS Code settings | `.github/hooks/**` when synchronized |
| `chatmodes` | `chatmodes/**`, `.github/chatmodes/**` | Synchronized | `.github/chatmodes/**` |

For synchronized Copilot files, MetaFlow writes under `.github/`. The default file naming strategy prefixes filenames with the source repo/layer token to reduce collisions, for example `_default-team-standards__review.prompt.md`. Use `fileNamingStrategy: "original-unless-conflict"` when original paths are required and unmanaged destination conflicts have been resolved.

### Copilot settings injected by `MetaFlow: Apply`

- `chat.instructionsFilesLocations` (and legacy `github.copilot.chat.codeGeneration.instructionFiles`)
- `chat.promptFilesLocations` (and legacy `github.copilot.chat.promptFiles`)
- `chat.agentFilesLocations`
- `chat.agentSkillsLocations`
- `chat.hookFilesLocations` (file-based hook entries from `hooks.preApply` / `hooks.postApply`)

`MetaFlow: Clean` removes the above injected keys from workspace settings.

### Claude Code metadata

MetaFlow can manage Claude Code workspace metadata as root-relative synchronized files written directly to the workspace `.claude/` directory.

#### Artifact types

A capability may include any of the following Claude Code subdirectories. All are synchronized by default — no VS Code settings injection is involved.

| Artifact type | Capability path pattern | Output path | Config key |
| --- | --- | --- | --- |
| `claude-rules` | `.claude/rules/**` | `.claude/rules/<file>` | `claude-rules` |
| `claude-agents` | `.claude/agents/**` | `.claude/agents/<file>` | `claude-agents` |
| `claude-skills` | `.claude/skills/**` | `.claude/skills/<skill-name>/…` | `claude-skills` |
| `claude-settings` | `.claude/settings/**` | `.claude/settings/<file>` | `claude-settings` |

Files at `.claude/settings.json` (direct root JSON) are recognized as `claude-settings` as well.

#### Naming and output routing

- Files are written relative to the **workspace root**, not under `.github/`.
- Filenames are **preserved exactly** (no `_repo-layer__` prefix) because Claude Code requires exact canonical paths.
- A capability source file such as `.claude/rules/my-rules.md` is written to `<workspace>/.claude/rules/my-rules.md`.
- When multiple enabled capabilities contribute a file to the same path, the standard last-wins overlay rule applies and a conflict warning is emitted.

#### Delivery mode

All four `claude-*` types default to `synchronize`. Setting mode (`settings`) is recognized in config but has no VS Code settings target — it causes the files to be excluded from sync entirely. Use `synchronize` (the default) for normal Claude Code delivery.

To configure delivery at the global, repo, or capability level:

```jsonc
{
    "injection": {
        "claude-rules": "synchronize",
        "claude-agents": "synchronize",
        "claude-skills": "synchronize",
        "claude-settings": "synchronize"
    }
}
```

#### Provenance and drift

Synchronized `.claude/` files receive a provenance comment header identical to other synchronized types. MetaFlow tracks content hashes in `.metaflow/state.json` with an explicit `outputDir: "."` entry (workspace root) so drift detection and clean operations correctly locate the files.

> **Note on JSON files**: `.claude/settings.json` is strict JSON. The provenance header is an HTML comment block prepended to the file, which is not valid JSON. Keep `.claude/settings.json` hand-authored or manage it outside MetaFlow's sync pipeline. Use `.claude/settings/` subdirectories for any settings fragments you want MetaFlow to manage as text files.

#### Example capability layout

```
my-shared-metadata/
  team-standards/
    CAPABILITY.md
    .claude/
      rules/
        coding-standards.md
        security-review.md
      agents/
        code-reviewer.md
        architect.md
      skills/
        run-tests/
          SKILL.md
        deploy-staging/
          SKILL.md
```

After `MetaFlow: Apply`, the workspace receives:

```
.claude/
  rules/
    coding-standards.md
    security-review.md
  agents/
    code-reviewer.md
    architect.md
  skills/
    run-tests/
      SKILL.md
    deploy-staging/
      SKILL.md
```

#### Excluding claude-* types

Per-capability type exclusion works the same as for Copilot types:

```jsonc
{
    "capabilities": [
```text
.agents/skills/codex-metadata/SKILL.md
```
The table below covers every artifact type and engine capability across the supported platforms in this branch.

| Feature | GitHub Copilot | Claude Code |
| --- | --- | --- |

| Instructions / Rules | `instructions/` ✓ | `.claude/rules/` ✓ |
| Prompts | `prompts/` ✓ | — |
| Agents | `agents/` ✓ | `.claude/agents/` ✓ |
| Skills | `skills/` ✓ | `.claude/skills/` ✓ |
| Settings / Hooks | `hooks/` ✓ | `.claude/settings/` ✓ |
| --- | --- | --- | --- |
| VS Code settings injection | ✓ | — |
| File synchronization | ✓ (`.github/`) | ✓ (`.claude/`) |
| File naming | `_repo-layer__<name>` | Original name (no prefix) |
| Output base directory | `.github/` | Workspace root |
| Skills | `skills/` ✓ | `.claude/skills/` ✓ | `.agents/skills/` ✓ |
| Overlay resolution | ✓ | ✓ |
| Profile activation | ✓ | ✓ |
| Per-type injection mode | `settings` / `synchronize` | `synchronize` (default) |
| Type exclusion per capability | ✓ | ✓ |
| Conflict detection | ✓ | ✓ |
| Drift detection | ✓ | ✓ |
| Provenance headers | ✓ (HTML comment) | ✓ (HTML comment, text files only) |
| Clean / remove managed files | ✓ | ✓ |
| State tracking in `.metaflow/state.json` | `outputDir` absent (default `.github/`) | `outputDir: "."` (workspace root) |
| Per-type injection mode | `settings` / `synchronize` | `synchronize` (default) | `synchronize` (implicit) |
| Type exclusion per capability | ✓ | ✓ | — |
| Conflict detection | ✓ | ✓ | ✓ |
| Drift detection | ✓ | ✓ | ✓ |
| Provenance headers | ✓ (HTML comment) | ✓ (HTML comment, text files only) | ✓ (HTML comment) |
The steps below walk through a complete end-to-end validation of GitHub Copilot and Claude Code synchronization.
| State tracking in `.metaflow/state.json` | `outputDir` absent (default `.github/`) | `outputDir: "."` (workspace root) | `outputDir: "."` (workspace root) |

> **Claude Code settings.json caveat**: provenance headers are prepended as HTML comment blocks. JSON files break when a comment is prepended. Keep `.claude/settings.json` hand-authored and manage settings fragments as text files under `.claude/settings/` instead.

## Validating Platform Support

The steps below walk through a complete end-to-end validation of GitHub Copilot, Claude Code, and Codex synchronization.

### 1. Create a test capability

Create a directory structure inside a metadata repository (or a temporary directory):

```text
test-capability/
  CAPABILITY.md
  instructions/
    test.instructions.md
  .claude/
    rules/
      test-rule.md
    agents/
      test-agent.md
    skills/
      test-skill/
        SKILL.md
```

Minimal `CAPABILITY.md`:

```md
---
name: Multi-Platform Test
description: Validates GitHub Copilot and Claude Code artifact delivery.
---
```

Minimal `instructions/test.instructions.md`:

```md
---
applyTo: "**/*.ts"
---
Use this instruction to validate Copilot synchronized output.
```

Minimal `.claude/rules/test-rule.md`:

```md
---
name: Test Rule
---
Use this rule to validate MetaFlow claude-rules sync.
```

Minimal `.claude/agents/test-agent.md`:

```md
---
name: Test Agent
description: Validates MetaFlow claude-agents sync.
---
```

Minimal `.claude/skills/test-skill/SKILL.md`:

```md
---
name: test-skill
description: Validates MetaFlow claude-skills sync.
---
Run the test suite.
```

### 2. Configure `.metaflow/config.jsonc`

```jsonc
{
    "metadataRepos": [
        {
            "id": "test",
            "name": "Test Repo",
            "localPath": "/path/to/test-capability-parent",
            "capabilities": [
                { "path": "test-capability", "enabled": true }
            ]
        }
    ],
    "injection": {
        "instructions": "synchronize"
    }
}
```

### 3. Run MetaFlow: Preview

Run `MetaFlow: Preview` and verify the output channel shows:

- `[add] instructions/_test-test-capability__test.instructions.md` or another prefixed `.github/` instruction output, depending on your repo/layer id
- `[add] .claude/rules/test-rule.md`
- `[add] .claude/agents/test-agent.md`
- `[add] .claude/skills/test-skill/SKILL.md`

Confirm the Copilot output is under `.github/`, while Claude output paths start with `.claude/` and not `.github/`.

### 4. Run MetaFlow: Apply

Run `MetaFlow: Apply` and verify:

- `<workspace>/.github/instructions/<prefixed-test-instructions-file>` exists with a provenance header.
- `<workspace>/.claude/rules/test-rule.md` exists and contains the file content plus a `<!-- metaflow:provenance … -->` header.
- `<workspace>/.claude/agents/test-agent.md` exists with a provenance header.
- `<workspace>/.claude/skills/test-skill/SKILL.md` exists with a provenance header.
- `.metaflow/state.json` contains entries for each root-relative file with `"outputDir": "."`.

### 5. Verify drift detection

Edit `.claude/rules/test-rule.md` in the workspace (add or change a line). Then run `MetaFlow: Status` or `MetaFlow: Preview`. The output should report the file as **drifted** and skip it on the next apply unless promoted.

### 6. Verify clean

Run `MetaFlow: Clean` and verify:

- `.claude/rules/test-rule.md`, `.claude/agents/test-agent.md`, and `.claude/skills/test-skill/SKILL.md` are removed.
- `.metaflow/state.json` no longer tracks those files.

### 7. Test backward compatibility

Add a Copilot `instructions/` artifact to the same capability and re-apply. Verify that:

- Copilot instructions land in `.github/instructions/` with the `_test-layer__` prefix.
- Claude Code files land in `.claude/` without a prefix.
- Both sets of entries appear in `.metaflow/state.json` with the correct `outputDir` values (`undefined`/absent for `.github/`, `"."` for `.claude/`).

### 8. Run the engine test suite

```powershell
npm -w @metaflow/engine test
```

The `claudeArtifacts.test.ts` suite covers `getArtifactType`, `isClaudeArtifactPath`, `classifySingle`, `planSynchronization`, and `apply` for all claude-* types (CLA-01 through CLA-06, 30 tests).
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
