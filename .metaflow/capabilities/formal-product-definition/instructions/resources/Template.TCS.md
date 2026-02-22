# TCS — Test Case Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| TCS-<PROJECT-or-SUBSYSTEM-or-FEATURE-or-CAPABILITY> | Top-level \| Subsystem: `doc/subsystems/<SubsystemName>/` \| Feature: `doc/features/<FeatureName>/` \| Capability: `doc/capabilities/<CapabilityName>/` | <name/team> | Draft \| Active \| Deprecated |

| Last Updated | Related SRS | Notes |
|---|---|---|
| YYYY-MM-DD | SRS-… | <optional> |

## Test Strategy (brief)

- **Levels**: unit / integration / functional
- **Targets**: <bullets>
- **Environments**: <bullets>

## Test Cases (required)

| TC-ID | Title | Preconditions | Steps (brief) | Expected Result | Type | Priority | Status | Location / Implementation | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TC-0001 | Toggle persists | App installed | Set toggle ON → restart → verify ON | Toggle remains ON and capture behavior enabled | Functional | P1 | Draft | Manual |  |
| TC-0002 | Naming deterministic | Capture enabled | Trigger 2 captures → inspect names | Names follow scheme; no collision | Functional | P2 | Draft | Automated: <test name/command> |  |

## Traceability matrix (TC → REQ)

Use a matrix for primary traceability; keep the per-TC narrative in the table above.

| TC-ID | REQ-0001 | REQ-0002 |
|---|---|---|
| TC-0001 | X |  |
| TC-0002 |  | X |

## Traceability (Gap Analysis)

| Check | Expected | Current | Notes |
|---|---:|---:|---|
| TC maps to ≥1 REQ | <count TC> | <n> | No all-empty rows in the TC→REQ matrix. |
| Enforced REQ covered by ≥1 TC | <count enforced REQ> | <n> | Compare against SRS enforcement (anything not `Future`). |

## Change Log

| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial draft | <name> |
