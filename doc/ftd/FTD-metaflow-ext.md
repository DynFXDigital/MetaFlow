# FTD — Functional Test Document

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| FTD-metaflow-ext | MetaFlow VS Code Extension | TBD | Active |

| Last Updated | Related TCS | Notes |
|---|---|---|
| 2026-02-07 | TCS-metaflow-ext | Complete through Phase 4 |

## Test Environment

- **Build/config**: VS Code ≥1.80.0 with MetaFlow extension installed (VSIX); TypeScript strict mode
- **Hardware**: Standard development workstation
- **Dependencies**: Node.js ≥18; local clone of DFX-AI-Metadata (for validation tests); test-workspace fixture

## Execution Mapping

Every `TC-*` must have a runnable procedure (manual and/or automated).

### Automated Procedures

| TP-ID | Title | Type | How to run | Evidence / Artifacts | Notes |
|---|---|---|---|---|---|
| TP-A001 | Config discovery + loading | Automated | `npm run test:unit` | Mocha output | TC-0001–TC-0007 |
| TP-A002 | Config path resolution | Automated | `npm run test:unit` | Mocha output | TC-0011–TC-0016 |
| TP-A003 | Glob matching | Automated | `npm run test:unit` | Mocha output | TC-0100–TC-0109 |
| TP-A004 | Overlay engine resolution | Automated | `npm run test:unit` | Mocha output | TC-0110–TC-0116 |
| TP-A005 | Filter engine | Automated | `npm run test:unit` | Mocha output | TC-0120–TC-0123 |
| TP-A006 | Profile engine | Automated | `npm run test:unit` | Mocha output | TC-0130–TC-0133 |
| TP-A007 | Classifier | Automated | `npm run test:unit` | Mocha output | TC-0140–TC-0145 |
| TP-A008 | Provenance header | Automated | `npm run test:unit` | Mocha output | TC-0200–TC-0205 |
| TP-A009 | Managed state | Automated | `npm run test:unit` | Mocha output | TC-0210–TC-0215 |
| TP-A010 | Drift detector | Automated | `npm run test:unit` | Mocha output | TC-0220–TC-0224 |
| TP-A011 | Materializer | Automated | `npm run test:unit` | Mocha output | TC-0230–TC-0237 |
| TP-A012 | Settings injector | Automated | `npm run test:unit` | Mocha output | TC-0240–TC-0244 |
| TP-A013 | Extension activation | Automated | `npm test` | Extension Host output | TC-0300–TC-0305 |
| TP-A014 | Command execution | Automated | `npm test` | Extension Host output | TC-0310–TC-0315 |
| TP-A015 | TreeView providers | Automated | `npm test` | Extension Host output | TC-0320–TC-0328 |
| TP-A016 | Runtime discovery + repository rescan | Automated | `npm -w @metaflow/engine test` and `npm test` | Mocha + Extension Host output | TC-0119, TC-0125, TC-0126, TC-0316 |

### Manual Procedures

| TP-ID | Title | Type | How to run | Evidence / Artifacts | Notes |
|---|---|---|---|---|---|
| TP-M001 | Extension activation with valid config | Manual | See procedure below | Screenshot | Validates activation |
| TP-M002 | Extension graceful degradation | Manual | See procedure below | Screenshot | No config scenario |
| TP-M003 | TreeView: Profiles display + switch | Manual | See procedure below | Screenshot | Profile switching |
| TP-M004 | TreeView: Layers display + toggle | Manual | See procedure below | Screenshot | Layer toggle |
| TP-M005 | TreeView: Effective files grouping | Manual | See procedure below | Screenshot | Classification groups |
| TP-M006 | Status bar display states | Manual | See procedure below | Screenshot | All 4 states |
| TP-M007 | Apply command end-to-end | Manual | See procedure below | Output + file listing | Full apply flow |
| TP-M008 | Clean command end-to-end | Manual | See procedure below | Output + file listing | Full clean flow |
| TP-M009 | Preview command output | Manual | See procedure below | Output channel text | Preview content |
| TP-M010 | Promote detection of drift | Manual | See procedure below | Output channel text | Drift detection |
| TP-M011 | Config diagnostics in Problems panel | Manual | See procedure below | Screenshot | Diagnostics display |
| TP-M012 | Init config scaffolding | Manual | See procedure below | File content | Config scaffold |

---

### TP-M001 — Extension Activation with Valid Config

**Preconditions**: Workspace contains `.metaflow.json` with valid config; metadata repo clone exists at configured `localPath`.

**Steps**:
1. Open workspace in VS Code with MetaFlow extension installed.
2. Observe Activity Bar for MetaFlow icon.
3. Open MetaFlow panel; verify four TreeViews are visible.
4. Check status bar shows `MetaFlow: <profile> (<N> files)`.

**Expected**: Extension activates automatically; all views populated; status bar shows profile and file count.

**Pass/Fail**: Extension active, views populated, status bar correct.

---

### TP-M002 — Extension Graceful Degradation

**Preconditions**: Workspace has no `.metaflow.json`.

**Steps**:
1. Open workspace without config file.
2. Run `MetaFlow: Init Config` from command palette.
3. Verify `.metaflow.json` created and opened in editor.
4. Verify TreeViews show welcome content.

**Expected**: No errors on activation; init command creates valid config scaffold.

---

### TP-M003 — TreeView: Profiles Display + Switch

**Preconditions**: Config with 2+ profiles loaded.

**Steps**:
1. Open MetaFlow panel, Profiles TreeView.
2. Verify all profiles listed with active marker.
3. Click a different profile.
4. Verify active marker moves; status bar updates.

**Expected**: Profile list accurate; switching updates all views.

---

### TP-M004 — TreeView: Layers Display + Toggle

**Preconditions**: Multi-repo config with layerSources.

**Steps**:
1. Open Layers TreeView.
2. Verify layers listed in order with enabled/disabled icons.
3. Click a layer to toggle.
4. Verify icon changes; effective files update.

**Expected**: Layer toggle reflected in views.

---

### TP-M005 — TreeView: Effective Files Grouping

**Preconditions**: Config loaded with mixed injection modes.

**Steps**:
1. Open Files TreeView.
2. Verify two groups: "Settings" and "Materialized".
3. Expand each group; verify files show source layer.

**Expected**: Files correctly classified and grouped.

---

### TP-M006 — Status Bar Display States

**Preconditions**: Extension active.

**Steps**:
1. Normal state: verify profile + file count displayed.
2. Break config (invalid JSON): verify error state (warning icon).
3. Fix config: verify returns to normal.
4. During Apply: verify loading spinner.

**Expected**: All 4 states render correctly.

---

### TP-M007 — Apply Command End-to-End

**Preconditions**: Valid config; metadata repo available.

**Steps**:
1. Run `MetaFlow: Apply`.
2. Observe progress notification.
3. Check `.github/` directory for materialized files.
4. Verify provenance headers in written files.
5. Verify `.ai/.sync-state/overlay_managed.json` updated.

**Expected**: Files written with provenance; managed state tracks files.

---

### TP-M008 — Clean Command End-to-End

**Preconditions**: Apply has been run.

**Steps**:
1. Run `MetaFlow: Clean`.
2. Confirm when prompted.
3. Verify managed files removed from `.github/`.
4. Verify managed state cleared.

**Expected**: Managed files removed; drifted files skipped with warning.

---

### TP-M009 — Preview Command Output

**Preconditions**: Config loaded.

**Steps**:
1. Run `MetaFlow: Preview`.
2. Check MetaFlow output channel.
3. Verify pending changes listed with actions (write/remove/skip).

**Expected**: Preview shows expected changes without modifying files.

---

### TP-M010 — Promote Detection of Drift

**Preconditions**: Apply has been run; manually edit a managed file.

**Steps**:
1. Edit a file in `.github/` that was written by Apply.
2. Run `MetaFlow: Promote`.
3. Check output channel for drift report.

**Expected**: Drifted file detected and reported.

---

### TP-M011 — Config Diagnostics in Problems Panel

**Preconditions**: Config file with validation errors.

**Steps**:
1. Create `.metaflow.json` with missing required field.
2. Run `MetaFlow: Refresh`.
3. Open Problems panel.
4. Verify MetaFlow diagnostics appear with error messages and locations.

**Expected**: Diagnostics shown in Problems panel with correct source.

---

### TP-M012 — Init Config Scaffolding

**Preconditions**: No existing `.metaflow.json`.

**Steps**:
1. Run `MetaFlow: Init Config`.
2. Verify `.metaflow.json` created with JSONC template.
3. Verify file opens in editor.
4. Verify template contains all required fields.

**Expected**: Valid scaffold; file opens for editing.

---

### Traceability Matrix (TP → TC)

| TP-ID | TC-IDs |
|---|---|
| TP-A001 | TC-0001–TC-0007 |
| TP-A002 | TC-0011–TC-0016 |
| TP-A003 | TC-0100–TC-0109 |
| TP-A004 | TC-0110–TC-0116 |
| TP-A005 | TC-0120–TC-0123 |
| TP-A006 | TC-0130–TC-0133 |
| TP-A007 | TC-0140–TC-0145 |
| TP-A008 | TC-0200–TC-0205 |
| TP-A009 | TC-0210–TC-0215 |
| TP-A010 | TC-0220–TC-0224 |
| TP-A011 | TC-0230–TC-0237 |
| TP-A012 | TC-0240–TC-0244 |
| TP-A013 | TC-0300–TC-0305 |
| TP-A014 | TC-0310–TC-0315 |
| TP-A015 | TC-0320–TC-0328 |
| TP-A016 | TC-0119, TC-0125, TC-0126, TC-0316 |
| TP-M001 | TC-0300, TC-0301 |
| TP-M002 | TC-0303 |
| TP-M003 | TC-0323, TC-0324 |
| TP-M004 | TC-0326 |
| TP-M005 | TC-0327, TC-0328 |
| TP-M006 | TC-0307 |
| TP-M007 | TC-0312 |
| TP-M008 | TC-0313 |
| TP-M009 | TC-0305 |
| TP-M010 | TC-0315 |
| TP-M011 | TC-0001 |
| TP-M012 | TC-0303 |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| TC covered by ≥1 TP | 68 | 68 | All TCs covered by automated or manual procedures. |

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-18 | Added TP-A016 and traceability entries for runtime discovery and repository rescan | AI |
| 2026-02-07 | Initial skeleton | AI |
| 2026-02-07 | Complete FTD with 15 automated + 12 manual procedures | AI |
