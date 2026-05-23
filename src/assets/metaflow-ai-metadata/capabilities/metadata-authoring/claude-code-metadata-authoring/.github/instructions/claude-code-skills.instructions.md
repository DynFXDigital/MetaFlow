---
description: Guidance for Claude Code skill folders and entrypoint files.
applyTo: '.claude/skills/**'
---

# Claude Code skills

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources:
    - https://code.claude.com/docs/en/skills.md

## Purpose

- `.claude/skills/` is Claude Code's reusable workflow surface for task packs, references, scripts, and templates.
- Skills are the strongest Claude Code-native replacement for Copilot prompt files and other reusable procedures.

## Authoring guidance

- Keep one folder per skill under `.claude/skills/<name>/` with a required `SKILL.md` entrypoint.
- Keep the `description` short, task-shaped, and explicit about when Claude should auto-invoke the skill.
- Use `disable-model-invocation: true` for workflows with meaningful side effects that should remain manual.
- Use `user-invocable: false` only when a skill is meant to be background knowledge rather than a slash command.
- Use `paths:` when a skill only makes sense for certain files or subsystems.
- Use shell preprocessing only for deterministic, reviewable commands whose output materially improves the workflow.
- Keep supporting scripts and examples adjacent to the skill that owns them.
- Use `*.template.md` for canonical copy-start artifacts and reserve `*.sample.md` or `*.example.md` for illustrative resources.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`.

## What to avoid

- Overlapping skills that differ only slightly in wording.
- Side-effectful shell preprocessing that surprises the user or hides environmental dependencies.
- Using skills as a substitute for root repository constraints that belong in `CLAUDE.md` or rules.---
  description: Guidance for Claude Code skill folders and entrypoint files.
  applyTo: '.claude/skills/\*\*'

---

# Claude Code skills

## Sources and versioning

- Last reviewed: 2026-03-28
- Sources:
    - https://code.claude.com/docs/en/skills.md

## Purpose

- `.claude/skills/` is Claude Code's reusable workflow surface for task packs, references, scripts, and templates.
- Skills are the strongest Claude Code-native replacement for Copilot prompt files and other reusable procedures.

## Authoring guidance

- Keep one folder per skill under `.claude/skills/<name>/` with a required `SKILL.md` entrypoint.
- Keep the `description` short, task-shaped, and explicit about when Claude should auto-invoke the skill.
- Use `disable-model-invocation: true` for workflows with meaningful side effects that should remain manual.
- Use `user-invocable: false` only when a skill is meant to be background knowledge rather than a slash command.
- Use `paths:` when a skill only makes sense for certain files or subsystems.
- Use shell preprocessing only for deterministic, reviewable commands whose output materially improves the workflow.
- Keep supporting scripts and examples adjacent to the skill that owns them.
- Use `*.template.md` for canonical copy-start artifacts and reserve `*.sample.md` or `*.example.md` for illustrative resources.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`.

## What to avoid

- Overlapping skills that differ only slightly in wording.
- Side-effectful shell preprocessing that surprises the user or hides environmental dependencies.
- Using skills as a substitute for root repository constraints that belong in `CLAUDE.md` or rules.
