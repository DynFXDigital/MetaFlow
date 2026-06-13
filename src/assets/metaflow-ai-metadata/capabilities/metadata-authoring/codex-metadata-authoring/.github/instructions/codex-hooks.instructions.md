---
description: Guidance for OpenAI Codex hook configuration files.
applyTo: '.codex/hooks.json'
---

# Codex hooks

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources:
    - https://developers.openai.com/codex/hooks

## Current platform status

- Hooks are enabled by default.
- Current official Codex docs document command hooks as the active runtime path; prompt and agent hook handlers are parsed but skipped.
- Non-managed hooks must be reviewed and trusted before they run.

## Authoring guidance

- Treat hooks as optional automation around lifecycle events such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `PreCompact`, and `Stop`.
- Prefer either `.codex/hooks.json` or inline `[hooks]` in `config.toml` per config layer rather than mixing both in one layer.
- Use git-root-stable command paths for repo-local hooks so they keep working when Codex starts from a subdirectory.
- Keep hook behavior fast, deterministic, and easy to disable during debugging.
- Use hooks for validation, annotation, or guardrails, not as the primary source of repository knowledge.
- Ensure a non-hook fallback exists for any important safety check or setup step.

## What to avoid

- Assuming prompt or agent hook handlers execute today just because the config parser accepts them.
- Assuming project-local hooks will run before the user trusts the project-local `.codex/` layer and the hook definition itself.
- Hiding business-critical policy exclusively inside hook behavior.
- Treating hook configuration as a substitute for `AGENTS.md`, skills, or rules.