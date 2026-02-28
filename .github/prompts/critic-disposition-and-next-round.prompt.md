---
description: Take Critic findings, disposition each one, and generate the exact next implementation round plan.
agent: agent
---

# Critic Disposition + Next Round

Use this prompt immediately after a Critic report to convert findings into execution-ready work.

## Inputs

- Critic report path: ${input:report:Path to latest critic report (for example .ai/temp/critiques/critique-report-YYYY-MM-DD-*.md)}
- Goal: ${input:goal:Overall goal being implemented}
- Scope: ${input:scope:In-scope files/areas and out-of-scope boundaries}
- Done criteria: ${input:done:Objective completion criteria}
- Round number: ${input:round:Current round number}

## Instructions

1. Read the Critic report and extract all findings with severity (`C1..C4`), evidence, and recommendations.
2. For each finding, assign a disposition:
- `fixed`: issue already resolved in current workspace with evidence.
- `todo`: valid issue not yet fixed and must be addressed next.
- `accepted-risk`: valid issue intentionally deferred with rationale, owner, and target date.
- `rejected`: not reproducible, out of scope, or contradicted by stronger evidence.
3. Validate dispositions against current workspace state (code/docs/tests), not just the report text.
4. Produce a prioritized next-round implementation list:
- Fix all in-scope `C1`/`C2` first.
- Then in-scope `C3` items that affect done criteria.
- Then optional `C4` hardening items.
5. Define test/gate plan for next round with smallest-first strategy.
6. Identify blockers or decisions requiring user input.

## Required Output

## Disposition Table

| Finding ID | Severity | Disposition | Evidence | Action |
|---|---|---|---|---|
| F-001 | C1 | todo | `path:line` | Implement ... |

## Next Round Plan

1. Task 1 (maps to findings: ...)
2. Task 2 (maps to findings: ...)
3. Task 3 (maps to findings: ...)

## Verification Plan

- Targeted checks:
- Gate checks:
- Expected pass criteria:

## Escalations

- Items requiring user decision:
- Out-of-scope findings to ignore for now:

## Exit Rule

Recommend proceeding only if:
- every in-scope `C1`/`C2` is `fixed`, `todo`, or `accepted-risk` with explicit rationale,
- and the next round plan is fully actionable without ambiguity.
