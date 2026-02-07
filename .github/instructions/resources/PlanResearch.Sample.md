# FeatureName  Research (Sample)

- **Last updated:** YYYY-MM-DD
- **Owner:** Primary engineer or pod

## Scope of Research
Briefly state what you investigated and why (1 paragraphs). Include any assumptions that bounded the research.

## Prior Art
- Link to relevant code paths, prior PRs, previous plans, or external docs.
- Note what was reused vs what needs change.

## Constraints
- Platform/runtime constraints (e.g., x86, FNA, toolchain limitations)
- Performance constraints (frame budget, IO limits)
- Compatibility constraints (save data, network protocols, versioning)
- Build/test constraints (CI limitations, headless requirements)

## Dependencies & Coupling Notes
- What components are coupled and why it matters
- Potential seams/abstractions that could reduce coupling
- Known integration points (file formats, APIs, services)

## Risks & Unknowns
- Key unknowns that might change the plan
- Highest-risk assumptions to validate early

## Experiments / Prototypes
- **YYYY-MM-DD**  What you tried
  - Result: pass/fail + short notes
  - Commands/flags: record exact invocations when relevant

## Findings Summary
A short, high-signal summary of the most important conclusions that will directly shape the plan.

## Open Questions
- Questions that remain unanswered, with suggested next actions/owners if helpful
