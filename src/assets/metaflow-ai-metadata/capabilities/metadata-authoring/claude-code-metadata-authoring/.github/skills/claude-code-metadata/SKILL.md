---
name: claude-code-metadata
description: Use this skill when creating, reviewing, or refreshing Claude Code metadata such as CLAUDE.md, rules, skills, agents, settings, hooks, and MCP configuration.
---

# Claude Code metadata skill

Use this skill when creating or updating:

- `CLAUDE.md` and `.claude/CLAUDE.md`
- `.claude/rules/**/*.md`
- `.claude/skills/<name>/SKILL.md` and adjacent resources
- `.claude/agents/**/*.md`
- `.claude/settings.json` and `.claude/settings.local.json`
- `.mcp.json`
- Claude-compatible plugin command files when the selected plugin format supports them

## Scope

This skill consolidates current best practices and compatibility notes for Anthropic Claude Code metadata constructs. It complements the `github-copilot-metadata-authoring` and `codex-metadata-authoring` capabilities by focusing only on Claude Code-native surfaces and their current platform behavior.

## How to use

1. Read `References.md` for authoritative Anthropic documentation and local research inputs.
2. Apply `BestPractices.md` when authoring or reviewing Claude Code metadata files.
3. Use `Compatibility.md` to avoid assuming parity with GitHub Copilot or Codex-specific constructs.
4. Use `ReflectionReinforcement.md` when promoting repeated findings into durable guidance.
5. Use the built-in `agent-skills-standard` capability for portable `SKILL.md` syntax. If a
   request for a capability or agent plugin is format-ambiguous, ask GitHub Copilot versus strict
   Agent Plugins v1 and route strict-v1 work through `agent-plugins`.

## Command compatibility

Keep slash-command entry points explicit and user-invoked where possible. Treat a command as a
host/plugin component with its own filename and frontmatter; keep reusable procedures in a skill.
Verify the selected Claude plugin manifest and command directory before assuming parity with
Copilot or Codex, and never infer portability from a matching command filename alone.

## Files

- `References.md`
- `BestPractices.md`
- `Compatibility.md`
- `ReflectionReinforcement.md`

## Versioning

- Last reviewed: 2026-05-22
