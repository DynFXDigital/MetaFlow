# Phase 4 — Extension UI + Commands

## Objectives

- Wire the overlay engine + materializer into VS Code commands.
- Deliver TreeView providers, status bar, and output channel for operational visibility.
- Implement Copilot settings injection for live-referenced artifacts.
- Deliver integration tests running in the Extension Host.
- Update SDD and TCS with UI design elements and test cases.

## Scope

**In scope**
- `src/commands/commandHandlers.ts` — handlers for all `metaflow.*` commands
- `src/commands/initConfig.ts` — scaffold a new `ai-sync.json`
- `src/views/configTreeView.ts` — config summary TreeView
- `src/views/profilesTreeView.ts` — profiles list with active indicator
- `src/views/layersTreeView.ts` — layers with enable/disable checkboxes
- `src/views/filesTreeView.ts` — effective files grouped by classification
- `src/views/statusBar.ts` — full status bar (profile, file count, state)
- `src/views/outputChannel.ts` — structured logging with configurable verbosity
- `src/extension.ts` — complete activation wiring
- `src/test/integration/extension.test.ts` — activation and command registration tests
- `src/test/integration/commands.test.ts` — command execution tests
- `src/test/integration/treeViews.test.ts` — TreeView data tests
- `test-workspace/` — extended fixture for integration tests

**Out of scope**
- Auto-sync/watchers (defer to future plan)
- Promotion automation (detect-only)

## Tasks

### T4.1 — Command Handlers

1. Implement command handlers using the overlay engine and materializer:
   - `metaflow.refresh` — reload config, re-resolve, update views.
   - `metaflow.preview` — show effective tree in output channel.
   - `metaflow.apply` — materialize with progress indicator (`vscode.window.withProgress`).
   - `metaflow.clean` — remove managed files with confirmation prompt.
   - `metaflow.status` — show status in output channel.
   - `metaflow.switchProfile` — quick-pick profile selector; update config file.
   - `metaflow.toggleLayer` — toggle layer enabled/disabled; update config file.
   - `metaflow.openConfig` — open `ai-sync.json` in editor.
   - `metaflow.initConfig` — scaffold new config file.
   - `metaflow.promote` — detect drifted files, show drift report.
2. Register all commands in `package.json` contributions.
3. Register activation events: `workspaceContains:**/ai-sync.json` and per-command.

### T4.2 — TreeView Providers

1. **ConfigTreeView** — display metadata repo URL, commit, injection modes.
2. **ProfilesTreeView** — list profiles with `$(check)` icon on active; click to switch.
3. **LayersTreeView** — ordered layers with checkbox state (enabled/disabled); `onDidChangeCheckboxState` handler.
4. **FilesTreeView** — two groups: "Live-Referenced" and "Materialized"; each file shows source layer.

All providers implement `TreeDataProvider<T>` with `onDidChangeTreeData` event.

### T4.3 — Status Bar

1. Show `MetaFlow: <profile> (<N> files)`.
2. State colors: normal (default), loading (pulsing), error (warning), drift detected (info).
3. Click action: `metaflow.switchProfile`.

### T4.4 — Output Channel

1. Prefix messages with timestamp and severity.
2. Support configurable verbosity via `metaflow.logLevel` setting.
3. Auto-show on errors.

### T4.5 — Activity Bar Container

1. Register `metaflow-container` viewsContainer in activity bar.
2. Register all four TreeViews under the container.
3. Add welcome content for when no config is found.

### T4.6 — Settings Contribution

1. Register `metaflow.enabled`, `metaflow.autoApply`, `metaflow.logLevel`, `metaflow.hooksEnabled` in `package.json`.
2. Listen for settings changes and re-apply as needed.

### T4.7 — Integration Tests

1. **Activation tests:**
   - Extension activates when `ai-sync.json` present.
   - Extension activates when `metaflow.initConfig` invoked.
   - Commands are registered after activation.
2. **Command execution tests:**
   - `metaflow.refresh` succeeds with valid config.
   - `metaflow.apply` writes expected files to test workspace.
   - `metaflow.clean` removes managed files.
   - `metaflow.switchProfile` updates config.
   - `metaflow.toggleLayer` updates config.
3. **TreeView tests:**
   - ProfilesTreeView returns expected items.
   - LayersTreeView returns expected items with checkbox state.
   - FilesTreeView groups files correctly.

### T4.8 — Keybindings and Menus

1. Register keybinding for `metaflow.refresh` (Ctrl+Shift+R when `metaflow.active`).
2. Register context menus for TreeView items (switch profile, toggle layer, set injection mode).
3. Register view/title menu for refresh button.

### T4.9 — Update Traceability Docs

1. Add DES-* entries to SDD for commands, views, status bar, settings.
2. Add TC-* entries to TCS for each integration test.
3. Update traceability matrix.

## Deliverables

- Fully functional VS Code extension with all commands and views
- Integration tests running in Extension Host
- Updated SDD and TCS

## Exit Criteria

- All commands execute successfully against test workspace.
- TreeViews render expected data.
- Integration tests pass via `npm test`.
- Status bar reflects correct state.
- Extension gracefully degrades when config is missing or invalid.
- SDD has DES-* for all Phase 4 components.
- TCS has TC-* for all Phase 4 test cases.

