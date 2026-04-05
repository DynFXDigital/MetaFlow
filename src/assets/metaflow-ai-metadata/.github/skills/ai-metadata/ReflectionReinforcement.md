# Reflection + reinforcement for AI metadata

## Purpose

Provide a practical, evidence-gated workflow for turning retrospective findings into durable AI-metadata improvements without bloating global instructions.

## Conceptual basis

- Reflection stores reusable textual lessons that improve future runs through artifacts, not model retraining.
- Reinforcement promotes repeated, evidence-backed lessons into stable instruction layers.
- Iterative critique/revision loops should produce minimal, auditable diffs.

## Layering model (stable vs volatile)

1. Stable policy (rarely changed, high signal)

- `.github/copilot-instructions.md` for repo-wide defaults.
- `.github/instructions/**/*.instructions.md` for scoped/path-specific constraints.
- `AGENTS.md` for local specialist playbooks with boundaries and exact commands.

1. Volatile lessons (frequent, evidence-gated)

- Short dated entries in a bounded durable-memory section.
- Must include an evidence pointer and trigger condition.
- Promote to stable policy only after repetition.

## Evidence-gated reinforcement schema

Every proposed reinforcement must include:

- Trigger: when or where the rule applies.
- Directive: exact command or operational behavior.
- Rationale: one sentence explaining expected value.
- Evidence: pointer to failing test output, PR review comment, issue, or reproducible mistake.

Reject proposals that are:

- Purely subjective.
- Unscoped or globally broad without broad evidence.
- Duplicate of existing guidance at the same or narrower layer.

## Progressive discovery workflow (minimize context)

Use a staged read strategy to reduce token usage and drift:

Stage 1: Fast inventory

- Enumerate candidate metadata files only.
- Read frontmatter, headers, and first sections before deep reads.

Stage 2: Targeted deepening

- Read full content only for files mapped to uncovered or conflicting issues.
- Prefer nearest scope first (`applyTo` match, closest `AGENTS.md`, existing skill).

Stage 3: Minimal reinforcement action

- Modify the narrowest existing artifact that solves the issue.
- Create new artifacts only when no suitable scope exists.

Stage 4: Auditability pass

- Confirm each added or edited rule includes trigger, directive, rationale, and evidence.
- Confirm no conflicting or duplicate rule was introduced.

## Decision tree for artifact selection

Apply in order:

1. Edit existing path-specific instruction.
2. Edit nearest `AGENTS.md` for local execution guidance.
3. Edit existing skill for deep conditional procedure.
4. Add a narrow new instruction file.
5. Add a new skill only when the workflow is deep and repeatable.
6. Add or update prompt files to orchestrate the workflow.

## Authoring guardrails

- Keep rules terse, imperative, and testable.
- Prefer exact commands and stable paths over prose.
- Avoid duplicating the same rule across multiple layers.
- Preserve minimal diffs; avoid formatting-only churn.
- Do not modify product code during reflection unless explicitly requested.

## Versioning

- Last reviewed: 2026-03-09