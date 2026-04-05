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
- Prefer `.github/skills/<skill-name>/` for repository-shared skills that work across GitHub Copilot and VS Code.
- Skills under `.claude/skills/<skill-name>/` are also supported.
- `<skill-name>` should be lowercase and use hyphens (kebab-case), and should match the skill `name` field.
- Personal skills (shared across projects) can be stored in `~/.copilot/skills/<skill-name>/`.

## Required `SKILL.md`
- Skill files must be named exactly `SKILL.md`.
- `SKILL.md` must have YAML frontmatter:
  - `name` (required): lowercase, hyphen-separated unique identifier
  - `description` (required): when the agent should use the skill
  - `license` (optional): license applying to the skill content
- Preferred frontmatter order: `name`, `description`, then optional keys such as `license`.
- Keep the core frontmatter portable: GitHub documentation treats `name`, `description`, and optional `license` as the cross-surface contract.
- VS Code also supports optional `argument-hint`, `user-invocable`, and `disable-model-invocation` fields; only add them when IDE-specific invocation behavior is intentional.
- Quote values only when needed for YAML parsing clarity.
- The Markdown body should front-load trigger conditions, scope, and the core workflow; move long examples, edge cases, and reference-heavy detail into sibling support docs when practical.

## Optional resources
- Add scripts, sample data, or templates in the same skill directory.
- Add support docs such as `Workflow.md`, `BestPractices.md`, `Compatibility.md`, or `References.md` when they let `SKILL.md` stay concise without losing important detail.
- Do not split a simple, linear operating pattern into a separate `Workflow.md` by default; keep it in `SKILL.md` unless the extra file materially reduces complexity.
- Keep scripts narrow and deterministic; prefer the repo’s existing tooling.
- Use `*.template.md` for canonical copy-start artifacts and reserve `*.sample.md` or `*.example.md` for illustrative resources.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`.
- Keep one naming convention per skill resource family and update all references together when the convention changes.

## Skill-local reference material
- If a skill keeps local converted copies or curated notes for external information, prefer a dedicated `references/` folder inside the skill.
- Use `references/INDEX.md` as the canonical inventory file for that folder.
- Put source tracking in YAML frontmatter rather than duplicating it in trailing note sections.
- Keep reference-file bodies concise and content-focused.
- Use `README.md` for folder usage guidance and `INDEX.md` for the actual reference inventory.

## How skills are applied
- Agents decide to use a skill based on your prompt plus the skill’s `description`.
- When used, `SKILL.md` is injected into the agent’s context.
- Keep the first lines of the body high-signal because discovery starts from frontmatter and then loads the body progressively.