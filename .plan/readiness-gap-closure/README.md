# Plan: Readiness Gap Closure (TP-A017)

## Problem Statement

`doc/ftr/FTR-metaflow-ext.md` currently reports `Conditionally Ready` because high-risk integration procedure `TP-A017` (`TC-0331` through `TC-0334`) is blocked by a VS Code Extension Host update-lock. This leaves authoritative functional evidence incomplete for final release-readiness sign-off.

## Goal

Close all readiness gaps in the FTR readiness recommendation by obtaining authoritative execution evidence for TP-A017 and publishing a final evidence-based readiness decision.

## Scope

### In Scope

1. Environment and runner stabilization for Extension Host integration execution.
2. Targeted execution of TP-A017 (`TC-0331` to `TC-0334`).
3. Authoritative result updates in `FTR`.
4. Controlled fallback path if automation remains blocked.
5. Final readiness decision and residual-risk statement.

### Out of Scope

1. New feature development unrelated to TP-A017 closure.
2. Broad test-suite expansion outside current readiness blocker.
3. Changes to traceability ID conventions.

## Constraints

- Keep authoritative truth in `TCS`/`FTD`/`FTR`; plans remain non-authoritative.
- Use smallest relevant test scope first.
- Preserve reproducible evidence for every retry and decision point.
- If fallback is used, residual risk must be explicit, owned, and time-bound.

## Phases

1. `Phase1-Unblock-Integration-Execution.md`
2. `Phase2-Authoritative-Evidence-Closure.md`
3. `Phase3-Readiness-Decision-and-Signoff.md`

## Exit Criteria

1. TP-A017 executed with authoritative Pass/Fail evidence captured in `FTR`.
2. `FTR` readiness recommendation updated from conditional to evidence-backed final status.
3. Any unresolved risk has owner, mitigation, and target date.

## References

- `doc/ftr/FTR-metaflow-ext.md`
- `doc/ftd/FTD-metaflow-ext.md`
- `doc/tcs/TCS-metaflow-ext.md`
- `.plan/functional-testing-gap-closure/README.md`
- `.github/skills/functional-testing-gap-closure/SKILL.md`
