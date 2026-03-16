---
description: Reconcile repository-local AI metadata against linked or candidate shared metadata repositories and recommend what should stay local, be replaced, be promoted, or be merged.
agent: agent
---

Review the current repository AI metadata and reconcile it against linked or candidate shared metadata repositories.

1. Discover topology:

- Read `.metaflow/config.jsonc` when present.
- Identify enabled linked repositories and capability paths under `metadataRepos[*].capabilities`.
- If no active MetaFlow config exists, still use any user-specified or workspace-present metadata repositories as comparison inputs.

2. Inventory both sides:

- Inventory local `.github/instructions`, `.github/prompts`, `.github/agents`, and `.github/skills`.
- Inventory comparable artifacts in each linked or candidate shared metadata repository.
- Map overlaps by intent, not just matching filenames.

3. Evaluate overlap quality:

- Compare local and shared artifacts for scope discipline, portability, user usefulness, composability, and maintenance quality.
- Identify which side is more refined, more general, or more actionable.
- Flag contradictions, scope creep, duplicated ownership, and weak `applyTo` targeting.

4. Classify each local artifact with exactly one primary disposition:

- `keep-local`
- `replace-with-shared`
- `promote-to-shared`
- `merge-and-retire-local`
- `split-before-decision`

5. Recommend exact next actions:

- For `replace-with-shared`, identify the shared canonical artifact and explain what local artifact can be removed or reduced.
- For `promote-to-shared` and `merge-and-retire-local`, identify the destination repository and capability path and describe the required generalization edits.
- For `split-before-decision`, explain how to separate repository-specific behavior from reusable guidance.

6. Output format:

- Findings by priority.
- A reconciliation table with local artifact, shared comparison target, disposition, canonical owner, and rationale.
- A short note for each overlap on which side appears more refined and why.
- A final action plan ordered by safest/highest-value consolidation first.

Ask for confirmation before making destructive retire/remove/overwrite changes.
