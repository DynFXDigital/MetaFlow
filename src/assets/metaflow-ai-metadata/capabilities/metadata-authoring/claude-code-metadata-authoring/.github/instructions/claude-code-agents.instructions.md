---
description: Guidance for Claude Code custom agent definitions.
applyTo: '.claude/agents/**/*.md'
---

# Claude Code agents

## Sources and versioning
- Last reviewed: 2026-05-22
- Sources:
  - https://code.claude.com/docs/en/sub-agents.md

## Purpose
- `.claude/agents/` defines Claude Code specialist agents as Markdown files with YAML frontmatter.
- Agents should handle focused work in isolated contexts rather than replacing repository-wide guidance.

## Authoring guidance
- Keep each agent narrow, role-specific, and explicitly named.
- Include clear `name` and `description` values that explain when Claude should delegate to the agent.
- Use `tools` and `disallowedTools` to keep the permission surface intentional.
- Use fields such as `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, and `isolation` only when the role materially needs them.
- Prefer `memory: project` for sharable persistent knowledge and reserve `user` or `local` memory scopes for personal patterns.
- Use `isolation: worktree` only when the role genuinely benefits from a separate git worktree.
- Keep the Markdown body procedural and specific; do not restate all repository instructions.

## What to avoid
- Broad catch-all agents with overlapping responsibilities.
- `bypassPermissions` unless the role truly requires it and the risk is explicit.
- Hidden repository-wide policy embedded only inside one agent.---
description: Guidance for Claude Code custom agent definitions.
applyTo: '.claude/agents/**/*.md'
---

# Claude Code agents

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://code.claude.com/docs/en/sub-agents.md

## Purpose
- `.claude/agents/` defines Claude Code specialist agents as Markdown files with YAML frontmatter.
- Agents should handle focused work in isolated contexts rather than replacing repository-wide guidance.

## Authoring guidance
- Keep each agent narrow, role-specific, and explicitly named.
- Include clear `name` and `description` values that explain when Claude should delegate to the agent.
- Use `tools` and `disallowedTools` to keep the permission surface intentional.
- Use fields such as `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, and `isolation` only when the role materially needs them.
- Prefer `memory: project` for sharable persistent knowledge and reserve `user` or `local` memory scopes for personal patterns.
- Use `isolation: worktree` only when the role genuinely benefits from a separate git worktree.
- Keep the Markdown body procedural and specific; do not restate all repository instructions.

## What to avoid
- Broad catch-all agents with overlapping responsibilities.
- `bypassPermissions` unless the role truly requires it and the risk is explicit.
- Hidden repository-wide policy embedded only inside one agent.
