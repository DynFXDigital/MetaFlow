---
description: Guidance for OpenAI Codex skill folders and entrypoint files.
applyTo: '.agents/skills/**'
---

# Codex skills

## Sources and versioning
- Last reviewed: 2026-05-22
- Sources:
  - https://developers.openai.com/codex/skills

## Purpose
- Skills are Codex's first-class reusable workflow surface for instructions, templates, scripts, and references.
- Use them for deep or conditional procedures that would make `AGENTS.md` too large or too task-specific.

## Authoring guidance
- Keep one folder per skill under `.agents/skills/<skill-name>/` with a clear `SKILL.md` entrypoint.
- Use concise, high-signal descriptions so Codex can match the right skill to the task.
- Keep skill names stable and lower-case hyphenated when you control the naming.
- Store templates, scripts, and examples adjacent to the skill that owns them.
- Use `*.template.md` for canonical copy-start artifacts and reserve `*.sample.md` or `*.example.md` for illustrative resources.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`.
- Prefer deterministic scripts and portable paths inside skill resources.
- Treat skills as the Codex-native replacement for reusable prompt packs; do not invent an undocumented prompt-library layer.

## What to avoid
- Stuffing long reusable procedures into `AGENTS.md` when they should be a skill.
- Creating overlapping skills with unclear ownership boundaries.
- Coupling a skill to one repository's transient branch names, machines, or internal paths.---
description: Guidance for OpenAI Codex skill folders and entrypoint files.
applyTo: '.agents/skills/**'
---

# Codex skills

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://developers.openai.com/codex/skills

## Purpose
- Skills are Codex's first-class reusable workflow surface for instructions, templates, scripts, and references.
- Use them for deep or conditional procedures that would make `AGENTS.md` too large or too task-specific.

## Authoring guidance
- Keep one folder per skill under `.agents/skills/<skill-name>/` with a clear `SKILL.md` entrypoint.
- Use concise, high-signal descriptions so Codex can match the right skill to the task.
- Keep skill names stable and lower-case hyphenated when you control the naming.
- Store templates, scripts, and examples adjacent to the skill that owns them.
- Use `*.template.md` for canonical copy-start artifacts and reserve `*.sample.md` or `*.example.md` for illustrative resources.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`.
- Prefer deterministic scripts and portable paths inside skill resources.
- Treat skills as the Codex-native replacement for reusable prompt packs; do not invent an undocumented prompt-library layer.

## What to avoid
- Stuffing long reusable procedures into `AGENTS.md` when they should be a skill.
- Creating overlapping skills with unclear ownership boundaries.
- Coupling a skill to one repository's transient branch names, machines, or internal paths.
