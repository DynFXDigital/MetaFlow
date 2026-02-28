---
description: Guidance for GitHub Copilot custom agent profiles stored in .github/agents.
applyTo: '.github/agents/**/*.agent.md'
---

# Custom Agents (.github/agents)

This repository defines GitHub Copilot custom agents in `.github/agents/`.

## File layout
- Agent profile files must live under `.github/agents/`.
- File naming: `kebab-case.agent.md` (for example: `release-manager.agent.md`).

## Required YAML frontmatter
- Files must begin with YAML frontmatter (first line is `---`).
- `description` is required.

## Recommended YAML frontmatter
- `name`: use a human-friendly display name (Title Case, spaces allowed) that matches the role.
- Preferred order: `name`, `description`, then optional execution keys (`tools`, `infer`, etc.).
- Keep the filename `kebab-case.agent.md` for consistency and deduplication.
- `infer`: set `infer: false` unless you explicitly want auto-selection.
- `tools`: prefer GitHub-supported tool aliases for portability.
- Quote values only when needed for YAML parsing clarity.

Example:

---
name: Release Manager
description: Prepares releases with semver, changelog, announcements, and rollback notes
tools: ["read", "search", "edit", "github/*"]
infer: false
---

## Tools guidance
- Prefer these portable tool aliases: `read`, `search`, `edit`, `execute`, and `github/*`.
- Unrecognized tool names are ignored by Copilot, but avoid relying on product-specific names unless needed.
- If the agent should not change code, explicitly say so in the prompt and omit `edit`/`execute`.

## Prompt content guidance
- Keep scope tight and role-specific.
- Use repository-relative paths (for example `.ai/docs/...`, `doc/...`, `.issues/...`).
- Avoid contradicting `.github/copilot-instructions.md` and any path-scoped instruction files.
- Keep the prompt under 30,000 characters.
