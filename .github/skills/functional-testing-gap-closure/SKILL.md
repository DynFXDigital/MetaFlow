---
name: functional-testing-gap-closure
description: Use this skill to define, prioritize, execute, and close functional testing gaps using traceable plans, results, and release-readiness decisions.
---

# Functional Testing Gap Closure

## Purpose

Use this skill when the goal is to lock down behavior at the functional level by identifying missing coverage and driving those gaps to closure with evidence.

Authoritative records are `TCS` (what is testable), `FTD` (how tests run), and `FTR` (what actually ran and passed/failed). Plans are operational aids, not the source of truth.

## Inputs

- System scope (feature, subsystem, or release).
- Source requirements and test cases (`REQ-*`, `TC-*`).
- Existing automation and manual procedures.
- Risk priorities (critical workflows first).

## Workflow

1. Build the functional surface map.
- Enumerate workflows and externally observable behaviors.
- Map each behavior to `REQ-*` and existing `TC-*`.

2. Identify and prioritize gaps.
- Mark uncovered or weakly-covered `TC-*`.
- Rank gaps by risk: `Critical`, `High`, `Medium`, `Low`.

3. Author or update the functional test plan.
- Use `.github/instructions/resources/Template.FunctionalTestPlan.md`.
- Ensure each `TC-*` is linked to at least one executable `TP-*`.
- Add ownership and target date for each open gap.

4. Promote plan outcomes into authoritative artifacts.
- Update `TCS` to add or revise `TC-*` definitions for newly identified testable behavior.
- Update `FTD` to add or revise runnable `TP-*` procedures for those `TC-*` rows.

5. Implement missing tests and run focused execution.
- Add automated tests for high-risk gaps first.
- Run the smallest relevant test scope first, then broader scope as needed.

6. Record run evidence and closure status.
- Use `.github/instructions/resources/Template.FunctionalTestResults.md`.
- Link each result to durable evidence and issue IDs for fails/skips.
- Update gap burn-down and residual risks.
- Ensure closure status is reflected in `FTR` for corresponding `TC-*` rows.

7. Produce readiness decision.
- Report `Ready`, `Conditionally Ready`, or `Not Ready`.
- Justify decision using unresolved high-risk gaps.

## Required Quality Gates

- Every enforced `REQ-*` has at least one `TC-*`.
- Every `TC-*` has at least one executable `TP-*`.
- Every failed/skipped `TC-*` has issue linkage and mitigation.
- No unresolved high-risk gap without explicit approval note.
- No gap is considered closed unless `FTR` contains passing evidence for the related `TC-*`.

## Output Checklist

- Updated `TCS` artifact (authoritative testability definition).
- Updated `FTD` artifact (authoritative executable procedures).
- Updated `FTR` artifact (authoritative execution results).
- Optional updated plan artifact (FTP) for operational tracking.
- Added/updated automated tests for closed gaps.
- Residual risk list with owners and target dates.
- Readiness recommendation tied to evidence.
