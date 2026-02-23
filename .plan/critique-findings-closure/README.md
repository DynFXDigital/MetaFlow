# Plan: Critique Findings Closure

## Problem Statement

The project has multiple independently produced critiques with high overlap on release-readiness evidence defects (FTR arithmetic mismatch and readiness divergence), process drift (stale operational docs), and implementation risk (sync extension-host I/O, potential JSONC-write degradation). Without a coordinated closure plan, these findings remain fragmented and can reoccur.

## Goal

Produce one evidence-backed closure pass that resolves consensus findings, verifies disputed findings, and upgrades release confidence by aligning documentation, process gates, test traceability, and code behavior.

## Scope

### In Scope

1. Reconcile readiness artifacts and test totals (`FTR`, `FTP`, `AGENTS`, `CHANGELOG`).
2. Verify and close workflow-gate findings for CI/release (`ci.yml`, `release.yml`).
3. Close safety traceability gaps for REQ-060x through `TCS`/`FTD`/`FTR` updates and executable tests.
4. Refactor command-path sync I/O to async-safe behavior where feasible.
5. Validate and remediate JSONC comment-preserving persistence behavior.
6. Reproduce and disposition single-source finding on proposed API menu contribution.

### Out of Scope

1. New features unrelated to critique findings.
2. Large UX redesigns for views/commands.
3. Non-critical optimization work not tied to critique risk reduction.
4. Validation-track (`doc/validation/**`) expansion unless required by REQ-060x closure.

## Constraints

- Maintain TypeScript strict-mode compatibility and existing extension architecture boundaries.
- Keep authoritative evidence in `TCS`/`FTD`/`FTR` (plans are not source of truth).
- Run smallest relevant test scope first; escalate to broader suites only when needed.
- Preserve behavior compatibility for existing command UX while migrating I/O internals.
- Follow repository plan/documentation instructions and traceability conventions.

## Owners and Dependencies

- **Primary owner:** MetaFlow Maintainers
- **Contributors:** Extension maintainers, engine/CLI maintainers, docs owners
- **Dependencies:**
  - Stable integration test environment (`npm run test` in `src/`)
  - Workflow editing permissions for `.github/workflows/*`
  - Traceability doc update rights (`doc/srs`, `doc/tcs`, `doc/ftd`, `doc/ftr`)

## Workstreams

1. Evidence and documentation reconciliation.
2. CI/release gate hardening.
3. Safety traceability closure.
4. Command-path I/O and config persistence remediation.
5. Verification and final readiness recommendation.

## Phases

1. `Phase1-Baseline-and-Finding-Verification.md`
2. `Phase2-Docs-and-Traceability-Reconciliation.md`
3. `Phase3-Process-and-Test-Gate-Hardening.md`
4. `Phase4-Code-Path-Remediation.md`
5. `Phase5-Closure-Validation-and-Signoff.md`

## Success Criteria

1. `FTR` and `FTP` report a single reconciled readiness position with correct arithmetic.
2. `AGENTS.md` and `src/CHANGELOG.md` operational claims match current verified totals.
3. CI/release workflow policy for test gating is explicit and enforced as intended.
4. REQ-060x has complete and executable traceability (`REQ -> TC -> TP -> TR evidence`).
5. Command-path sync I/O is removed or justified with explicit residual-risk documentation.
6. JSONC persistence behavior is deterministic and tested for comment-preservation expectations.
7. Single-source findings are either confirmed-and-fixed or closed with evidence-based rejection.

## Exit Criteria

1. All C2 findings from the combined critique are either closed or dispositioned with owner and due date.
2. Test runs and doc updates are captured in final closure evidence.
3. `Context.md` is updated to completed state with outcome and residual risks.

## References

- `.ai/temp/critiques/critique-report-2026-02-23-Combined-GPT-5.3-Codex.md`
- `.plan/readiness-gap-closure/README.md`
- `.plan/functional-testing-gap-closure/README.md`
- `.github/skills/functional-testing-gap-closure/SKILL.md`
- `.github/skills/traceability-docs/SKILL.md`
