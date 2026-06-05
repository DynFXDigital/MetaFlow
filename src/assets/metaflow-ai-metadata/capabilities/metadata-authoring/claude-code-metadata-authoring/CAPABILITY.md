---
uid: 5b3bbb8c-6715-498b-8ed8-f905dd82735c
name: Claude Code Metadata Authoring
description: Standards and workflows support authoring, reviewing, and maintaining Claude Code metadata constructs.
license: SEE-LICENSE-IN-REPO
agentPlugin: true
---

# Capability: Claude Code Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for Anthropic Claude Code repository metadata.

## Primary Concern

Claude Code-native metadata quality, structure, compatibility, and promotion readiness.

## Use This Capability When

- a repository needs Claude Code-specific metadata conventions for rules, skills, agents, settings, hooks, or MCP configuration
- authoring work needs Claude-specific metadata guidance without widening into generic product-policy ownership
- a task needs the deeper `claude-code-metadata` skill, steward agent, or refresh prompt instead of expanding layer-1 prose

## In Scope

- `CLAUDE.md` and `.claude/CLAUDE.md` layering, imports, and nested instruction guidance
- `.claude/rules/` authoring guidance for unconditional and path-scoped rules
- `.claude/skills/` authoring guidance for reusable Claude Code workflows
- `.claude/agents/` authoring guidance for explicit specialist agents
- `.claude/settings.json` and `.claude/settings.local.json` guidance for permissions, hooks, environment variables, and settings hierarchy
- `.mcp.json` guidance for Claude Code MCP server configuration
- Claude-specific compatibility notes, references, refresh workflows, and auto-memory guidance

## Non-Goals

- GitHub Copilot-specific metadata authoring rules that belong in `github-copilot-metadata-authoring`
- Codex-specific metadata authoring rules that belong in `codex-metadata-authoring`
- Product-specific runtime behavior outside Claude Code metadata surfaces
- Repository-specific business policy ownership

## Must-Follow Constraints

- Keep always-on Claude Code metadata focused on scope, boundaries, and must-follow rules.
- Push long procedures, examples, compatibility notes, and auto-memory detail into the `claude-code-metadata` skill and support docs.
- Keep Claude-specific ownership separate from GitHub Copilot, Codex, and repository-specific business policy.

## Load For Detail

- Load `.github/skills/claude-code-metadata/SKILL.md` for the full authoring workflow.
- Use `.github/skills/claude-code-metadata/BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md` for second-layer detail.
- Use `.github/agents/claude-code-metadata-authoring-steward.agent.md` and `.github/prompts/claude-code-metadata-authoring-refresh-online-guidance.prompt.md` for source-backed review or refresh work.

## Ownership Boundaries

- Owns Claude Code-specific authoring guidance for instruction files, rules, skills, agents, settings, hooks, MCP, and memory usage patterns
- Does not own generic `.github/` metadata conventions or non-Claude platform guidance

## Composition Notes

- Compose with `github-copilot-metadata-authoring` when a repository maintains both GitHub Copilot and Claude Code metadata and wants clear tool-specific boundaries.
- Compose with `codex-metadata-authoring` when a repository maintains both Codex and Claude Code metadata and wants shared promotion patterns.
- Compose with `model-role-guidance` when agent, skill, or settings authoring needs source-backed role-to-model defaults and override guidance.
- Compose with `reflection` when durable memory captures or planning retrospectives should become Claude Code metadata improvements.
- Compose with `devtools` for shared shell, validation, and temp-artifact handling conventions.---
  name: Claude Code Metadata Authoring
  description: Standards and workflows support authoring, reviewing, and maintaining Claude Code metadata constructs.
  license: SEE-LICENSE-IN-REPO

---

# Capability: Claude Code Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for Anthropic Claude Code repository metadata.

## Primary Concern

Claude Code-native metadata quality, structure, compatibility, and promotion readiness.

## Authoring stance

- Always-on metadata surfaces should stay minimal.
- Main instruction files should carry trigger conditions, scope, precedence, and must-follow constraints first.
- Detailed procedures, examples, edge cases, and long workflows should be progressively loaded from support docs, skills, agents, or prompt bodies only when needed.
- Repeated procedural detail across always-on files is a metadata smell unless the duplication is required for enforcement.

## In Scope

- `CLAUDE.md` and `.claude/CLAUDE.md` layering, imports, and nested instruction guidance
- `.claude/rules/` authoring guidance for unconditional and path-scoped rules
- `.claude/skills/` authoring guidance for reusable Claude Code workflows
- `.claude/agents/` authoring guidance for explicit specialist agents
- `.claude/settings.json` and `.claude/settings.local.json` guidance for permissions, hooks, environment variables, and settings hierarchy
- `.mcp.json` guidance for Claude Code MCP server configuration
- Claude-specific compatibility notes, references, refresh workflows, and auto-memory guidance

## Non-Goals

- GitHub Copilot-specific metadata authoring rules that belong in `github-copilot-metadata-authoring`
- Codex-specific metadata authoring rules that belong in `codex-metadata-authoring`
- Product-specific runtime behavior outside Claude Code metadata surfaces
- Repository-specific business policy ownership

## Included Metadata

- `.github/instructions/claude-code-claude-md.instructions.md`
- `.github/instructions/claude-code-rules.instructions.md`
- `.github/instructions/claude-code-skills.instructions.md`
- `.github/instructions/claude-code-agents.instructions.md`
- `.github/instructions/claude-code-settings.instructions.md`
- `.github/instructions/claude-code-mcp.instructions.md`
- `.github/prompts/claude-code-metadata-authoring-refresh-online-guidance.prompt.md`
- `.github/agents/claude-code-metadata-authoring-steward.agent.md`
- `.github/skills/claude-code-metadata/**`

## Reuse and Portability

- Designed for cross-repository Claude Code metadata reuse and review
- Anchors behavior claims to authoritative Anthropic Claude Code documentation
- Treats auto memory as machine-local accumulated learning, not as a substitute for committed repository metadata

## Ownership Boundaries

- Owns Claude Code-specific authoring guidance for instruction files, rules, skills, agents, settings, hooks, MCP, and memory usage patterns
- Does not own generic `.github/` metadata conventions or non-Claude platform guidance

## Composition Notes

- Compose with `github-copilot-metadata-authoring` when a repository maintains both GitHub Copilot and Claude Code metadata and wants clear tool-specific boundaries
- Compose with `codex-metadata-authoring` when a repository maintains both Codex and Claude Code metadata and wants shared promotion patterns
- Compose with `reflection` when durable memory captures or planning retrospectives should become Claude Code metadata improvements
- Compose with `devtools` for shared shell, validation, and temp-artifact handling conventions

## Adjacent Capabilities

- `github-copilot-metadata-authoring`: owns GitHub Copilot metadata authoring standards and reusable promotion mechanics.
- `codex-metadata-authoring`: owns Codex metadata authoring standards and reusable promotion mechanics.
- `reflection`: owns reusable durable-memory capture, backend-aware memory maintenance, and proposal-first reinforcement rules.
- `devtools`: owns general command execution and tool workflow guidance outside Claude Code-specific metadata.
