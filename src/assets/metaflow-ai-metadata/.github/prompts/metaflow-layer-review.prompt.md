---
description: Evaluate current repository AI metadata and propose safe MetaFlow promotion opportunities.
agent: metaflow-metadata-steward
---

Review the current repository AI metadata and provide:
1. Current-state assessment:
- Inventory `.github/instructions`, `.github/prompts`, `.github/agents`, and `.github/skills`.
- Flag overlap, contradictions, weak scoping, and frontmatter problems.

2. Coaching on MetaFlow best practices:
- Explain practical improvements for layer boundaries, naming, and `applyTo` targeting.
- Recommend ways to reduce coupling and instruction drift.

3. Promotion candidate analysis:
- Determine which files are candidates for promotion to linked metadata repositories.
- For each candidate, identify best-fit destination repository and destination capability path.
- Explain what must be generalized before promotion and what should remain repository-specific.

4. Actionable output:
- Provide a prioritized plan with `keep-local`, `promote-as-is`, `promote-after-generalization`, or `shared-overlap-or-upgrade` labels.
- Include concrete next-step edits for each promoted candidate.

Ask for confirmation before making destructive or broad overwrite changes.
