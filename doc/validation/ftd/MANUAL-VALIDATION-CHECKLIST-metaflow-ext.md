# MetaFlow Manual Validation Checklist (Non-E2E Focus)

## Purpose

Use this checklist for validation items that are hard to reliably automate in extension-host E2E tests (human judgment, UX clarity, interactive VS Code behavior, and local-environment differences).

Related docs:
- `doc/validation/srs/VSRS-metaflow-ext.md`
- `doc/validation/tcs/VTC-metaflow-ext.md`
- `doc/validation/ftd/VTP-metaflow-ext.md`
- `doc/validation/ftr/VTR-metaflow-ext.md`

## Run Metadata

- [ ] Date recorded: __________
- [ ] Validator: __________
- [ ] MetaFlow commit / branch: __________
- [ ] VS Code version: __________
- [ ] OS: __________
- [ ] Fixture repo/path (DFX clone): __________

## Preconditions

- [ ] Workspace contains valid `.metaflow/config.jsonc` that points to DFX-AI-Metadata.
- [ ] Extension is installed/enabled.
- [ ] At least 2 profiles exist (for profile-switch checks).
- [ ] You can open VS Code views: Activity Bar, Output, Explorer, Settings JSON.

Evidence guidance:
- Use `doc/validation/RUNBOOK-agent-driven-manual-validation.md` for agent/operator protocol.
- Use `doc/validation/EVIDENCE-TEMPLATE-manual-agent-runs.md` for standardized evidence capture.

---

## 1) Activation UX & Discoverability (manual judgment)

- [ ] MetaFlow Activity Bar icon is visible and understandable.
- [ ] MetaFlow panel opens without confusion or layout issues.
- [ ] Tree views (Config/Profiles/Layers/Files) are populated and readable.
- [ ] Status bar text is understandable (profile + file count not ambiguous).
- [ ] Output channel shows useful startup context (not noisy, no unexplained errors).
- [ ] If activation fails, the error messaging tells me what to do next.

Evidence:
- [ ] Screenshot: Activity Bar + MetaFlow panel
- [ ] Screenshot: status bar
- [ ] Output snippet captured

---

## 2) Command Experience & Feedback Quality (manual judgment)

- [ ] `MetaFlow: Apply` shows progress and completion feedback that a user can understand.
- [ ] `MetaFlow: Clean` confirmation wording is clear about what will be removed.
- [ ] `MetaFlow: Switch Profile` picker labels are understandable (no internal jargon).
- [ ] `MetaFlow: Promote` messaging distinguishes normal vs drift conditions clearly.
- [ ] Notifications do not disappear too quickly for normal reading.
- [ ] Errors include enough context (which file/layer/profile) for troubleshooting.

Evidence:
- [ ] Capture notifications/messages from each command
- [ ] Note any unclear wording

---

## 3) Visual Consistency After State Changes (manual judgment)

- [ ] After profile switch, status bar and Files TreeView update consistently.
- [ ] After Apply, file list and counts reflect actual workspace output.
- [ ] After Clean, views no longer imply managed files still exist.
- [ ] No stale UI artifacts after running commands repeatedly.
- [ ] Refresh/reopen window preserves expected state presentation.

Evidence:
- [ ] Before/after screenshots for profile switch
- [ ] Before/after screenshots for apply/clean

---

## 4) Drift Workflow Usability (manual judgment)

- [ ] Drift warning is noticeable but not alarmist.
- [ ] Drifted file identification is specific enough to act on quickly.
- [ ] `Apply` skip behavior for drifted files is explained in plain language.
- [ ] Promote output helps user decide whether to reconcile or keep local edits.
- [ ] No silent data loss risk is observed in drift scenarios.

Evidence:
- [ ] Output snippet showing drift detection
- [ ] Output snippet showing apply skip behavior

---

## 5) Settings Injection Safety & Clarity (manual judgment)

- [ ] `.vscode/settings.json` edits are minimal and targeted.
- [ ] Injected Copilot paths are understandable and clearly attributable to MetaFlow.
- [ ] Existing unrelated settings remain untouched.
- [ ] Re-running Apply does not create noisy/duplicated settings entries.
- [ ] Clean behavior for settings is predictable and clearly communicated.

Evidence:
- [ ] settings.json before/after excerpt

---

## 6) Edge UX Cases (manual judgment)

- [ ] Invalid/missing config yields actionable errors (not stack traces only).
- [ ] Read-only or permission-denied files produce clear guidance.
- [ ] Large file sets remain understandable in the UI (no overwhelming noise).
- [ ] Multi-root or unusual workspace layouts do not produce misleading UI state.
- [ ] Running commands twice in quick succession does not leave confusing status.

Evidence:
- [ ] Brief notes per edge case tested

---

## 7) Final Sign-off

- [ ] All critical manual UX checks passed.
- [ ] Any failures captured with repro steps and evidence.
- [ ] Follow-up issues filed for all failed checklist items.
- [ ] Validation result entered into `doc/validation/ftr/VTR-metaflow-ext.md`.

---

## 8) Runtime Discovery and Manual Rescan

- [ ] With `metaflow.autoApply: true` and repo discovery enabled, add a new layer directory containing known artifacts; verify refresh includes new layer content.
- [ ] Set `metaflow.autoApply: false`; add another new layer directory; verify regular refresh does not include that layer.
- [ ] Click the inline refresh icon on the repository row in Config view; verify discovery reruns and new layer becomes available.
- [ ] Confirm explicit `layerSources` order remains stable and discovered layers append without duplicating explicit entries.
- [ ] Confirm `discover.exclude` paths are skipped during discovery.

Evidence:
- [ ] Output snippet showing rescan log line
- [ ] Before/after screenshot of Layers tree view

## Failure Log (fill as needed)

- [ ] Item ID / Section: __________
  - Expected: __________
  - Actual: __________
  - Repro Steps: __________
  - Evidence link/path: __________
  - Issue link: __________

- [ ] Item ID / Section: __________
  - Expected: __________
  - Actual: __________
  - Repro Steps: __________
  - Evidence link/path: __________
  - Issue link: __________
