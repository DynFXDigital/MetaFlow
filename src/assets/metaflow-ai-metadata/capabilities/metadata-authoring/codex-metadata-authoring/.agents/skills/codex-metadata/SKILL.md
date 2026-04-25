---
name: codex-metadata
description: Author and review Codex repository metadata including AGENTS.md, project config, repository skills, subagents, hooks, and rules.
---

# Codex Metadata

## Use When

- A repository needs Codex-native instructions, skills, subagents, hooks, rules, or project config.
- Existing Copilot or Claude metadata needs a Codex-compatible equivalent.
- A shared MetaFlow capability should be checked for Codex portability.

## Authoring Rules

- Keep `AGENTS.md` concise and focused on scope, precedence, and must-follow repository rules.
- Put detailed workflows in `.agents/skills/<skill-name>/SKILL.md` rather than expanding always-on instructions.
- Put project-local Codex configuration under `.codex/config.toml` only when the setting should travel with the repository and the project is trusted.
- Put reusable repository skills under `.agents/skills/`.
- Put custom subagent definitions under `.codex/agents/*.toml` when a task needs explicit specialist agents.
- Put command governance rules under `.codex/rules/*.rules`.
- Put hooks under `.codex/hooks.json` or inline config only after verifying current platform support and local operating-system constraints.

## Review Checklist

- The metadata has a clear owner and scope.
- Always-on text is short enough to stay useful in every session.
- Long examples and procedural detail are progressively loaded through skills or prompts.
- Codex-specific rules are not mixed into GitHub Copilot or Claude-only metadata files.
- Platform-specific claims have been checked against current official OpenAI Codex documentation.

## MetaFlow Portability Notes

- MetaFlow currently supports `.agents/skills/**` as root-relative synchronized Codex metadata.
- Root `AGENTS.md`, `.codex/config.toml`, `.codex/agents`, hooks, and rules require explicit conflict-safe support before automatic materialization.
- Until root-relative support is complete, hand-author high-risk Codex metadata in the consuming repository.
