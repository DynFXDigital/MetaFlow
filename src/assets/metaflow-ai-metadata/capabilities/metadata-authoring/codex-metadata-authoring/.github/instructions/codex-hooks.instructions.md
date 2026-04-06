---
description: Guidance for OpenAI Codex hook configuration files.
applyTo: '.codex/hooks.json'
---

# Codex hooks

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://developers.openai.com/codex/hooks

## Current platform status
- Codex hooks are experimental.
- As of 2026-03-28, official Codex documentation states that Windows support is temporarily disabled.

## Authoring guidance
- Treat hooks as optional automation around lifecycle events such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`.
- Do not make a repository's primary workflow depend on hooks when the target environment is Windows-heavy.
- Keep hook behavior fast, deterministic, and easy to disable during debugging.
- Use hooks for validation, annotation, or guardrails, not as the primary source of repository knowledge.
- Ensure a non-hook fallback exists for any important safety check or setup step.

## What to avoid
- Building foundational Windows workflows on top of hooks while platform support is unavailable.
- Hiding business-critical policy exclusively inside hook behavior.
- Treating hook configuration as a substitute for `AGENTS.md`, skills, or rules.
