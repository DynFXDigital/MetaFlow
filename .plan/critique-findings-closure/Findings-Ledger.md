# Critique Findings Ledger

> Baseline ledger produced 2026-02-23 by verifying each finding from the combined critique report against current workspace state.

## Findings

### F-001 — FTR test totals internally inconsistent [C2]

| Field | Value |
|---|---|
| Source Reports | Opus, Sonnet, GPT (all three) |
| Area | Docs |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 2 |

**Current Evidence:**

- `doc/ftr/FTR-metaflow-ext.md` Summary table says **Automated Pass: 177**.
- Rationale says "173 unit + 43 integration" which sums to **216**.
- Individual TP result counts in the Results table sum to **174** (19+8+10+13+7+7+13+6+6+5+8+6+6+6+9+4+4+37).
- Three different totals in one document; none reconcile.

**Verified Count Sources (2026-02-23):**

- Extension unit tests (`npm run test:unit`): **173 passing**
- Extension integration tests (RUN-005): **43 passing**
- Engine tests (`npm -w @metaflow/engine test`): **56 passing**
- CLI tests (`npm -w @metaflow/cli test`): **56 passing**

---

### F-002 — Stale AGENTS/CHANGELOG operational counts [C2]

| Field | Value |
|---|---|
| Source Reports | Opus, Sonnet, GPT (all three) |
| Area | Process |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 2 |

**Current Evidence:**

| Claim Source | Unit | Integration | Engine | CLI | Total |
|---|---:|---:|---:|---:|---:|
| `AGENTS.md` | 111 | 21 | 46 | 56 | 213 |
| `src/CHANGELOG.md` | 111 | 21 | — | — | 132 |
| Actual (2026-02-23) | 173 | 43 | 56 | 56 | 328 |

---

### F-003 — Synchronous file I/O on extension host command paths [C2]

| Field | Value |
|---|---|
| Source Reports | Sonnet, GPT (Opus partial) |
| Area | Code |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 4 |

**Current Evidence (commandHandlers.ts):**

| Line | Call | Context |
|---:|---|---|
| 166 | `fs.writeFileSync` | `persistConfig()` — writes full config as `JSON.stringify` |
| 300 | `fs.existsSync` | `initConfig` / `addRepoSource` — checks existing config |
| 519 | `fs.readFileSync` | `switchProfile` — reads config for text replacement |
| 531 | `fs.writeFileSync` | `switchProfile` — writes updated config |
| 807 | `fs.unlinkSync` | `removeRepoSource` — deletes config when last repo removed |

---

### F-004 — Readiness artifacts disagree on open high-risk gaps [C2]

| Field | Value |
|---|---|
| Source Reports | GPT |
| Area | Docs |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 2 |

**Current Evidence:**

- `FTR-metaflow-ext.md`: Decision = **Ready**; "No unresolved high-risk automated gaps remain."
- `FTP-metaflow-ext-functional-gap-closure.md`: High-risk gaps = **7 (target 0) → Fail**; REQ coverage = **46/49 → Fail**.
- Official artifacts give contradictory readiness signals.

**Resolution Note:** FTR is the evidence-of-record for release decisions. FTP is an operational gap-closure plan. The divergence still requires reconciliation: either FTP exit criteria and gap status must be updated to align, or FTR readiness must be annotated with the FTP residual gaps as accepted risk.

---

### F-005 — CI/release workflow test gate omits engine+CLI suites [C2]

| Field | Value |
|---|---|
| Source Reports | Opus |
| Area | Process |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 3 |

**Current Evidence:**

| Workflow | Test command | Tests run | Tests omitted |
|---|---|---|---|
| `ci.yml` | `npm run test:unit` | Extension unit (173) | Engine (56), CLI (56), Integration (43) |
| `release.yml` | `npm run test:unit` | Extension unit (173) | Engine (56), CLI (56), Integration (43) |

- Root `npm test` (which runs engine+CLI+extension unit = 285) is **not** used in either workflow.
- Integration tests (43) require Extension Host and are not gated in any workflow.

---

### F-006 — Missing safety requirement traceability for REQ-060x [C2]

| Field | Value |
|---|---|
| Source Reports | Opus |
| Area | Tests |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 2 (traceability docs) + Phase 4 (executable tests) |

**Current Evidence:**

- `SRS-metaflow-ext.md` defines REQ-0600 through REQ-0603 (Deterministic output, No auto-commit, No secret access, Path traversal prevention) — all P1 priority.
- `TCS-metaflow-ext.md`: **zero** TC entries reference any REQ-060x ID (grep verified).
- `FTP-metaflow-ext-functional-gap-closure.md` AREA-006: coverage rated **Weak**; GAP-006 is **Critical / Open**.

---

### F-007 — JSONC comment-loss risk in config write path [C3]

| Field | Value |
|---|---|
| Source Reports | Sonnet |
| Area | Code |
| Status | **Confirmed** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 4 |

**Current Evidence:**

- `persistConfig()` (line 166) serializes with `JSON.stringify(config, null, 2)` — destroys all JSONC comments.
- `switchProfile` (lines 519–531) uses regex string replacement on raw file content — preserves surrounding comments but is fragile and not JSONC-aware.
- The extension does not use `jsonc-parser`'s `modify()` + `applyEdits()` for config mutations despite importing `jsonc-parser` for reads.

---

### F-008 — Integration status test has weak oracle [C3]

| Field | Value |
|---|---|
| Source Reports | GPT |
| Area | Tests |
| Status | **Confirmed** (already tracked) |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 2 (already in FTP gap plan) |

**Current Evidence:**

- Already captured in FTP as GAP-001 (TC-0314, "Weak oracle") and GAP-002 (TC-0315, "Weak oracle").
- Tests validate no-throw behavior without asserting output semantics.
- No new remediation needed beyond existing FTP plan.

---

### F-009 — viewContainer/title proposed API menu contribution [C4]

| Field | Value |
|---|---|
| Source Reports | GPT only |
| Area | Packaging |
| Status | **Needs Follow-up** |
| Owner | MetaFlow Maintainers |
| Target Phase | Phase 5 |

**Current Evidence:**

- `src/package.json` lines 164–168 use `viewContainer/title` menu contribution point.
- Extension targets VS Code `^1.80.0`.
- `viewContainer/title` was stabilized in VS Code 1.64 (January 2022), which predates the engine minimum — likely a **false positive**.
- No clean `vsce package` warning check has been performed to confirm.
- Single-source finding; retain for verification in Phase 5.

---

## Summary

| Finding | Severity | Status | Closure |
|---|---|---|---|
| F-001: FTR arithmetic mismatch | C2 | **Closed** | Summary corrected to 182; rationale rewritten (Phase 2+4) |
| F-002: Stale AGENTS/CHANGELOG counts | C2 | **Closed** | AGENTS.md updated to 181/43/56/293 (Phase 2+4) |
| F-003: Sync I/O on command paths | C2 | **Closed** | 4/5 sync calls → fs/promises; existsSync retained with rationale (Phase 4) |
| F-004: FTR vs FTP readiness divergence | C2 | **Closed** | Authority model documented; FTP GAP-006 closed (Phase 2+4) |
| F-005: CI/release gate incomplete | C2 | **Closed** | Both workflows upgraded to `npm test` (293 tests) (Phase 3) |
| F-006: Missing REQ-060x traceability | C2 | **Closed** | TC-0600–TC-0603 defined, TP-A019 created, 8 automated tests passing (Phase 2+4) |
| F-007: JSONC comment-loss risk | C3 | **Closed** | persistConfig/switchProfile use jsonc-parser modify+applyEdits (Phase 4) |
| F-008: Weak test oracle (status) | C3 | **Accepted** | Pre-existing in FTP (GAP-001/002); not in scope for this plan |
| F-009: viewContainer/title warning | C4 | **Rejected** | False positive: viewContainer/title stabilized in VS Code 1.64; extension targets ^1.80.0 |

**Closed:** 7 / 9
**Accepted (pre-existing):** 1 / 9
**Rejected (false positive):** 1 / 9
