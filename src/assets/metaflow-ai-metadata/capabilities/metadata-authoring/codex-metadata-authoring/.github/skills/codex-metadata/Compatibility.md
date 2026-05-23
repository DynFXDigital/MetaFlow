# Codex metadata compatibility notes

Last reviewed: 2026-05-22

## Instruction files
Source: https://developers.openai.com/codex/guides/agents-md

- Codex loads a global `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`, then repository/folder `AGENTS.override.md`, `AGENTS.md`, and any configured fallback filenames from root to the current working directory.
- More local files are appended later and therefore win on conflicts.
- Codex includes at most one instruction file per directory and stops when the combined project instruction chain reaches `project_doc_max_bytes` (32 KiB by default).

## Config
Sources: https://developers.openai.com/codex/config-basic, https://developers.openai.com/codex/config-reference

- `.codex/config.toml` is the Codex configuration surface for project-scoped behavior.
- `developer_instructions` adds instructions before `AGENTS.md`.
- `model_instructions_file` replaces Codex built-in base instructions and should be treated as a heavy override.
- Project-scoped config is only applied for trusted projects.
- Project-scoped config cannot override machine-local provider, auth, notification, profile, or telemetry routing keys such as `model_provider`, `model_providers`, `notify`, `profile`, `profiles`, `openai_base_url`, or `otel`.
- `approval_policy = "on-failure"` is deprecated; use `on-request`, `never`, or granular approval controls.

## Skills
Source: https://developers.openai.com/codex/skills

- Repository-local skills live under `.agents/skills/`, discovered from the current directory up to the repository root.
- Codex also supports user, admin, and bundled system skill locations.
- Skills can be invoked explicitly or selected implicitly based on their descriptions.
- Skills can ship optional `agents/openai.yaml` metadata for UI display, implicit-invocation policy, and declared tool dependencies.
- Based on the current official Codex documentation reviewed for this capability, no separate repository-native prompt library is documented; skills are the closest supported reusable workflow surface.

## Subagents
Source: https://developers.openai.com/codex/subagents

- Codex custom agents are explicit structured definitions under `.codex/agents/*.toml`.
- They are not auto-loaded repository instructions; current Codex docs say subagents run when you explicitly ask Codex to spawn them.

## Hooks
Source: https://developers.openai.com/codex/hooks

- Hooks are enabled by default and can live in either `hooks.json` or inline `[hooks]` tables next to active config layers.
- Project-local hooks load only when the project `.codex/` layer is trusted.
- Non-managed hooks require trust review before they run.
- Current Codex releases run command hooks only; prompt and agent hook handlers are parsed but skipped.

## Rules and MCP
Sources: https://developers.openai.com/codex/rules, https://developers.openai.com/codex/mcp

- Approval rules are a separate governance surface from repo instructions.
- Rules remain experimental.
- MCP server configuration lives in `.codex/config.toml`, not in `AGENTS.md`.
- Codex now documents streamable HTTP as the preferred remote MCP transport; SSE is deprecated where HTTP is available.

## Plugins
Source: https://developers.openai.com/codex/plugins/build

- Codex plugins use `.codex-plugin/plugin.json` as the required manifest entry point.
- Plugin manifest component paths are relative to the plugin root and should start with `./`.
- Repo or personal local marketplaces live at `.agents/plugins/marketplace.json`.
- Current plugin packaging guidance documents skills, MCP server config, apps, and hooks as bundled component surfaces; do not assume Copilot instructions or agents can be repackaged as Codex plugin rules or subagents.# Codex metadata compatibility notes

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
