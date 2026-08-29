---
name: codex-metadata
description: Use this skill when creating, reviewing, or refreshing OpenAI Codex metadata such as AGENTS.md, .codex/config.toml, skills, subagents, hooks, and rules.
---

# Codex metadata skill

Use this skill when creating or updating:

- `AGENTS.md` and `AGENTS.override.md`
- `.codex/config.toml`
- `.agents/skills/<name>/SKILL.md` and adjacent resources
- `.codex/agents/*.toml`
- `.codex/hooks.json`
- `.codex/rules/*.rules`
- Agent-plugin command files when the selected host/plugin format supports them

## Scope

This skill consolidates current best practices and compatibility notes for OpenAI Codex metadata constructs. It complements the broader `github-copilot-metadata-authoring` capability by focusing only on Codex-native surfaces and their current platform constraints.

## How to use

1. Read `References.md` for authoritative OpenAI documentation and local research inputs.
2. Apply `BestPractices.md` when authoring or reviewing Codex metadata files.
3. Use `Compatibility.md` to avoid assuming parity with Copilot or Claude-specific constructs.
4. Use `ReflectionReinforcement.md` when promoting repeated findings into durable guidance.
5. Use the built-in `agent-skills-standard` capability for portable `SKILL.md` syntax. If a
   request for a capability or agent plugin is format-ambiguous, ask GitHub Copilot versus strict
   Agent Plugins v1 and route strict-v1 work through `agent-plugins`.

## Command compatibility

Codex-native plugins currently center on skills, agents, hooks, and MCP rather than exposing a
separate portable `commands` primitive. When a capability also targets a host with first-class
plugin commands, author the command in that host's manifest-defined `commands` directory and
keep the reusable workflow in a Codex skill. Do not assume that a Copilot or Claude slash command
automatically becomes a Codex slash command.

## Files

- `References.md`
- `BestPractices.md`
- `Compatibility.md`
- `ReflectionReinforcement.md`

## Versioning

- Last reviewed: 2026-05-22
