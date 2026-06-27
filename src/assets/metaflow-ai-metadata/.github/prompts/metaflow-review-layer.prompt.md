---
description: Evaluate current repository AI metadata and propose safe MetaFlow promotion opportunities.
agent: agent
---

Review the current repository AI metadata and provide:

1. Current-state assessment:

- Inventory `.github/instructions`, `.github/prompts`, `.github/agents`, and `.github/skills`.
- Flag overlap, contradictions, weak scoping, and frontmatter problems.
- Flag prompt-injection and authority-confusion patterns, especially where repo content, issue text, logs, or fetched external content is being promoted into persistent instructions.
- Flag `CAPABILITY.md` descriptions that use meta framing like `Reusable`, `Shared`, or `Bundled` instead of direct declarative wording about what the capability offers.
- For instructions, flag broad or missing `applyTo` values and explain whether the breadth is justified.

2. Coaching on MetaFlow best practices:

- Explain practical improvements for layer boundaries, naming, and `applyTo` targeting.
- Recommend ways to reduce coupling and instruction drift.
- Recommend ways to keep trusted policy separate from untrusted source material so imported content cannot silently override agent behavior.
- Call out where narrower `applyTo` patterns would preserve progressive discovery and reduce unnecessary context loading.
- Call out any hard dependency on a neighboring capability that should be reframed as optional composition with a compatible adjacent workflow.

3. Promotion candidate analysis:

- Determine which files are candidates for promotion to linked metadata repositories.
- For each candidate, identify best-fit destination repository and destination capability path.
- Explain what must be generalized before promotion and what should remain repository-specific.
- Do not promote instruction files with global or weakly justified scope until the scope is tightened or the rationale is documented.

4. Actionable output:

- Provide a prioritized plan with `keep-local`, `promote-as-is`, `promote-after-generalization`, or `shared-overlap-or-upgrade` labels.
- Include concrete next-step edits for each promoted candidate.
- Include a short `scope-risk` note for any instruction whose `applyTo` is broad, recursive, or omitted.
- Include an `injection-risk` note for any artifact that elevates untrusted text, weakens instruction hierarchy, or broadens tool authority without a clear trust boundary.
- Note any adjacent workflow that can be used opportunistically, and state the expected fallback behavior when it is absent.

Ask for confirmation before making destructive or broad overwrite changes.
