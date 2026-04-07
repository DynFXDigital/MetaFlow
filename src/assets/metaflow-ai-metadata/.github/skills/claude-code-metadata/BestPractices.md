# Claude Code metadata best practices

Last reviewed: 2026-03-28

## Instruction files (`CLAUDE.md` and imports)
Sources: https://code.claude.com/docs/en/memory.md, https://code.claude.com/docs/en/settings.md

- Use repository-root `CLAUDE.md` or `.claude/CLAUDE.md` as the primary Claude Code instruction entry point.
- Keep the root file routing-oriented and concise.
- Use `@path/to/file` imports for modular organization rather than one monolithic file.
- Keep nested `CLAUDE.md` files delta-only and specific to the subtree that needs them.
- Use `claudeMdExcludes` in settings when a monorepo needs to suppress irrelevant instruction files.

## Rules (`.claude/rules/`)
Source: https://code.claude.com/docs/en/memory.md

- Use rules for constraints, conventions, and domain knowledge rather than multi-step procedures.
- Rules without `paths` load unconditionally; rules with `paths:` load on demand for matching files.
- Keep path globs tight and keep one clear domain per rule file.
- Translate Copilot-style path-specific instructions into rules when Claude-native conditional loading is the goal.

## Skills (`.claude/skills/`)
Source: https://code.claude.com/docs/en/skills.md

- Use skills for reusable workflows, templates, and references that should not live in `CLAUDE.md` or rules.
- Keep `description` high-signal because discovery is description-driven.
- Use `disable-model-invocation: true` for side-effectful workflows.
- Use shell preprocessing only when it is deterministic and materially improves the skill.
- Keep supporting scripts and examples next to the owning skill.

## Template, sample, and example naming

- Use `*.template.md` for canonical copy-start artifacts.
- Use `*.sample.md` or `*.example.md` only when the file is illustrative rather than the preferred starting point.
- Do not mix `template`, `sample`, and `example` naming for artifacts that serve the same role inside one capability family.
- When a template represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md` or `MILESTONE.template.md`.
- Update supporting references and prompts in the same change when template names move.

## Agents (`.claude/agents/`)
Source: https://code.claude.com/docs/en/sub-agents.md

- Keep agents narrow, tool-constrained, and specific about when they should be used.
- Use `memory`, `skills`, `mcpServers`, and `isolation` only when the role truly benefits from them.
- Prefer readable Markdown bodies over dense configuration-heavy prompts.
- Avoid `bypassPermissions` unless the risk is explicit and justified.

## Settings and hooks (`.claude/settings*.json`)
Sources: https://code.claude.com/docs/en/settings.md, https://code.claude.com/docs/en/hooks.md, https://code.claude.com/docs/en/hooks-guide.md

- Use `.claude/settings.json` for team-shared permissions, hooks, environment variables, and default behavior.
- Use `.claude/settings.local.json` for personal overrides and keep it out of shared policy.
- Prefer explicit `permissions.allow` and `permissions.deny` rules over implicit social conventions.
- Claude Code hooks are production-ready on Windows; invest in them where lifecycle automation materially helps.
- Keep hooks deterministic, auditable, and bounded in scope.

## MCP and memory
Sources: https://code.claude.com/docs/en/mcp.md, https://code.claude.com/docs/en/memory.md

- Use `.mcp.json` for shared Claude Code MCP server configuration and environment-variable indirection for secrets.
- Treat auto memory as machine-local accumulated learning, not as a replacement for committed repository metadata.
- Keep committed instructions and machine-local memory solving different problems.
