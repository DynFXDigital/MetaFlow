# UC — Use Case Document

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| UC-metaflow-ext | MetaFlow VS Code Extension | TBD | Draft |

| Last Updated | Related SRS | Notes |
|---|---|---|
| 2026-02-07 | SRS-metaflow-ext | Initial draft — Phase 0 |

## Overview

This document describes the primary use cases for the MetaFlow VS Code extension. Each use case maps to one or more requirements in the SRS.

---

## UC-01: Initialize MetaFlow Configuration

**Actor:** Developer  
**Goal:** Set up MetaFlow in a new repository.  
**Preconditions:** Workspace is open in VS Code; no `.metaflow.json` exists.  
**Related REQ:** REQ-0408, REQ-0302

### Main Flow

1. Developer invokes `MetaFlow: Initialize Configuration` from the command palette.
2. Extension creates a starter `.metaflow.json` at the workspace root with scaffold content (metadata repo placeholder, empty layers, default profile).
3. Extension activates fully and displays the sidebar with welcome guidance.
4. Developer edits `.metaflow.json` to configure their metadata repository path and layers.
5. Developer invokes `MetaFlow: Refresh` to validate and load the configuration.

### Alternate Flows

- **A1:** Config already exists — command is a no-op; developer is informed.
- **A2:** Config has validation errors — diagnostics appear in the Problems panel (REQ-0004).

### Postconditions

- `.metaflow.json` exists at workspace root.
- Extension is activated with sidebar views populated.

---

## UC-02: Preview Effective Overlay

**Actor:** Developer  
**Goal:** See what files would be materialized/settings-backed before making changes.  
**Preconditions:** Valid `.metaflow.json` exists; metadata repo is accessible.  
**Related REQ:** REQ-0209, REQ-0401

### Main Flow

1. Developer invokes `MetaFlow: Preview Overlay`.
2. Extension resolves the overlay (layers, filters, profile) without writing files.
3. Output channel displays the effective file list grouped by classification:
   - Settings-backed: files that will have settings injected.
   - Materialized: files that will be written to `.github/`.
4. Each file shows its source layer and pending action (add, update, skip, remove).

### Alternate Flows

- **A1:** No config found — extension shows "No configuration found" message.
- **A2:** Config has errors — diagnostics appear; preview is not generated.

### Postconditions

- No files created or modified on disk.
- Developer has full visibility into the effective overlay state.

---

## UC-03: Apply Overlay

**Actor:** Developer  
**Goal:** Materialize required files and inject settings for settings-backed artifacts.  
**Preconditions:** Valid config; metadata repo accessible; no unresolved config errors.  
**Related REQ:** REQ-0200, REQ-0201, REQ-0203, REQ-0206, REQ-0211, REQ-0402

### Main Flow

1. Developer invokes `MetaFlow: Apply Overlay`.
2. Extension shows a progress indicator.
3. Extension resolves overlay and classifies files.
4. For each materialized file:
   a. Check drift detector against managed state.
   b. If in-sync or new: write file to `.github/` with `_shared_` prefix and provenance header.
   c. If drifted: skip and emit warning.
5. Update managed state at `.ai/.sync-state/overlay_managed.json`.
6. Inject VS Code settings for settings-backed artifact directories.
7. Refresh all TreeViews and status bar.

### Alternate Flows

- **A1:** Drifted files detected — extension warns per file, skips them, continues with others (REQ-0206).
- **A2:** Metadata repo not found — error in output channel; apply aborted.

### Postconditions

- Materialized files exist in `.github/` with provenance.
- Managed state is up to date.
- Settings-backed paths are injected.

---

## UC-04: Clean Managed Files

**Actor:** Developer  
**Goal:** Remove all managed materialized files and injected settings.  
**Preconditions:** Managed state exists from a prior apply.  
**Related REQ:** REQ-0207, REQ-0208, REQ-0212, REQ-0403

### Main Flow

1. Developer invokes `MetaFlow: Clean Managed Files`.
2. Extension prompts for confirmation.
3. Extension reads managed state.
4. For each tracked file:
   a. If in-sync (hash matches): delete the file.
   b. If drifted: warn and skip.
5. Remove injected VS Code settings.
6. Clear managed state.
7. Refresh all TreeViews and status bar.

### Alternate Flows

- **A1:** User cancels confirmation — no-op.
- **A2:** Drifted files exist — warned files survive; user can handle manually (REQ-0208).
- **A3:** No managed state — nothing to clean; informational message.

### Postconditions

- In-sync managed files deleted.
- Injected settings removed.
- Managed state cleared (except entries for drifted files that survived).

---

## UC-05: Switch Active Profile

**Actor:** Developer  
**Goal:** Change the active profile to experiment with different metadata subsets.  
**Preconditions:** Config contains multiple profiles.  
**Related REQ:** REQ-0105, REQ-0405

### Main Flow

1. Developer invokes `MetaFlow: Switch Profile`.
2. Quick-pick displays all available profiles with the current one marked.
3. Developer selects a new profile.
4. Extension updates `activeProfile` in `.metaflow.json`.
5. Extension re-resolves overlay and refreshes all views.

### Alternate Flows

- **A1:** Developer selects the already-active profile — no-op.
- **A2:** Only one profile defined — quick-pick shows it; switch is a no-op.

### Postconditions

- `.metaflow.json` reflects the new active profile.
- TreeViews show the effective file set for the new profile.
- Status bar shows the new profile name.

---

## UC-06: Toggle a Layer

**Actor:** Developer  
**Goal:** Temporarily enable or disable a specific layer without editing config manually.  
**Preconditions:** Config contains multiple layers.  
**Related REQ:** REQ-0406, REQ-0304

### Main Flow

1. Developer clicks the checkbox next to a layer in the Layers TreeView.
2. Extension updates the layer's enabled state in config.
3. Extension re-resolves overlay and refreshes all views.

### Alternate Flows

- **A1:** Toggling the last enabled layer — warning that no layers will be active.

### Postconditions

- Config reflects the toggled layer state.
- Effective file set updated accordingly.

---

## UC-07: Detect Local Edits (Promote Awareness)

**Actor:** Developer  
**Goal:** Identify managed files that have been locally edited so they can be promoted upstream.  
**Preconditions:** Managed state exists; some managed files have been locally edited.  
**Related REQ:** REQ-0205, REQ-0409

### Main Flow

1. Developer invokes `MetaFlow: Promote Changes`.
2. Extension compares current file hashes against managed state.
3. Output channel displays a drift report listing:
   - File path.
   - Status (drifted / in-sync / missing).
   - Source layer and commit info from provenance.
4. Developer reviews the report and manually handles promotion (create branch, copy to metadata repo, open PR).

### Alternate Flows

- **A1:** No drifted files — report shows "All managed files in sync."
- **A2:** No managed state — "No managed state found. Run apply first."

### Postconditions

- No files modified (detection only in v1).
- Developer has actionable information for promotion.

---

## UC-08: Review Config/Layer State

**Actor:** Team Lead  
**Goal:** Understand the current config and layer state for audit or review.  
**Preconditions:** Extension is activated with valid config.  
**Related REQ:** REQ-0306, REQ-0404

### Main Flow

1. Team lead opens the MetaFlow sidebar.
2. Config TreeView displays metadata repo URL, commit, and injection modes.
3. Layers TreeView shows ordered layers with enabled/disabled state.
4. Files TreeView shows effective file count and grouping.
5. Optionally invokes `MetaFlow: Status` for a formatted output channel summary.

### Postconditions

- Full visibility into current overlay state.

---

## UC-09: Recover from Config Errors

**Actor:** Developer  
**Goal:** Fix configuration problems using diagnostics guidance.  
**Preconditions:** `.metaflow.json` exists but contains errors.  
**Related REQ:** REQ-0003, REQ-0004, REQ-0302

### Main Flow

1. Extension detects config errors during activation or refresh.
2. Diagnostics appear in the Problems panel with line/column positions.
3. Status bar shows error state.
4. Sidebar shows degraded state (welcome content or last-known-good views).
5. Developer fixes the config errors in the editor.
6. Developer invokes `MetaFlow: Refresh`.
7. Diagnostics clear; extension returns to normal operation.

### Alternate Flows

- **A1:** JSON syntax error — diagnostic points to exact parse error location.
- **A2:** Schema violation — diagnostic names the missing/invalid field.

### Postconditions

- Config is valid.
- Extension is fully operational.
- Diagnostics panel is clear.

---

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-07 | Initial draft — UC-01 through UC-09 | AI |
