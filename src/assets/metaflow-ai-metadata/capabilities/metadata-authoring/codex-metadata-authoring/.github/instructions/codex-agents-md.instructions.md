---
description: Guidance for OpenAI Codex instruction files and local overrides.
applyTo: '**/AGENTS.md,**/AGENTS.override.md'
---

# Codex instruction files

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://developers.openai.com/codex/guides/agents-md
  - https://developers.openai.com/codex/config-basic

## Scope and precedence
- `AGENTS.md` is the primary repository instruction surface for Codex.
- Codex layers instructions from global scope to repository scope to nested folder scope.
- More local files take precedence when they conflict with broader guidance.
- Use `AGENTS.override.md` only for narrow local deltas that must sit close to the affected subtree.

## Authoring guidance
- Keep the repository-root `AGENTS.md` thin, stable, and routing-oriented.
- Put durable repo invariants, terminology, exact commands, and navigation pointers in the root file.
- Use nested `AGENTS.md` or `AGENTS.override.md` files only when a subtree genuinely needs different constraints.
- Keep local override files delta-only; do not restate the full root policy.
- Use repository-relative paths and exact commands so instructions stay portable and testable.
- Move long, reusable workflows into `.agents/skills/` instead of bloating `AGENTS.md`.
- Do not use `AGENTS.md` as a substitute for `.codex/config.toml`, `.codex/agents/`, `.codex/hooks.json`, or `.codex/rules/`.

## What to avoid
- Repeating the same rule in root and nested instruction files.
- Embedding operational configuration that belongs in `.codex/config.toml`.
- Turning override files into general documentation hubs.
