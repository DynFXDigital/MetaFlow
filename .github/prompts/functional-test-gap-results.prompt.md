---
description: Record functional test execution, update gap burn-down, and produce release-readiness recommendation.
agent: agent
---

Record functional testing results for `${input:scope:Feature, subsystem, or release scope}`.

## Inputs

- Related plan/results artifacts: `${input:artifacts:Paths to Functional Test Plan and Results docs}`
- Test run command(s): `${input:commands:Exact commands or tasks executed}`
- Evidence locations: `${input:evidence:Logs, reports, screenshots, artifacts}`

## Tasks

1. Capture run metadata (executor, build/commit, environment).
2. Record per-`TC-*` outcomes with linked evidence.
3. Update gap burn-down (closed, still open, newly discovered gaps).
4. Add issue links and mitigation for every `Fail` and `Skip`.
5. Produce residual risk register and ownership.
6. Provide readiness recommendation: `Ready`, `Conditionally Ready`, or `Not Ready`.

## Output Format

1. `Run Summary`
- Pass/Fail/Skip totals and notable deltas.

2. `Gap Burn-Down Delta`
- What closed in this run and what remains.

3. `Blocking Risks`
- Flat list of unresolved high-risk items.

4. `Results Artifact`
- Path and content updates made using `.github/instructions/resources/Template.FunctionalTestResults.md`.

5. `Decision`
- Final readiness call with evidence-based rationale.
