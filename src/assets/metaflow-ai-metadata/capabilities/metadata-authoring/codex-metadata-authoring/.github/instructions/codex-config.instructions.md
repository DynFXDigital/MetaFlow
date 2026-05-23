---
description: Guidance for OpenAI Codex project configuration files.
applyTo: '.codex/config.toml'
---

# Codex config

## Sources and versioning
- Last reviewed: 2026-05-22
- Sources:
  - https://developers.openai.com/codex/config-basic
  - https://developers.openai.com/codex/config-reference
  - https://developers.openai.com/codex/mcp

## Purpose
- `.codex/config.toml` is Codex configuration, not the primary repository documentation surface.
- Use it for model/profile selection, sandbox and approval behavior, MCP server definitions, feature flags, and small additive instruction settings.

## Authoring guidance
- Keep the file valid TOML with explicit, reviewable sections.
- Prefer `AGENTS.md` for repo guidance and reserve `developer_instructions` for short additive defaults.
- Use `model_instructions_file` sparingly because it replaces Codex base instructions rather than layering on top.
- Keep MCP configuration explicit and stable; do not hide core tool dependencies in comments or ad hoc scripts.
- Document non-portable assumptions such as local binaries, hostnames, or required trust settings.
- Separate configuration concerns from workflow guidance; if a rule explains how to work, it likely belongs in `AGENTS.md` or a skill.

## What to avoid
- Duplicating large blocks of repo guidance from `AGENTS.md`.
- Mixing approval policy, reasoning guidance, and MCP wiring into one undocumented blob.
- Using config overrides to silently replace shared baseline behavior without justification.---
description: Guidance for OpenAI Codex project configuration files.
applyTo: '.codex/config.toml'
---

# Codex config

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://developers.openai.com/codex/config-basic
  - https://developers.openai.com/codex/config-reference
  - https://developers.openai.com/codex/mcp

## Purpose
- `.codex/config.toml` is Codex configuration, not the primary repository documentation surface.
- Use it for model/profile selection, sandbox and approval behavior, MCP server definitions, feature flags, and small additive instruction settings.

## Authoring guidance
- Keep the file valid TOML with explicit, reviewable sections.
- Prefer `AGENTS.md` for repo guidance and reserve `developer_instructions` for short additive defaults.
- Use `model_instructions_file` sparingly because it replaces Codex base instructions rather than layering on top.
- Keep MCP configuration explicit and stable; do not hide core tool dependencies in comments or ad hoc scripts.
- Document non-portable assumptions such as local binaries, hostnames, or required trust settings.
- Separate configuration concerns from workflow guidance; if a rule explains how to work, it likely belongs in `AGENTS.md` or a skill.

## What to avoid
- Duplicating large blocks of repo guidance from `AGENTS.md`.
- Mixing approval policy, reasoning guidance, and MCP wiring into one undocumented blob.
- Using config overrides to silently replace shared baseline behavior without justification.
