# VTP — Validation Test Procedures

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| VTP-metaflow-ext | MetaFlow VS Code Extension — Validation | TBD | Active |

| Last Updated | Related VTC | Notes |
|---|---|---|
| 2026-02-07 | VTC-metaflow-ext | Complete — 6 validation procedures |

## Test Environment

- **Build/config**: VS Code ≥1.80.0 with MetaFlow extension (VSIX)
- **Fixture**: DFX-AI-Metadata local clone with hierarchical layers
- **Hardware**: Standard development workstation

## Validation Procedures

| VTP-ID | Title | Type | How to run | Evidence / Artifacts | Notes |
|---|---|---|---|---|---|
| VTP-0001 | Activation with DFX config | Manual | See procedure below | Screenshot of sidebar + status bar | VTC-0001 |
| VTP-0002 | Apply produces expected files | Manual | See procedure below | File listing + provenance header | VTC-0002 |
| VTP-0003 | Profile switching | Manual | See procedure below | Before/after TreeView screenshots | VTC-0003 |
| VTP-0004 | Clean removes managed files | Manual | See procedure below | File listing before/after | VTC-0004 |
| VTP-0005 | Drift detection | Manual | See procedure below | Output channel text | VTC-0005 |
| VTP-0006 | Settings injection | Manual | See procedure below | settings.json content | VTC-0006 |

---

### VTP-0001 — Activation with DFX Config

**Preconditions**: Workspace with `ai-sync.json` pointing to local DFX-AI-Metadata clone.

**Steps**:
1. Open workspace in VS Code.
2. Wait for MetaFlow extension to activate.
3. Verify MetaFlow icon in Activity Bar.
4. Open MetaFlow panel; verify Config, Profiles, Layers, and Files TreeViews populated.
5. Check status bar: should show profile + file count.
6. Open Output panel > MetaFlow: verify no ERROR entries.

**Expected**: Extension activates; all views show data from DFX-AI-Metadata layers.

---

### VTP-0002 — Apply Produces Expected Files

**Preconditions**: VTP-0001 passed.

**Steps**:
1. Run `MetaFlow: Apply` from command palette.
2. Wait for progress notification to complete.
3. Open `.github/` directory in file explorer.
4. Verify materialized files exist (agents, skills).
5. Open a materialized file; verify provenance header.
6. Open `.ai/.sync-state/overlay_managed.json`; verify file entries.

**Expected**: Files written with correct provenance headers; managed state tracks files.

---

### VTP-0003 — Profile Switching

**Preconditions**: VTP-0001 passed; config has 2+ profiles.

**Steps**:
1. Note current file count in status bar.
2. Run `MetaFlow: Switch Profile`.
3. Select a restrictive profile.
4. Observe status bar file count change.
5. Check Files TreeView — fewer files shown.
6. Run Apply again; verify only profile-enabled files materialized.

**Expected**: Profile switch changes effective file set.

---

### VTP-0004 — Clean Removes Managed Files

**Preconditions**: VTP-0002 passed (files applied).

**Steps**:
1. Run `MetaFlow: Clean`.
2. Confirm when prompted.
3. Check `.github/` — managed files removed.
4. Check `.ai/.sync-state/overlay_managed.json` — entries cleared.
5. Verify drifted files (if any) are NOT removed.

**Expected**: Clean removes in-sync files; drifted files preserved.

---

### VTP-0005 — Drift Detection

**Preconditions**: VTP-0002 passed.

**Steps**:
1. Manually edit a materialized file in `.github/`.
2. Run `MetaFlow: Promote`.
3. Check MetaFlow output channel.
4. Verify the edited file listed as drifted.
5. Run `MetaFlow: Apply` again; verify drifted file is skipped with warning.

**Expected**: Drift detected; apply skips drifted files.

---

### VTP-0006 — Settings Injection

**Preconditions**: VTP-0002 passed.

**Steps**:
1. After Apply, open `.vscode/settings.json`.
2. Verify `github.copilot.chat.codeGeneration.instructionFiles` contains paths.
3. Verify `github.copilot.chat.codeGeneration.promptFiles` contains paths (if prompts exist).

**Expected**: Settings contain correct paths to live-referenced artifact directories.

---

### Traceability Matrix (VTP → VTC)

| VTP-ID | VTC-ID |
|---|---|
| VTP-0001 | VTC-0001 |
| VTP-0002 | VTC-0002 |
| VTP-0003 | VTC-0003 |
| VTP-0004 | VTC-0004 |
| VTP-0005 | VTC-0005 |
| VTP-0006 | VTC-0006 |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| VTC covered by ≥1 VTP | 6 | 6 | All VTCs have procedures. |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Added VTP-0001–VTP-0006 with detailed procedures | AI |
