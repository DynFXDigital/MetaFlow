# Reflection + reinforcement for Claude Code metadata

Last reviewed: 2026-03-28

## Purpose

Provide an evidence-gated workflow for turning repeated Claude Code metadata mistakes into durable, scoped guidance without bloating global instruction layers.

## Layering model

1) Stable policy
- `CLAUDE.md` for repository-level Claude Code defaults and routing.
- `.claude/rules/` for modular unconditional and path-scoped constraints.
- `.claude/skills/` for reusable Claude Code procedures.
- `.claude/settings.json` and `.mcp.json` for operational configuration.

2) Volatile lessons
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
- unscoped across all Claude Code metadata without broad evidence
- already covered by a narrower existing artifact

## Selection workflow

1. Edit the narrowest existing artifact that matches the metadata surface.
2. Update `CLAUDE.md` only when the rule belongs at repository level.
3. Update or add a rule when the behavior is a modular constraint.
4. Update or add a skill when the workflow is procedural and repeatable.
5. Update settings or `.mcp.json` only when the change is operational configuration rather than instruction policy.

## Guardrails

- Prefer authoritative Anthropic docs over community guidance.
- Keep diffs minimal and auditable.
- Do not invent unsupported Claude Code constructs to mirror another tool's feature set.
- Treat auto memory as machine-local and complementary, not as a replacement for committed repository metadata.
