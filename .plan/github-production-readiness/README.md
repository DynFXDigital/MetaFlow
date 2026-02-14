# GitHub Production Readiness Plan

## Overview

This plan upgrades MetaFlow repository operations from a solid OSS baseline to production-grade GitHub practices used by mature VS Code extension repositories. It focuses on CI robustness, security and supply-chain controls, release governance, and long-term maintenance automation.

## Problem Statement

Current artifacts provide essential automation, but key reliability and governance controls are missing: single-OS CI, no dedicated security workflows, limited release gating, and minimal dependency-update policy controls. These gaps increase the risk of regressions, publish-time failures, and delayed vulnerability response as contributor volume grows.

## Scope

### In Scope

- Harden `.github/workflows/ci.yml` with matrix strategy and stronger quality gates.
- Add security workflows (CodeQL + dependency-review).
- Strengthen `.github/workflows/release.yml` with explicit gating and safer publish behavior.
- Improve `.github/dependabot.yml` with grouping/labels/review routing.
- Add or refine maintainer runbook artifacts for support/operations.

### Out of Scope

- Re-architecting the extension, engine, or CLI internals.
- Non-GitHub CI/CD platforms.
- Major doc-system restructuring outside GitHub operations.

## Constraints

- Must remain compatible with npm workspaces (`/`, `src/`, `packages/*`).
- Keep publish targets unchanged (VS Code Marketplace + Open VSX).
- Keep contributor friction low: minimal required commands and clear failure signals.
- Preserve existing traceability workflow currently in `.github/workflows/traceability-check.yml`.

## Phases

| Phase | Document | Goal |
|---|---|---|
| 1 | `Phase1-CI-Hardening.md` | Multi-OS CI reliability and packaging confidence |
| 2 | `Phase2-Security-SupplyChain.md` | Security scanning and dependency risk controls |
| 3 | `Phase3-Release-Governance.md` | Deterministic, gated, auditable releases |
| 4 | `Phase4-Operations-Maintenance.md` | Sustainable maintenance and contributor operations |

## Dependencies

- GitHub repository admin access (secrets, branch protection, required checks)
- Marketplace tokens: `VSCE_PAT`, `OVSX_PAT`
- Maintainer bandwidth for workflow tuning and false-positive triage

## Success Criteria

- CI runs on at least Linux + Windows and blocks merge on failures.
- Security workflows run on PR/push and produce actionable output.
- Release workflow publishes only from validated refs and attaches signed-off artifacts.
- Dependabot PR volume stays manageable via grouping and labels.
- Maintainers have documented support/escalation guidance.
