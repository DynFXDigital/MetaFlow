---
description: 'Guidelines for Agent Skills (.github/skills/**/SKILL.md and .claude/skills/**/SKILL.md): layout, frontmatter, and usage.'
applyTo: '.github/skills/**/SKILL.md,.claude/skills/**/SKILL.md'
---

# Agent Skills

Agent Skills are folders of instructions, scripts, and resources that an agent can load when relevant to perform specialized tasks repeatably.

## When to use skills vs custom instructions
- Use custom instructions for small, broadly applicable repo guidance.
- Use skills for deeper, specialized procedures an agent should only load when relevant.

## Repository layout
- Create skills under `.github/skills/<skill-name>/`.
- Skills under `.claude/skills/<skill-name>/` are also supported.
- `<skill-name>` should be lowercase and use hyphens (kebab-case).

## Required `SKILL.md`
- Skill files must be named exactly `SKILL.md`.
- `SKILL.md` must have YAML frontmatter:
  - `name` (required): lowercase, hyphen-separated unique identifier
  - `description` (required): when the agent should use the skill
  - `license` (optional): license applying to the skill content
- The Markdown body should contain the procedure, constraints, and examples.

## Optional resources
- Add scripts, sample data, or templates in the same skill directory.
- Keep scripts narrow and deterministic; prefer the repo’s existing tooling.

## How skills are applied
- Agents decide to use a skill based on your prompt plus the skill’s `description`.
- When used, `SKILL.md` is injected into the agent’s context.
