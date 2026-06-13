# Codex metadata best practices

Last reviewed: 2026-03-28

## Instruction files (`AGENTS.md` and `AGENTS.override.md`)
Sources: https://developers.openai.com/codex/guides/agents-md, https://developers.openai.com/codex/config-basic

- Use repository-root `AGENTS.md` as the primary Codex instruction entry point.
- Keep root `AGENTS.md` thin, routing-oriented, and focused on durable repo rules.
- Use nested `AGENTS.md` or `AGENTS.override.md` only when a subtree needs a genuine delta.
- Keep local override files delta-only; do not duplicate the root document.
- Prefer exact commands, stable paths, and terminology guardrails over narrative prose.
- Move large reusable procedures into `.agents/skills/` instead of expanding `AGENTS.md` indefinitely.

## Config (`.codex/config.toml`)
Sources: https://developers.openai.com/codex/config-basic, https://developers.openai.com/codex/config-reference, https://developers.openai.com/codex/mcp

- Treat `.codex/config.toml` as configuration, not the primary repository documentation surface.
- Use `developer_instructions` only for short additive defaults that complement `AGENTS.md`.
- Use `model_instructions_file` sparingly because it replaces Codex base instructions.
- Keep MCP, approval, sandbox, and profile settings explicit and reviewable.
- Document non-portable local assumptions rather than burying them in opaque config.

## Skills (`.agents/skills/`)
Source: https://developers.openai.com/codex/skills

- Use skills for reusable workflows, templates, scripts, and references that should not live in `AGENTS.md`.
- Keep one folder per skill with a clear `SKILL.md` entrypoint.
- Keep skill descriptions task-shaped and specific enough for deliberate selection.
- Store scripts and examples adjacent to the owning skill and keep them deterministic.
- Treat skills as the closest Codex-native replacement for reusable prompt packs.

## Template, sample, and example naming

- Use `*.template.md` for canonical copy-start artifacts.
- Use `*.sample.md` or `*.example.md` only when the file is illustrative rather than the preferred starting point.
- Do not mix `template`, `sample`, and `example` naming for artifacts that fill the same role inside one capability family.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md` or `FEATURE.template.md`.
- Rename references, prompts, and instructions in the same change when a template naming convention is updated.

## Subagents (`.codex/agents/*.toml`)
Source: https://developers.openai.com/codex/subagents

- Use explicit subagents for narrow specialist roles rather than general repository guidance.
- Keep `name`, `description`, and `developer_instructions` clear and non-overlapping.
- Use model, sandbox, approval, MCP, and skill overrides only when the specialist role truly needs them.
- Keep subagents complementary to `AGENTS.md` and skills instead of duplicating either layer.

## Hooks (`.codex/hooks.json`)
Source: https://developers.openai.com/codex/hooks

- Treat hooks as optional lifecycle automation rather than foundational workflow infrastructure.
- Keep hook logic fast, deterministic, and easy to disable.
- Do not rely on hooks for primary Windows workflows while official Windows support remains disabled.

## Rules (`.codex/rules/*.rules`)
Source: https://developers.openai.com/codex/rules

- Keep rules focused on approval and command-governance policy.
- Prefer small, auditable rules over broad wildcard patterns.
- Do not hide repository reasoning or style guidance inside rules.
