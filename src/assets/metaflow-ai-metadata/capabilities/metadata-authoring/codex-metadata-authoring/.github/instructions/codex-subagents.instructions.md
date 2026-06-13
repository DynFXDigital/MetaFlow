---
description: Guidance for OpenAI Codex custom subagent definitions.
applyTo: '.codex/agents/**/*.toml'
---

# Codex subagents

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources:
    - https://developers.openai.com/codex/subagents

## Purpose

- `.codex/agents/*.toml` defines explicit specialist subagents for Codex.
- These files are structured configuration, not Markdown personas.

## Authoring guidance

- Keep each subagent narrow, role-specific, and explicitly named.
- Include a clear `name`, `description`, and `developer_instructions` payload.
- Use optional overrides such as model, sandbox, approval, MCP, or skill selection only when the role materially needs them.
- Keep subagents complementary to `AGENTS.md` and skills rather than using them as a substitute for either.
- Prefer explicit specialist workflows such as reviewer, planner, or docs maintainer over generic catch-all agents.

## What to avoid

- Recreating the entire repository instruction set inside each subagent.
- Creating overlapping agents that differ only by minor wording.
- Hiding repository-wide policy in subagent-specific overrides.