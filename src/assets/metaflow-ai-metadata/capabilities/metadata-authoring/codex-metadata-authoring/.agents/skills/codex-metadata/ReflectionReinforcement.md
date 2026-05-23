# Reflection + reinforcement for Codex metadata

Last reviewed: 2026-05-22

## Purpose

Provide an evidence-gated workflow for turning repeated Codex metadata mistakes into durable, scoped guidance without bloating global instruction layers.

## Layering model

1. Stable policy

- `AGENTS.md` for repository-level Codex defaults and routing.
- `.github/instructions/*.instructions.md` for authoring guidance about Codex metadata files.
- `.agents/skills/` for reusable Codex procedures.

2. Volatile lessons

- Short dated lessons with an evidence pointer and trigger condition.
- Promote to stable policy only after repetition or a high-cost failure.

## Evidence-gated reinforcement schema

Every proposed reinforcement should include:

- Trigger: when the rule applies.
- Directive: exact behavior or file-placement rule.
- Rationale: why the change reduces drift or breakage.
- Evidence: a failing review, stale guidance example, issue, or reproducible metadata mistake.

Reject proposals that are:

- subjective or non-testable
- unscoped across all Codex metadata without broad evidence
- already covered by a narrower existing artifact

## Selection workflow

1. Edit the narrowest existing instruction file that matches the metadata surface.
2. Update `AGENTS.md` guidance only when the rule belongs at repo level.
3. Update or add a Codex metadata skill when the workflow is deep and repeatable.
4. Add a new instruction file only when no suitable scoped artifact exists.

## Guardrails

- Prefer authoritative OpenAI docs over community guidance.
- Keep diffs minimal and auditable.
- Do not invent undocumented Codex constructs to mirror another tool's feature set.
- When a behavior is only inferred, label it as an inference.
