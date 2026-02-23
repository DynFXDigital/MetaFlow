---
agent: 'agent'
description: 'Create or refresh a functional test gap-closure plan with risk-ranked coverage actions and traceability.'
---

Create a functional testing gap-closure plan for `${input:scope:Feature, subsystem, or release scope}`.

## Inputs

- Related requirements/test case docs: `${input:artifacts:Paths to SRS/TCS/FTD/FTR artifacts}`
- Risk focus: `${input:risk:Critical workflows and highest risk areas}`
- Current test sources: `${input:tests:Automated/manual test files or suites}`

## Tasks

1. Build a functional surface inventory of user-visible behaviors.
2. Map behaviors to `REQ-*` and `TC-*`; identify missing or weakly covered cases.
3. Prioritize open gaps using `Critical/High/Medium/Low`.
4. Update authoritative testability scope in `TCS` (`TC-*` additions/changes where needed).
5. Update authoritative executable procedures in `FTD` (`TP-*` mappings for targeted `TC-*`).
6. Produce or refresh an operational plan using `.github/instructions/resources/Template.FunctionalTestPlan.md` when helpful.
7. Add owners, target dates, and closure actions for each open gap.

## Policy

- `TCS`/`FTD`/`FTR` are authoritative. Planning artifacts are support documents and must not be treated as the source of truth for testability or execution status.

## Output Format

1. `Coverage Snapshot`
- Summary counts: REQ mapped, TC covered, open gaps by risk.

2. `Top Gap List`
- Flat list of highest-risk unclosed gaps with rationale.

3. `Planned Actions`
- Ordered list of test additions/updates with file targets.

4. `Authoritative Artifact Updates`
- Paths and content updates made to `TCS` and `FTD`.

5. `Functional Test Plan Artifact`
- Path and content updates made from the template (if produced/updated).

6. `Exit Criteria`
- Concrete criteria for calling the gap closure complete.
