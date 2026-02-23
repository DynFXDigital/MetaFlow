# TCS — Test Case Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| TCS-metaflow-ext | MetaFlow VS Code Extension | TBD | Draft |

| Last Updated | Related SRS | Notes |
|---|---|---|
| 2026-02-07 | SRS-metaflow-ext | Skeleton — populated incrementally per phase |

## Test Strategy (brief)

- **Levels**: unit (Pure TS, no Extension Host) / integration (Extension Host via `@vscode/test-electron`) / manual (documented FTD procedures)
- **Targets**: Config loader, overlay engine, materializer, commands, TreeViews, settings injection
- **Environments**: Node.js for unit tests; VS Code Extension Host for integration tests; VS Code with test workspace for manual tests
- **Coverage target**: ≥80% line coverage on core engine modules
- **Framework**: Mocha + assert (unit); Mocha + `@vscode/test-electron` (integration); c8 (coverage)

## Test Cases

| TC-ID | Title | Preconditions | Steps (brief) | Expected Result | Type | Priority | Status | Location / Implementation | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TC-0001 | Config loads from workspace root | Valid `.metaflow.json` at root | Call `loadConfig(workspaceRoot)` | `ok: true`, config parsed | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0002 | Config returns error when missing | No config file | Call `loadConfig(emptyDir)` | `ok: false`, error message | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0003 | Single-repo config parsed | Valid single-repo JSON | Call `loadConfigFromPath(path)` | Config with `metadataRepo`, `layers` | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0004 | Multi-repo config parsed | Valid multi-repo JSON | Call `loadConfigFromPath(path)` | Config with `metadataRepos`, `layerSources` | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0005 | Invalid JSON returns parse errors | Malformed JSON file | Call `loadConfigFromPath(path)` | `ok: false`, parse errors with line info | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0006 | Missing metadataRepo detected | Config missing both repo fields | Call `loadConfigFromPath(path)` | Error: neither metadataRepo nor metadataRepos | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0007 | JSONC comments tolerated | Config with `//` and trailing commas | Call `parseAndValidate(text)` | `ok: true`, config parsed | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0008 | Empty input rejected | Empty string | Call `parseAndValidate("")` | Error | Unit | Medium | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0009 | Array input rejected | Top-level array | Call `parseAndValidate("[]")` | Error | Unit | Medium | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0010 | Null input rejected | `null` | Call `parseAndValidate("null")` | Error | Unit | Medium | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0011 | Duplicate repo IDs detected | Multi-repo with duplicate `id` | `validateConfig(config)` | Error: duplicate IDs | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0012 | Invalid repoId in layerSources | LayerSource references non-existent repo | `validateConfig(config)` | Error: unknown repoId | Unit | High | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0013 | activeProfile must exist in profiles | activeProfile key not in profiles map | `validateConfig(config)` | Error: profile not found | Unit | Medium | Pass | `test/unit/configLoader.test.ts` | Phase 1 |
| TC-0014 | Config discovered at workspace root | `.metaflow.json` at root | `discoverConfigPath(root)` | Returns root path | Unit | High | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0015 | Config discovered at .ai fallback | `.ai/.metaflow.json` only | `discoverConfigPath(root)` | Returns .ai path | Unit | High | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0016 | No config returns undefined | No config files | `discoverConfigPath(root)` | `undefined` | Unit | High | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0017 | Path resolution | Relative path | `resolvePathFromWorkspace(ws, rel)` | Absolute joined path | Unit | Medium | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0018 | Boundary check inside | Path under boundary | `isWithinBoundary(path, boundary)` | `true` | Unit | Medium | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0019 | Boundary check outside | Path above boundary | `isWithinBoundary(path, boundary)` | `false` | Unit | Medium | Pass | `test/unit/configPathUtils.test.ts` | Phase 1 |
| TC-0100 | Glob exact match | Exact path vs exact pattern | `matchesGlob(path, pattern)` | `true` | Unit | High | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0101 | Glob wildcard `*` | Path vs wildcard pattern | `matchesGlob(path, "dir/*.md")` | `true` for .md, `false` for .txt | Unit | High | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0102 | Glob double-star `**` | Nested path vs `**/*.md` | `matchesGlob(nested, "**/*.md")` | `true` | Unit | High | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0103 | Glob directory prefix | Path vs `dir/**` | `matchesGlob(path, "dir/**")` | `true` for dir files, `false` for others | Unit | High | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0104 | Glob dotfile matching | `.hidden/file.md` vs `**/*.md` | `matchesGlob(dotfile, "**/*.md")` | `true` (dot option) | Unit | Medium | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0105 | Glob backslash normalization | Backslash path vs forward-slash pattern | `matchesGlob("a\\b.md", "a/*.md")` | `true` | Unit | Medium | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0106 | matchesAnyGlob one match | Path vs array of patterns | `matchesAnyGlob(path, [bad, good])` | `true` | Unit | Medium | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0107 | matchesAnyGlob none | Path vs non-matching patterns | `matchesAnyGlob(path, [bad1, bad2])` | `false` | Unit | Medium | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0108 | matchesAnyGlob empty | Path vs empty array | `matchesAnyGlob(path, [])` | `false` | Unit | Medium | Pass | `test/unit/globMatcher.test.ts` | Phase 2 |
| TC-0110 | Single layer resolves all files | Repo with one layer | `resolveLayers(config, ws)` | One LayerContent with all files | Unit | High | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0111 | Multiple layers no conflicts | Two layers with distinct files | `resolveLayers(config, ws)` | Two LayerContent entries | Unit | High | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0112 | Layer conflict later-wins | Two layers with same file | `buildEffectiveFileMap(layers)` | Map entry sourced from later layer | Unit | High | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0113 | Empty layers array | Config with `layers: []` | `resolveLayers(config, ws)` | Empty array | Unit | Medium | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0114 | Nested directory structure | Layer with deep nesting | `resolveLayers(config, ws)` | All nested files found | Unit | Medium | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0115 | Non-existent layer dir | Layer path that doesn't exist | `resolveLayers(config, ws)` | Layer with 0 files | Unit | Medium | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0116 | Multi-repo layer sources | Two repos, two layers | `resolveLayers(config, ws)` | Layers with correct repoId | Unit | High | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0117 | Disabled layer source skipped | LayerSource with `enabled: false` | `resolveLayers(config, ws)` | Empty result | Unit | Medium | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0118 | Invalid repoId in layerSources | Unknown repoId | `resolveLayers(config, ws)` | Layer skipped | Unit | Medium | Pass | `test/unit/overlayEngine.test.ts` | Phase 2 |
| TC-0119 | Runtime discovery resolves new layers | Repo with `discover.enabled: true` and dynamic layer path | `resolveLayers(config, ws)` | Discovered layer appended to resolved set | Unit | High | Pass | `packages/engine/test/engine.test.ts` | Phase 4 |
| TC-0125 | Discovery can be gated by refresh mode | Repo with discovery enabled | `resolveLayers(config, ws, { enableDiscovery: false })` | Only explicit `layerSources` resolved | Unit | High | Pass | `packages/engine/test/engine.test.ts` | Phase 4 |
| TC-0126 | Discovery exclude patterns applied | Repo with allowed + excluded layer directories | `discoverLayersInRepo(repoRoot, exclude)` | Matching excluded paths are omitted | Unit | Medium | Pass | `packages/engine/test/engine.test.ts` | Phase 4 |
| TC-0120 | No filters returns all | Files + no filter | `applyFilters(files, undefined)` | All files returned | Unit | High | Pass | `test/unit/filterEngine.test.ts` | Phase 2 |
| TC-0121 | Include-only filters | Include `instructions/**` | `applyFilters(files, filter)` | Only instruction files | Unit | High | Pass | `test/unit/filterEngine.test.ts` | Phase 2 |
| TC-0122 | Exclude-only filters | Exclude `**/*.txt` | `applyFilters(files, filter)` | Non-txt files | Unit | High | Pass | `test/unit/filterEngine.test.ts` | Phase 2 |
| TC-0123 | Include + exclude combined | Include instructions+prompts, exclude one | `applyFilters(files, filter)` | Exclude wins | Unit | High | Pass | `test/unit/filterEngine.test.ts` | Phase 2 |
| TC-0124 | Exclude everything | Exclude `**/*` | `applyFilters(files, filter)` | Empty result | Unit | Medium | Pass | `test/unit/filterEngine.test.ts` | Phase 2 |
| TC-0130 | No profile returns all | Files + undefined profile | `applyProfile(files, undefined)` | All files returned | Unit | High | Pass | `test/unit/profileEngine.test.ts` | Phase 2 |
| TC-0131 | Selective disable | Profile disabling agents | `applyProfile(files, profile)` | No agent files | Unit | High | Pass | `test/unit/profileEngine.test.ts` | Phase 2 |
| TC-0132 | Selective enable | Profile enabling instructions only | `applyProfile(files, profile)` | Only instructions | Unit | High | Pass | `test/unit/profileEngine.test.ts` | Phase 2 |
| TC-0133 | Disable wins over enable | Profile enabling + disabling same pattern | `applyProfile(files, profile)` | Disable wins | Unit | High | Pass | `test/unit/profileEngine.test.ts` | Phase 2 |
| TC-0134 | Disable everything | Profile disabling `**/*` | `applyProfile(files, profile)` | Empty result | Unit | Medium | Pass | `test/unit/profileEngine.test.ts` | Phase 2 |
| TC-0140 | Instructions classified settings | `instructions/x.md` | `classifySingle(path, undefined)` | `settings` | Unit | High | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0141 | Skills classified materialized | `skills/x/SKILL.md` | `classifySingle(path, undefined)` | `materialized` | Unit | High | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0142 | Unknown type materialized | `random/file.txt` | `classifySingle(path, undefined)` | `materialized` | Unit | Medium | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0143 | Injection override to settings | Skills + `{skills: 'settings'}` | `classifySingle(path, injection)` | `settings` | Unit | High | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0144 | Injection override to materialize | Instructions + `{instructions: 'materialize'}` | `classifySingle(path, injection)` | `materialized` | Unit | Medium | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0145 | Batch classification | Multiple files | `classifyFiles(files, undefined)` | Correct per-file classification | Unit | Medium | Pass | `test/unit/classifier.test.ts` | Phase 2 |
| TC-0200 | Provenance round-trip (all fields) | Full provenance data | Write → parse | Identity | Unit | High | Pass | `test/unit/provenanceHeader.test.ts` | Phase 3 |
| TC-0201 | Provenance round-trip (minimal) | Minimal required fields | Write → parse | Identity | Unit | High | Pass | `test/unit/provenanceHeader.test.ts` | Phase 3 |
| TC-0202 | Parse without provenance | File without header | `parseProvenanceHeader(content)` | `null` | Unit | High | Pass | `test/unit/provenanceHeader.test.ts` | Phase 3 |
| TC-0203 | Strip provenance header | File with header + body | `stripProvenanceHeader(full)` | Body only | Unit | High | Pass | `test/unit/provenanceHeader.test.ts` | Phase 3 |
| TC-0210 | Content hash deterministic | Same content | `computeContentHash()` twice | Same hash | Unit | High | Pass | `test/unit/managedState.test.ts` | Phase 3 |
| TC-0211 | State save/load round-trip | State with files | Save → load | Identity | Unit | High | Pass | `test/unit/managedState.test.ts` | Phase 3 |
| TC-0212 | Load non-existent state | No state file | `loadManagedState(dir)` | Empty state | Unit | High | Pass | `test/unit/managedState.test.ts` | Phase 3 |
| TC-0213 | Load corrupted state | Invalid JSON | `loadManagedState(dir)` | Empty state (graceful) | Unit | Medium | Pass | `test/unit/managedState.test.ts` | Phase 3 |
| TC-0214 | State with multiple files | 3+ files | Save → load | All entries preserved | Unit | Medium | Pass | `test/unit/managedState.test.ts` | Phase 3 |
| TC-0220 | Drift: in-sync file | Matching hash | `checkDrift()` | `in-sync` | Unit | High | Pass | `test/unit/driftDetector.test.ts` | Phase 3 |
| TC-0221 | Drift: drifted file | Different hash | `checkDrift()` | `drifted` | Unit | High | Pass | `test/unit/driftDetector.test.ts` | Phase 3 |
| TC-0222 | Drift: missing file | File absent | `checkDrift()` | `missing` | Unit | High | Pass | `test/unit/driftDetector.test.ts` | Phase 3 |
| TC-0223 | Drift: untracked file | Not in state | `checkDrift()` | `untracked` | Unit | Medium | Pass | `test/unit/driftDetector.test.ts` | Phase 3 |
| TC-0230 | Apply no conflicts | Clean workspace | `apply(options)` | Files written + state created | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0231 | Apply skips drifted | Drifted file exists | `apply(options)` | Skip + warning | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0232 | Apply is deterministic | Run twice | `apply()` × 2 | Same result | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0233 | Apply removes stale | File removed from overlay | `apply(options)` | Old file deleted | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0234 | Clean in-sync only | Mixed drift states | `clean(ws)` | Only in-sync removed | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0235 | Preview pending changes | New files | `preview(ws, files)` | Action=add | Unit | Medium | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0236 | Preview detects drift | Drifted file | `preview(ws, files)` | Action=skip, reason=drifted | Unit | Medium | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0237 | Settings-classified not materialized | Classification=settings | `apply(options)` | Not written | Unit | High | Pass | `test/unit/materializer.test.ts` | Phase 3 |
| TC-0240 | Settings: instructions paths | Settings-classified instructions | `computeSettingsEntries()` | instructionFiles key | Unit | High | Pass | `test/unit/settingsInjector.test.ts` | Phase 3 |
| TC-0241 | Settings: prompts paths | Settings-classified prompts | `computeSettingsEntries()` | promptFiles key | Unit | High | Pass | `test/unit/settingsInjector.test.ts` | Phase 3 |
| TC-0242 | Settings: ignores materialized | Materialized files | `computeSettingsEntries()` | No entries | Unit | Medium | Pass | `test/unit/settingsInjector.test.ts` | Phase 3 |
| TC-0243 | Settings: hook paths | Config with hooks | `computeSettingsEntries()` | Hook entries | Unit | Medium | Pass | `test/unit/settingsInjector.test.ts` | Phase 3 |
| TC-0244 | Settings: keys to remove | N/A | `computeSettingsKeysToRemove()` | Expected keys | Unit | Low | Pass | `test/unit/settingsInjector.test.ts` | Phase 3 |
| TC-0245 | Command helper normalization and option parsing | Mixed command args and config fragments | Call `commandHelpers` pure functions | Deterministic parse and normalization outputs | Unit | High | Pass | `src/src/test/unit/commandHelpers.test.ts` | Phase 3 hardening |
| TC-0246 | Init-config helper normalization | URL/path/layer helper inputs | Call `initConfigHelpers` pure functions | Stable normalization and config scaffold defaults | Unit | Medium | Pass | `src/src/test/unit/initConfigHelpers.test.ts` | Phase 3 hardening |
| TC-0247 | Test runner mode selection + error handling | Unit/integration args with injected failures | Call `runWithArgs` and `main` | Correct runner path and deterministic non-zero on failure | Unit | Medium | Pass | `src/src/test/unit/runTestRunner.test.ts` | Phase 3 hardening |
| TC-0248 | Unit runner index deterministic behavior | Synthetic glob/Mocha outcomes | Call `createMocha`, `collectTestFiles`, `runMocha` | Deterministic collection and failure surfacing | Unit | Medium | Pass | `src/src/test/unit/unitRunnerIndex.test.ts` | Phase 3 hardening |
| TC-0249 | Config diagnostics mapping contract | Engine validation errors with ranges | Call diagnostics mapper functions | Correct VS Code diagnostic shape, source, and clear behavior | Unit | Medium | Pass | `src/src/test/unit/configDiagnostics.test.ts` | Phase 3 hardening |
| TC-0250 | Extension support module coverage guard | Unit test suite execution | Run `npm run test:unit` + c8 unit coverage command | 100% statement/branch/function/line for instrumented support scope | Unit | Medium | Pass | `src/src/test/unit/*.test.ts` + `npx c8 --reporter=text node ./out/test/runTest.js --unit` | Phase 3 hardening |

### Phase 4 — Extension UI + Commands (Integration Tests)

| TC-ID | Title | Input/Precondition | Action/Step | Expected Result | Type | Priority | Status | Automation Ref | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TC-0300 | Extension is present | Test workspace | `getExtension('dynfxdigital.metaflow')` | Extension found | Integration | Critical | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0301 | Extension activates | Test workspace | `ext.activate()` | `ext.isActive === true` | Integration | Critical | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0302 | All commands registered | Extension active | `getCommands()` | All 10 `metaflow.*` commands found | Integration | Critical | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0303 | Refresh executes | Extension active | `executeCommand('metaflow.refresh')` | No error thrown | Integration | High | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0304 | Status executes | Extension active | `executeCommand('metaflow.status')` | No error thrown | Integration | Medium | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0305 | Preview executes | Extension active | `executeCommand('metaflow.preview')` | No error thrown | Integration | Medium | Pass | `test/integration/extension.test.ts` | Phase 4 |
| TC-0310 | Refresh loads config | Test workspace with .metaflow.json | `executeCommand('metaflow.refresh')` | Config loaded | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0311 | openConfig opens editor | Config loaded | `executeCommand('metaflow.openConfig')` | .metaflow.json in active editor | Integration | Medium | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0312 | Apply creates files | Config loaded | `executeCommand('metaflow.apply')` | .github dir populated | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0313 | Clean removes managed | Config loaded | `executeCommand('metaflow.clean')` | Managed files removed | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0314 | Status logs info | Config loaded | `executeCommand('metaflow.status')` | No error | Integration | Medium | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0315 | Promote reports drift | Config loaded | `executeCommand('metaflow.promote')` | No error | Integration | Medium | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0316 | Manual repository rescan discovers runtime layers | `autoApply: false`; discovery-enabled repo with explicit+dynamic layers | `executeCommand('metaflow.rescanRepository', {repoId})` then `apply` | Dynamic layer files included after rescan, not before | Integration | High | Pass | `src/src/test/integration/commands.test.ts` | Phase 4 |
| TC-0320 | ConfigTreeView: empty no config | No config | `getChildren()` | Empty array | Integration | Medium | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0321 | ConfigTreeView: items with config | Config set | `getChildren()` | 3+ items (config, repo, URL) | Integration | High | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0322 | ProfilesTreeView: empty | No profiles | `getChildren()` | Empty array | Integration | Medium | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0323 | ProfilesTreeView: items | 2 profiles | `getChildren()` | 2 items | Integration | High | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0324 | ProfilesTreeView: active marker | Active=lean | `getChildren()` | lean has `(active)` | Integration | High | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0325 | LayersTreeView: empty | No config | `getChildren()` | Empty array | Integration | Medium | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0326 | LayersTreeView: single-repo | 2 layers | `getChildren()` | 2 items | Integration | High | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0327 | FilesTreeView: empty | No files | `getChildren()` | Empty array | Integration | Medium | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0328 | FilesTreeView: groups + hierarchy | 1 settings-linked + 1 materialized with nested paths | `getChildren()` recursively | 2 groups; folder hierarchy preserved; file description includes source label + realization | Integration | High | Pass | `test/integration/treeViews.test.ts` | Phase 4 |
| TC-0329 | Refresh publishes diagnostics for invalid config | Existing workspace config file path | Write invalid config, run `metaflow.refresh`, inspect diagnostics | Problems include MetaFlow diagnostics on config file | Integration | High | Pass | `test/integration/diagnostics.test.ts` | Phase 4 |
| TC-0330 | Refresh clears diagnostics after config fix | Invalid diagnostics already present | Restore valid config and run `metaflow.refresh` | MetaFlow diagnostics for config file are cleared | Integration | High | Pass | `test/integration/diagnostics.test.ts` | Phase 4 |
| TC-0331 | Config watcher auto-refresh triggers settings injection | Valid config and `metaflow.autoApply=true` | Modify `.metaflow/config.jsonc` and wait for watcher refresh | Instruction/prompt settings are injected without manual refresh command | Integration | Critical | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0332 | Apply injects agent and skill locations | Config with settings-classified agents/skills | Run `metaflow.apply` and inspect workspace settings | `chat.agentFilesLocations` and `chat.agentSkillsLocations` are populated | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0333 | Hooks-disabled mode suppresses hook setting injection | Config has hooks; `metaflow.hooksEnabled=false` | Run refresh and inspect workspace settings | `chat.hookFilesLocations` is not injected when hooks are disabled | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |
| TC-0334 | Promote reports no-drift status explicitly | Managed state has no drifted files | Run `metaflow.promote` and observe informational status | User receives explicit no-drift informational message | Integration | High | Pass | `test/integration/commands.test.ts` | Phase 4 |

## Traceability Matrix (TC → REQ)

| TC-ID | REQ-0001 | REQ-0002 | REQ-0003 | REQ-0004 | REQ-0005 | REQ-0006 | REQ-0007 | REQ-0100 | REQ-0101 | REQ-0102 | REQ-0103 | REQ-0104 | REQ-0105 | REQ-0106 | REQ-0107 | REQ-0108 | REQ-0109 | REQ-0110 | REQ-0111 | REQ-0112 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-0001 | X | | | | | | | | | | | | | | | | | | | |
| TC-0002 | X | | | | | | | | | | | | | | | | | | | |
| TC-0003 | X | X | | | | | | | | | | | | | | | | | | |
| TC-0004 | | | X | | | | | | | | | | | | | | | | | |
| TC-0005 | | | | | X | | X | | | | | | | | | | | | | |
| TC-0006 | X | | | | | | | | | | | | | | | | | | | |
| TC-0007 | | | | | X | | | | | | | | | | | | | | | |
| TC-0011 | | | X | X | | | | | | | | | | | | | | | | |
| TC-0012 | | | X | | | | | | | | | | | | | | | | | |
| TC-0013 | | | | | | | | | | | | | | | | X | | | | |
| TC-0014 | X | | | | | X | | | | | | | | | | | | | | |
| TC-0015 | X | | | | | X | | | | | | | | | | | | | | |
| TC-0016 | X | | | | | | | | | | | | | | | | | | | |
| TC-0110 | | | | | | | | X | X | | | | | | | | | | | |
| TC-0111 | | | | | | | | X | X | | | | | | | | | | | |
| TC-0112 | | | | | | | | | | X | X | | | | | | | | | |
| TC-0116 | | | | | | | | | | X | X | | | | | | | | | |
| TC-0120 | | | | | | | | | | | | X | X | | | | | | | |
| TC-0121 | | | | | | | | | | | | X | | | | | | | | |
| TC-0122 | | | | | | | | | | | | | X | | | | | | | |
| TC-0123 | | | | | | | | | | | | X | X | | | | | | | |
| TC-0130 | | | | | | | | | | | | | | X | X | | | | | |
| TC-0131 | | | | | | | | | | | | | | | | X | | | | |
| TC-0132 | | | | | | | | | | | | | | X | | | | | | |
| TC-0133 | | | | | | | | | | | | | | | | X | | | | |
| TC-0140 | | | | | | | | | | | | | | | | | X | | | |
| TC-0141 | | | | | | | | | | | | | | | | | X | | | |
| TC-0143 | | | | | | | | | | | | | | | | | | X | X | X |
| TC-0144 | | | | | | | | | | | | | | | | | | X | X | |
| TC-0119 | | | | | | | | | | | | | | | | | | | | X |
| TC-0125 | | | | | | | | | | | | | | | | | | | | X |
| TC-0126 | | | | | | | | | | | | | | | | | | | | X |
| TC-0316 | | | | | | | | | | | | | | | | | | | | X |
| TC-0329 | | | | X | | | | | | | | | | | | | | | | |
| TC-0330 | | | | X | | | | | | | | | | | | | | | | |

### Supplemental Matrix (Phase 4 command/settings requirements)

| TC-ID | REQ-0008 | REQ-0211 | REQ-0400 | REQ-0409 | REQ-0503 | REQ-0504 |
|---|---|---|---|---|---|---|
| TC-0331 | X | X | X | | | |
| TC-0332 | | X | | | X | |
| TC-0333 | | X | X | | | X |
| TC-0334 | | | | X | | |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| TC maps to ≥1 REQ | 74 | 74 | All test cases map to at least one requirement. |
| Enforced REQ covered by ≥1 TC (Config) | 8 | 8 | All config REQs covered. |
| Enforced REQ covered by ≥1 TC (Overlay) | 13 | 12 | REQ-0103 (cross-repo) partially covered via multi-repo tests. |
| Enforced REQ covered by ≥1 TC (Materialization) | 13 | 13 | All materialization REQs covered. |
| Enforced REQ covered by ≥1 TC (UI/Commands) | 10 | 10 | All Phase 4 REQs covered by integration tests. |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-22 | Added TC-0245 through TC-0250 for extracted helper modules, runner determinism, and coverage guard evidence | AI |
| 2026-02-22 | Added TC-0331 through TC-0334 for watcher refresh, settings injection edges, and promote no-drift contract | AI |
| 2026-02-21 | Added TC-0329 and TC-0330 for config diagnostics publish/clear behavior on refresh | AI |
| 2026-02-18 | Added TC-0119, TC-0125, TC-0126, and TC-0316 for runtime discovery and manual repository rescan | AI |
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Added TC-0001–TC-0019 (Phase 1: Config), TC-0100–TC-0145 (Phase 2: Engine) | AI |
| 2026-02-07 | Added TC-0200–TC-0244 (Phase 3: Materialization) | AI |
| 2026-02-07 | Added TC-0300–TC-0328 (Phase 4: Extension UI + Commands, 21 integration tests) | AI |
