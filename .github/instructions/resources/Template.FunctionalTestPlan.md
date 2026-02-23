# Functional Test Plan (Gap Closure)

## Document Header

| Doc ID | Scope | Related TCS | Owner | Status |
|---|---|---|---|---|
| FTP-<PROJECT-or-FEATURE> | <scope> | TCS-... | <name/team> | Draft/Active/Closed |

| Last Updated | Planned Window | Notes |
|---|---|---|
| YYYY-MM-DD | YYYY-MM-DD to YYYY-MM-DD | <optional> |

## Goal

- Define the minimum functional test set required to close known coverage gaps and lock down release behavior.

## Functional Surface Inventory

| Area ID | Workflow / Behavior | REQ-ID(s) | Risk | Current Coverage | Notes |
|---|---|---|---|---|---|
| AREA-001 | <workflow> | REQ-xxxx | Critical | Partial | <gap summary> |

## Entry / Exit Criteria

| Phase | Entry Criteria | Exit Criteria |
|---|---|---|
| Smoke | <conditions> | <conditions> |
| Regression | <conditions> | <conditions> |
| Release Candidate | <conditions> | <conditions> |

## Execution Procedures

| TP-ID | Title | Type | Priority | How to Run | Evidence |
|---|---|---|---|---|---|
| TP-0001 | <name> | Manual or Automated | Critical | <command/steps> | <artifact path> |

## Traceability Matrix (TP -> TC)

| TP-ID | TC-0001 | TC-0002 |
|---|---|---|
| TP-0001 | X |  |

## Open Gap Backlog

| Gap ID | TC-ID | Gap Type | Risk | Owner | Target Date | Closure Action | Status |
|---|---|---|---|---|---|---|---|
| GAP-001 | TC-0002 | Missing automation | High | <owner> | YYYY-MM-DD | Add integration test for <behavior> | Open |

## Coverage Gate Summary

| Gate | Rule | Current | Target | Status |
|---|---|---:|---:|---|
| REQ coverage | Enforced REQ has >=1 TC | <n> | <n> | Pass or Fail |
| TC procedure coverage | Each TC has >=1 TP | <n> | <n> | Pass or Fail |
| High-risk gaps | Unclosed high-risk gaps | <n> | 0 | Pass or Fail |

## Change Log

| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial draft | <name> |
