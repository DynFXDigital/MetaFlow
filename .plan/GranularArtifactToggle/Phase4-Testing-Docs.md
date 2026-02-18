# Phase 4 – Testing, Polish & Documentation

## Objective

Close the loop with integration tests, manual validation checklist entries, and
traceability document updates.  Also covers the tooltip indicator stretch goal.

---

## 4.1  Integration tests

**File:** `src/src/test/integration/treeViews.test.ts` (existing file, extend)

| ID | Scenario | How verified |
|---|---|---|
| IT-GAT-01 | Effective Files view renders checkboxes on file nodes | `checkboxState` not undefined on `FileItem` tree items |
| IT-GAT-02 | Executing `toggleArtifactDisabled` with suppress=true writes glob to config | Read config after command; assert `filters.disabled` contains glob |
| IT-GAT-03 | Executing `toggleArtifactDisabled` with suppress=false removes glob | Read config; assert glob absent |
| IT-GAT-04 | Config reload after toggle: suppressed file absent from `effectiveFiles` | `state.effectiveFiles` does not include the suppressed path |
| IT-GAT-05 | `resetDisabledArtifacts` clears `filters.disabled` | Config has no `disabled` field after reset |
| IT-GAT-06 | Toggle on config without existing `filters` key | Config gains `filters.disabled` without error |
| IT-GAT-07 | Round-trip: suppress, reload, unsuppress, reload | Effective file count restored to original |

---

## 4.2  Tooltip indicator (stretch goal)

The status bar (`src/src/views/statusBar.ts`) can show a suppression count badge:

```
MetaFlow ✓   2 suppressed
```

Show only when `filters.disabled.length > 0`.  Clicking navigates to the Effective
Files view.

This is low-priority; implement after core toggle is stable.

---

## 4.3  Config test-workspace fixtures

Add a fixture to `src/test-workspace/`:

```
src/test-workspace/
  disabled-artifacts/
    ai-sync.json          ← config with filters.disabled pre-populated
```

This allows integration tests to assert against a known suppression state without
requiring a toggle command execution.

---

## 4.4  SRS update

**File:** `doc/srs/SRS-metaflow-ext.md`

Add requirement(s) under the filtering / profile section.  Suggested IDs:

- `REQ-FILTER-DISABLED-01` – The system shall accept a `filters.disabled` array
  containing glob patterns that are applied as additional exclusions, treated
  identically to `filters.exclude` at runtime.
- `REQ-FILTER-DISABLED-02` – The Effective Files view shall render a checkbox on
  each file and folder node reflecting whether the artifact is currently suppressed.
- `REQ-FILTER-DISABLED-03` – Checking or unchecking a node shall write a
  corresponding glob to or remove it from `filters.disabled` in `config.jsonc`
  without corrupting comments or formatting.
- `REQ-FILTER-DISABLED-04` – The system shall provide a reset command that clears
  all entries from `filters.disabled`.

---

## 4.5  SDD update

**File:** `doc/sdd/SDD-metaflow-ext.md`

Add design elements referencing the new components:

| DES ID | Component | Maps to REQ |
|---|---|---|
| DES-FILTER-DISABLED-01 | `FilterConfig.disabled` schema field | REQ-FILTER-DISABLED-01 |
| DES-FILTER-DISABLED-02 | `applyFilters` disabled merge | REQ-FILTER-DISABLED-01 |
| DES-FILTER-DISABLED-03 | `ConfigWriter` module | REQ-FILTER-DISABLED-03 |
| DES-FILTER-DISABLED-04 | `FilesTreeView` checkbox state | REQ-FILTER-DISABLED-02 |
| DES-FILTER-DISABLED-05 | `toggleArtifactDisabled` command | REQ-FILTER-DISABLED-02/03 |
| DES-FILTER-DISABLED-06 | `resetDisabledArtifacts` command | REQ-FILTER-DISABLED-04 |

---

## 4.6  TCS update

**File:** `doc/tcs/TCS-metaflow-ext.md`

Add TC entries mapping to the new REQ IDs, covering the unit and integration tests
from Phases 1–3 and this phase.

---

## 4.7  FTD / FTR update

**File:** `doc/ftd/FTD-metaflow-ext.md`

Add manual test procedures for:

- TP-GAT-01: Toggle an artifact-type folder off and verify it disappears.
- TP-GAT-02: Toggle an individual file off and verify it disappears.
- TP-GAT-03: Verify `config.jsonc` is correctly mutated (comments preserved).
- TP-GAT-04: Reset suppressed artifacts and verify all items reappear.
- TP-GAT-05: Persist across reload — restart extension host, verify suppression
  survived.

**File:** `doc/ftr/FTR-metaflow-ext.md`

Add result entries for each TP-GAT-* once executed.

---

## 4.8  Validation checklist

**File:** `doc/validation/ftd/MANUAL-VALIDATION-CHECKLIST-metaflow-ext.md`

Add checklist section: **Granular Artifact Toggle**

- [ ] Folder-level toggle: suppress `instructions/` → tree updates, config updated.
- [ ] Folder-level toggle: re-enable `instructions/` → items restored.
- [ ] File-level toggle: suppress a single `.md` file.
- [ ] Skill subdirectory toggle: suppress a named skill folder.
- [ ] Reset command clears all.
- [ ] Config comments intact after toggle.
- [ ] Watcher re-entrancy: no stale state or extra reloads observed.

---

## 4.9  Final verification

```powershell
# Engine
npm -w @metaflow/engine test

# Extension unit tests
cd src ; npm run test:unit

# Integration tests
cd src ; npm test

# Lint
cd src ; npm run lint
```

All suites green.  Lint clean.

---

## Exit criteria

- [ ] All IT-GAT-* integration tests pass.
- [ ] FTD manual procedures documented.
- [ ] FTR updated with executed results.
- [ ] SRS, SDD, TCS doc sections added.
- [ ] Validation checklist section added.
- [ ] Status bar suppression count showing (or explicitly deferred to backlog).
- [ ] Full test suite green.
