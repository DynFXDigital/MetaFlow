# Codex metadata compatibility notes

Last reviewed: 2026-03-28

## Instruction files
Source: https://developers.openai.com/codex/guides/agents-md

- Codex loads a global `~/.codex/AGENTS.md` and then repository/folder `AGENTS.md` files from root to the current working directory.
- More local files are appended later and therefore win on conflicts.
- `AGENTS.override.md` is supported for more local overrides.

## Config
Sources: https://developers.openai.com/codex/config-basic, https://developers.openai.com/codex/config-reference

- `.codex/config.toml` is the Codex configuration surface for project-scoped behavior.
- `developer_instructions` adds instructions before `AGENTS.md`.
- `model_instructions_file` replaces Codex built-in base instructions and should be treated as a heavy override.
- Project-scoped config is only applied for trusted projects.

## Skills
Source: https://developers.openai.com/codex/skills

- Repository-local skills live under `.agents/skills/`.
- Skills can be invoked explicitly or selected implicitly based on their descriptions.
- Based on the current official Codex documentation reviewed for this capability, no separate repository-native prompt library is documented; skills are the closest supported reusable workflow surface.

## Subagents
Source: https://developers.openai.com/codex/subagents

- Codex custom agents are explicit structured definitions under `.codex/agents/*.toml`.
- They are not auto-loaded repository instructions; they are specialist workers used when explicitly spawned.

## Hooks
Source: https://developers.openai.com/codex/hooks

- Hooks are documented as experimental.
- As of 2026-03-28, official Codex documentation states that Windows support is temporarily disabled.

## Rules and MCP
Sources: https://developers.openai.com/codex/rules, https://developers.openai.com/codex/mcp

- Approval rules are a separate governance surface from repo instructions.
- MCP server configuration lives in `.codex/config.toml`, not in `AGENTS.md`.
