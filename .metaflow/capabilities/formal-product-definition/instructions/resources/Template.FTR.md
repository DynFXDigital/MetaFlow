# FTR — Functional Test Results

## Document Header

This template assumes one FTR document per FTD document (append runs over time).

| Doc ID | Scope | Related FTD | Owner |
|---|---|---|---|
| FTR-<PROJECT-or-SUBSYSTEM-or-FEATURE-or-CAPABILITY> | Top-level \| Subsystem: `doc/subsystems/<SubsystemName>/` \| Feature: `doc/features/<FeatureName>/` \| Capability: `doc/capabilities/<CapabilityName>/` | FTD-… | <name/team> |

| Last Updated | Notes |
|---|---|
| YYYY-MM-DD | <optional> |

## Run

| Run ID | Executor | Date | Build/Commit | Environment |
|---|---|---|---|---|
| TR-YYYYMMDD-<nn> | <name/team> | YYYY-MM-DD | <sha or build identifier> | <brief> |

## Results (required)

| TC-ID | Result | Build/Commit | Evidence Link(s) | Notes | Issue Link |
|---|---|---|---|---|---|
| TC-0001 | Pass | <sha> | <link-to-screenshot-or-log> |  |  |
| TC-0002 | Fail | <sha> | <link-to-log> | Collision observed in naming | <issue-url-or-id> |

## Summary

| Metric | Value |
|---|---:|
| Pass | <n> |
| Fail | <n> |
| Skip | <n> |

## Change Log

| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial results recorded | <name> |
