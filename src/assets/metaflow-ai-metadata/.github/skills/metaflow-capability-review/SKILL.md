---
name: metaflow-capability-review
description: Use this skill to review repository AI metadata, coach MetaFlow best practices, and plan safe promotion into linked metadata repositories.
---

# MetaFlow Capability Review

Use this skill when you need to evaluate AI metadata quality and decide what should remain local versus what should be promoted.

## MetaFlow Fundamentals

- Primary config is `.metaflow/config.jsonc`.
- Metadata sources are declared via `metadataRepos[*]` and activated via `layerSources[*]`.
- `layers[]` order defines precedence for overlapping outputs (later entries win).
- Materialized outputs typically land under `.github/` and should stay deterministic.
- Promotion should preserve reusable guidance while keeping repository-specific behavior local.

## Best Practices

1. Keep capabilities orthogonal: one clear purpose per capability.
2. Use tight `applyTo` scopes; avoid global patterns unless absolutely necessary.
3. Keep guidance actionable and concise; avoid duplicate policy across files.
4. Separate reusable rules from repository-specific exceptions.
5. Preserve stable naming and folder structure for long-term maintainability.

## Review Workflow

1. Discover topology:
- Read `.metaflow/config.jsonc`.
- Confirm linked repositories and enabled layer sources.
- Note active profiles and layer order.

2. Inventory local AI metadata:
- Review `.github/instructions/**/*.instructions.md`.
- Review `.github/prompts/**/*.prompt.md`.
- Review `.github/agents/**/*.agent.md`.
- Review `.github/skills/**/SKILL.md` and related assets.

3. Classify each file:
- `keep-local`: repository-specific policy or workflow.
- `promote-as-is`: already generic and reusable.
- `promote-after-generalization`: useful but coupled to this repository.
- `shared-overlap-or-upgrade`: local metadata substantially duplicates shared metadata, or local metadata is superior and should be proposed as a shared upgrade.

4. Plan promotion targets:
- Select the best-fit linked repository for each candidate.
- Choose destination capability path under `capabilities/<name>/.github/...`.
- Document exactly what to extract, rewrite, or split.

5. Validate before promotion:
- Check frontmatter correctness and naming consistency.
- Remove hard-coded local paths, branch names, and internal-only references.
- Verify no contradictory guidance after extraction.

## Promotion Advice

- Promote principles, not project history.
- Keep examples generic and portable.
- Leave deeply local conventions in the current repository.
- Do not overwrite drifted files silently.
- Ask for confirmation before broad or destructive changes.

## Expected Output

Provide a concise report with:
- Findings by priority.
- Candidate table with classification and destination recommendation.
- Required generalization changes per candidate.
- A step-by-step promotion plan.

Checklist:

1. Confirm each capability solves one clear problem.
2. Flag project-specific wording that should be generalized.
3. Identify overlap with adjacent capabilities.
4. Recommend split or merge actions when boundaries are unclear.
5. Ensure examples are actionable and not repo-specific.
