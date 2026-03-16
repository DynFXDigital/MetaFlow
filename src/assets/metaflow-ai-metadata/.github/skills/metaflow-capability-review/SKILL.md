---
name: metaflow-capability-review
description: Use this skill to review repository AI metadata, coach MetaFlow best practices, and plan safe promotion into linked metadata repositories.
---

# MetaFlow Capability Review

Use this skill when you need to evaluate AI metadata quality and decide what should remain local versus what should be promoted.

If the task is to compare repository-local metadata against linked or candidate shared metadata repositories and decide whether local artifacts should be retired, replaced, merged, or promoted, use the companion `metaflow-linked-metadata-reconciliation` skill instead.

## MetaFlow Fundamentals

- Primary config is `.metaflow/config.jsonc`.
- Public v1 source selection is declared via `metadataRepos[*].capabilities`.
- `layerSources[*]` and top-level `layers[]` are legacy compatibility shapes, not the preferred authoring model for new configs.
- Synchronized outputs typically land under `.github/` and should stay stable across repeated runs.
- Promotion should preserve reusable guidance while keeping repository-specific behavior local.

## Best Practices

1. Keep capabilities orthogonal: one clear purpose per capability.
2. Write `CAPABILITY.md` frontmatter descriptions as direct declarative sentences about what the capability offers; avoid prefixes like `Reusable`, `Shared`, or `Bundled`.
3. Use tight `applyTo` scopes; avoid global patterns unless absolutely necessary.
4. Keep guidance actionable and concise; avoid duplicate policy across files.
5. Separate reusable rules from repository-specific exceptions.
6. Preserve stable naming and folder structure for long-term maintainability.
7. Treat missing `applyTo` as a review finding unless the file type or platform semantics make scope explicit elsewhere.
8. Prefer optional composition with adjacent capabilities or local workflows over hard dependencies on one specific neighboring capability.
9. When a related workflow exists, describe it as compatible composition and define graceful behavior when it is absent.

## Review Workflow

1. Discover topology:

- Read `.metaflow/config.jsonc`.
- Confirm linked repositories and enabled capability paths under `metadataRepos[*].capabilities`.
- Note active profiles and any injection overrides that affect how metadata is consumed.

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
- For instructions, also classify scope risk as `low`, `moderate`, or `elevated` based on how broad the `applyTo` pattern is and whether it is justified.

4. Plan promotion targets:

- Select the best-fit linked repository for each candidate.
- Choose destination capability path under `capabilities/<name>/.github/...`.
- Document exactly what to extract, rewrite, or split, and whether the canonical guidance should live in the extension bundle instead of a shared metadata repo.
- Check whether the capability assumes a specific adjacent workflow; generalize that dependency into optional composition when possible.

5. Validate before promotion:

- Check frontmatter correctness and naming consistency.
- Check `CAPABILITY.md` descriptions for direct, declarative wording about offered content rather than meta framing.
- Remove hard-coded local paths, branch names, and internal-only references.
- Verify no contradictory guidance after extraction.
- Verify promoted instructions do not widen `applyTo` beyond the reusable behavior they actually need to influence.

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
4. Recommend split, merge, or retirement actions when boundaries are unclear or a shared file is no longer authoritative.
5. Ensure examples are actionable and not repo-specific.
6. Require a justification for any instruction that uses repo-wide or weakly anchored recursive `applyTo` patterns.
7. Flag any metadata that names a neighboring capability as a requirement when the real need is broader adjacent functionality.
8. Flag `CAPABILITY.md` descriptions that rely on meta-framing adjectives instead of describing the offered guidance directly.
