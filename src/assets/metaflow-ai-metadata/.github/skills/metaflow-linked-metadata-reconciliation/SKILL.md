---
name: metaflow-linked-metadata-reconciliation
description: Use this skill when comparing repository-local AI metadata against linked or candidate shared metadata repositories to decide what should stay local, be replaced, be promoted, or be merged.
---

# MetaFlow Linked Metadata Reconciliation

## Purpose

Use this skill when a repository has local AI metadata and one or more linked or candidate shared metadata repositories, and the task is to reconcile the relationship between them.

This skill is for governance and consolidation decisions, not just promotion readiness.

## When To Use

Use this skill when tasks include:
- "Compare local `.github` metadata to our shared capability repo"
- "Decide what local metadata should be removed because shared guidance already exists"
- "Determine whether a stronger local prompt/skill/agent should be generalized and promoted upstream"
- "Audit drift between local metadata and linked MetaFlow capabilities"

Use `metaflow-capability-review` instead when the task is mainly to review one metadata repository for quality and promotion readiness without needing side-by-side reconciliation.

## Core Workflow

### 1. Discover topology

1. Read `.metaflow/config.jsonc` when present.
2. Identify enabled linked repositories under `metadataRepos[*]` and their enabled capability paths.
3. If the repository has no active MetaFlow config, still include candidate shared metadata repositories supplied by the user or present in the workspace.
4. Treat "exists and is intended for reuse" as enough to compare; do not require active linkage to perform reconciliation analysis.

### 2. Inventory both sides

Collect local artifacts from:
- `.github/instructions/**/*.instructions.md`
- `.github/prompts/**/*.prompt.md`
- `.github/agents/**/*.agent.md`
- `.github/skills/**/SKILL.md` and related assets

Collect comparable shared artifacts from each linked or candidate capability repository.

Map overlaps by intent, not just by matching filenames. Compare mission, scope, trigger conditions, and workflow outcomes.

### 3. Classify each local artifact

Assign exactly one primary disposition:
- `keep-local`: repository-specific guidance that should remain local
- `replace-with-shared`: local artifact is redundant with a sufficiently strong shared artifact
- `promote-to-shared`: local artifact is reusable with little or no generalization
- `merge-and-retire-local`: local artifact is stronger than the shared artifact and should be generalized upstream, then retired locally
- `split-before-decision`: local artifact mixes shared and repository-specific concerns and must be separated first

### 4. Judge which side is stronger

Use a comparative rubric:

1. Scope discipline
- Does the artifact have a narrow, defensible purpose?
- Are `applyTo` patterns tight enough for the behavior being enforced?

2. Portability
- Does it avoid repo-specific names, paths, branch assumptions, and internal-only context?
- Can another repository adopt it with minimal edits?

3. User usefulness
- Does it help an agent or user make better decisions with less ambiguity?
- Are outputs and decision points explicit?

4. Composability
- Does it coexist cleanly with adjacent capabilities?
- Does it avoid hard dependencies where optional composition would suffice?

5. Maintenance quality
- Is ownership clear?
- Is the content concise, non-duplicative, and stable?

When local and shared artifacts overlap, choose one canonical owner and state why.

### 5. Define the action plan

For every non-`keep-local` item, specify:
- canonical owner after reconciliation
- destination repository and capability path, when promotion or merge is recommended
- exact generalization changes required before promotion
- what local file should be removed, replaced, or reduced to a thin repository-specific specialization

Do not recommend deleting or overwriting local metadata without explicit user confirmation.

## Output Contract

Provide:

- prioritized findings
- a reconciliation table with local artifact, shared comparison target, disposition, and rationale
- a short comparative note on which side is more refined and why
- exact upstream/generalization changes needed for any `promote-to-shared` or `merge-and-retire-local` outcome
- any user decisions needed before destructive consolidation

## Review Guardrails

- Do not assume local metadata should lose merely because shared metadata exists.
- Do not assume shared metadata should be updated merely because local metadata is newer.
- Prefer split-first recommendations when one file mixes reusable rules with repository-specific execution details.
- Flag broad or weakly justified `applyTo` patterns as reconciliation risk, not just style issues.
- Call out drift between active linked capabilities and local overrides when both claim the same concern.
