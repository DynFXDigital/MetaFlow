# SRS — Software Requirements Specification

## Document Header

| Doc ID | Scope | Owner | Status |
|---|---|---|---|
| SRS-<PROJECT-or-SUBSYSTEM-or-FEATURE-or-CAPABILITY> | Top-level \| Subsystem: `doc/subsystems/<SubsystemName>/` \| Feature: `doc/features/<FeatureName>/` \| Capability: `doc/capabilities/<CapabilityName>/` | <name/team> | Draft \| Active \| Deprecated |

| Last Updated | Notes |
|---|---|
| YYYY-MM-DD | <optional> |

## Purpose

This document is the source of truth for `REQ-####` requirements.

Traceability is maintained in downstream docs (SDD/TCS/FTD/FTR) via back-links to `REQ-*`.

## Scope

- In scope: <bullets>

## Non-goals

- Out of scope: <bullets>

## Requirements

Notes:
- `Enforcement` indicates when a requirement must be satisfied: `Now`, `Phase-<n>`, or `Future`.

| REQ-ID | Title | Description | Enforcement | Acceptance (testable) | Notes | Priority | Status |
|---|---|---|---|---|---|---|---|
| REQ-0001 | Example: Capture toggle | User can enable/disable capture in settings. | Phase-1 | Toggle persists across restart and affects capture behavior. | <optional> | P1 | Draft |
| REQ-0002 | Example: Deterministic naming | Captures use deterministic file naming. | Future | Name includes build/version and timestamp; no collisions in normal use. | <optional> | P2 | Draft |

## Traceability (Policy)

- SRS does not include forward links to design (`DES-*`) or tests (`TC-*`).
- SDD maps `REQ-*` to design elements and code references.
- TCS/FTD define test cases and procedures that validate `REQ-*`.

## Conventions (optional)

- IDs are stable and never reused.

## Change Log

| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial draft | <name> |
