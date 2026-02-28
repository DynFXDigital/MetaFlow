---
description: Create a new plan directory with required Context and phase artifacts.
agent: agent
---

# Create a Plan

Create a new planning folder under `.plan/<PlanName>/` and populate it with the minimum required artifacts, following the repository’s plan documentation rules.

## References (authoritative)

- `.github/instructions/plan.instructions.md`
- `.github/instructions/resources/PlanContext.Sample.md`
- (Optional) `.github/instructions/mermaid.instructions.md` (only if adding Mermaid diagrams)

## Input

Provide (or infer from the issue/context):

- Plan name (folder name under `.plan/`)
- One-paragraph problem/goal statement
- Scope boundaries (in / out)
- Constraints (compatibility, timelines, tooling)
- Dependencies, owners, and relevant links (issues/PRs/specs)

## Output

Produce plan artifacts consistent with `.github/instructions/plan.instructions.md`:

- `.plan/<PlanName>/Context.md` (required) using the required sections described in the plan instructions
- Additional plan documents as appropriate (e.g., `README.md`, `Phase<N>-<Name>.md`, specialized references)

Prefer linking to existing repo documents over duplicating long background.

## Notes

- Keep `Context.md` to roughly 1–2 screens as suggested by the plan instructions.
- If naming/layout is ambiguous, scan existing `.plan/*` directories and follow prevailing conventions.
