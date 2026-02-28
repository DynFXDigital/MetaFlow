---
description: Continue executing the current plan/task end-to-end without pausing; only stop if blocked or if the next step is destructive/ambiguous.
agent: agent
---

Continue the work from the current context.

## Core rule

- Keep going until the full task is complete.
- Do not stop to ask whether to continue.

## When to ask a question (only)

Ask the user only if:

- You are blocked (missing info, unclear requirement, auth/environment limitation).
- The next action is destructive/irreversible or high-impact (deleting data, large refactor, dependency upgrades, public API changes).
- There are multiple plausible options with materially different outcomes and no repo guidance.

## Execution expectations

- Use the nearest `AGENTS.md` and repo instructions.
- Prefer minimal, safe changes that satisfy requirements.
- Validate changes with the smallest relevant test set.

## Output

- Provide brief milestone updates (investigation done, implementation done, tests done).
- Finish with a concise recap of what changed and what remains (ideally: nothing).

## Inputs

- Current task/goal: ${input:goal:What should be completed end-to-end?}
- Constraints (optional): ${input:constraints:Any constraints (paths to touch/avoid, risk limits, test scope)?}
