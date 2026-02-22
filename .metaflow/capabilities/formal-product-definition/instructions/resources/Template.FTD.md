# FTD — Functional Test Document

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| FTD-<PROJECT-or-SUBSYSTEM-or-FEATURE-or-CAPABILITY> | Top-level \| Subsystem: `doc/subsystems/<SubsystemName>/` \| Feature: `doc/features/<FeatureName>/` \| Capability: `doc/capabilities/<CapabilityName>/` | <name/team> | Draft \| Active \| Deprecated |

| Last Updated | Related TCS | Notes |
|---|---|---|
| YYYY-MM-DD | TCS-… | <optional> |

## Test Environment

- Build/config: <e.g., FnaWinSteamDebug, x86>
- Hardware: <bullets>
- Dependencies: <bullets>

## Execution Mapping (required)

Every `TC-*` must have a runnable procedure (manual and/or automated).

### Procedures (recommended)

Define stable `TP-####` procedure IDs so multiple `TC-*` can reference the same execution path.

| TP-ID | Title | Type | How to run | Evidence / Artifacts | Notes |
|---|---|---|---|---|---|
| TP-0001 | Settings toggle smoke | Manual | Open Settings → Toggle capture ON → restart → verify ON | Screenshot of settings screen |  |
| TP-0002 | Naming automation | Automated | <command or test name> | Log file; output directory listing |  |

### Traceability matrix (TP → TC)

| TP-ID | TC-0001 | TC-0002 |
|---|---|---|
| TP-0001 | X |  |
| TP-0002 |  | X |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| TC covered by ≥1 TP | <count TC> | <n> | No all-empty columns in the TP→TC matrix. |

## Change Log

| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial draft | <name> |
