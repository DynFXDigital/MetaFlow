---
description: 'Guidelines for GitHub Copilot repo-wide and path-specific custom instructions.'
applyTo: '.github/copilot-instructions.md,.github/instructions/**/*.instructions.md'
---

# GitHub Copilot Instructions

Use GitHub Copilot custom instructions for compact, enforceable repository guidance.

## Repo-wide Copilot instructions

Use `.github/copilot-instructions.md` for broad repo context and defaults.

Include:

- What the repo builds and how to validate changes.
- Key directories and where common work happens.
- Build, test, and run order with exact commands.
- Stable conventions and always/never rules.

Avoid:

- One-off task instructions.
- Long background narratives.
- Vague style demands that fight other instruction layers.
- Full procedures that belong in skills, prompts, or support docs.

## Path-specific Copilot instructions

Use `.github/instructions/**/NAME.instructions.md` for targeted, directory- or file-type-specific guidance.

Required frontmatter:

- `description`: short, specific summary.
- `applyTo`: comma-separated glob pattern string.

Scoping rules:

- Keep `applyTo` tight; only include rules that apply to matched files.
- Put the most review-critical constraints near the top.
- Keep broad scopes compact and route deeper workflow detail to nearby skills or support docs.
- Avoid contradictions with `.github/copilot-instructions.md` and the closest `AGENTS.md`.

For deeper compatibility guidance and reusable patterns, load `../skills/ai-metadata/SKILL.md` and its support docs.
