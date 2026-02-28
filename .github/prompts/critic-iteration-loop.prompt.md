---
description: Implement a goal, run Critic review, fix findings, and repeat until no real issues remain.
agent: agent
---

# Critic Iteration Loop

Use this prompt to drive high-rigor implementation with repeated adversarial critique until closure.

## Inputs

- Goal: ${input:goal:What must be completed (for example: implement .plan/<name> end-to-end)?}
- Scope: ${input:scope:Files/areas in scope and any explicit out-of-scope boundaries}
- Done criteria: ${input:done:Objective completion criteria (tests, docs, gates, behavior)}
- Risk constraints: ${input:constraints:Any safety constraints (no destructive actions, no API breaks, etc.)}
- Max rounds: ${input:maxRounds:Max implementation/critique rounds before forced escalation (default 5)}

## Operating Mode

1. Implement the goal in small, testable increments.
2. Run the smallest relevant tests after each increment.
3. Request a Critic review after each major increment.
4. Classify Critic findings:
   - `Real issue`: Evidence-backed, reproducible, materially affects correctness/reliability/readiness.
   - `Accepted risk`: Real issue but intentionally deferred with documented rationale/owner/date.
   - `Rejected`: Not reproducible, out of scope, or contradicted by stronger evidence.
5. Address all `Real issue` findings in scope.
6. Update tests/docs/traceability artifacts as part of fixes.
7. Re-run Critic and repeat until stop conditions are met.

## Required Loop Protocol

For each round `N`:

1. **Implement**
- Make focused changes for current goals/findings.
- Keep changes minimal and behavior-preserving unless requirement demands otherwise.

2. **Verify**
- Run targeted tests first, then broader gate as needed.
- Record exact command(s), pass/fail counts, and any flaky behavior.

3. **Critic Review**
- Invoke `Critic` subagent with:
  - goal + scope + done criteria
  - current changed files
  - latest test/gate evidence
  - request for severity-ranked findings (`C1..C4`) with file references.

4. **Disposition Table**
- For each finding, create:
  - `ID`
  - `Severity`
  - `Decision` (`fixed` | `accepted-risk` | `rejected`)
  - `Evidence`
  - `Action`

5. **Closure Check**
- Continue if any in-scope `C1/C2` remains unresolved.
- Continue if done criteria are not yet met.
- Stop only when all stop conditions below pass.

## Stop Conditions (all required)

- No unresolved in-scope `C1` or `C2` findings from latest Critic run.
- No unresolved in-scope `C3` findings without explicit disposition.
- All done criteria satisfied with executed evidence.
- Required tests/gates pass.
- Documentation/traceability updates completed for all material changes.

## Escalation Conditions

Stop and escalate to user immediately if:

- Critic and implementation disagree for 2 consecutive rounds on the same finding.
- Required environment capability is unavailable.
- A fix requires destructive or high-impact change outside agreed constraints.
- `Max rounds` reached with unresolved in-scope `C1/C2`.

## Output Format (every round)

## Round N Summary
- Goal slice completed:
- Files changed:
- Verification evidence:
- Critic findings summary:
- Disposition updates:
- Remaining blockers:
- Next round plan:

## Final Output (on completion)

- Completion verdict against done criteria.
- Final list of files changed.
- Final executed test/gate evidence.
- Final Critic status (no unresolved in-scope critical/major issues).
- Residual risks (if any) with owner/date.
