---
description: 'Guidelines for Copilot prompt files (.github/prompts/*.prompt.md): structure, frontmatter, and best practices.'
applyTo: '.github/prompts/**/*.prompt.md'
---

# Copilot Prompt Files

Prompt files define reusable, task-specific prompts you invoke on demand (for example via `/name` in Copilot Chat, depending on IDE support).

## Scope
- Prompt files are for specific tasks (review, explain, scaffold, generate docs).
- Repository-wide behavior belongs in custom instructions, not prompt files.

## Required structure
- A `.prompt.md` file contains YAML frontmatter followed by a Markdown body.
- Common frontmatter keys:
  - `description`: short description shown in UI
  - `agent`: use `agent` for multi-step work
  - `model`: specify the model to use (optional, depends on environment support)
- Preferred key order:
  - Keep `name` first when applicable.
  - Keep `description` next.
  - Put execution keys (`agent`, `model`) after identity/summary keys.

Example:

---
description: Perform a comprehensive code review
agent: agent
---

- Quote YAML values only when needed (for example to avoid parsing ambiguity).

## Inputs
- Prefer explicit inputs using `${input:name:prompt}` to avoid ambiguous assumptions.
- Keep input prompts short and unambiguous.

## Best practices
- Be explicit about output format (headings, bullets, required sections).
- Include acceptance criteria when the task produces artifacts.
- Prefer constraints that reduce rework (file locations, naming, test commands).
- Keep the prompt minimal: remove background text and repetition.

## Notes
- Prompt file availability varies by environment (commonly VS Code / Visual Studio / JetBrains; preview features may change).
