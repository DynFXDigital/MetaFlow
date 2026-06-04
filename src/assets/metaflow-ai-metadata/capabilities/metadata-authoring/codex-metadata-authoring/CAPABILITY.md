---
uid: ccf8bd0b-f27b-4f96-8916-8dcdacd63f3c
name: Codex Metadata Authoring
description: Standards and workflows support authoring, reviewing, and maintaining OpenAI Codex metadata constructs.
license: SEE-LICENSE-IN-REPO
agentPlugin: true
---

# Capability: Codex Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for OpenAI Codex repository metadata.

## Primary Concern

Codex-native metadata quality, structure, compatibility, and promotion readiness.

## Use This Capability When

- a repository needs Codex-specific metadata conventions for instructions, config, skills, subagents, hooks, or rules
- authoring work needs Codex metadata guidance without widening into generic product-policy ownership
- a task needs the deeper `codex-metadata` skill, steward agent, or refresh prompt instead of expanding layer-1 prose

## In Scope

- `AGENTS.md` and `AGENTS.override.md` layering and authoring guidance
- `.codex/config.toml` configuration guidance for instructions, MCP, approval, and sandbox policy
- `.agents/skills/` authoring guidance for reusable Codex workflows
- `.codex/agents/*.toml` authoring guidance for explicit specialist subagents
- `.codex/hooks.json` guidance, including current platform constraints
- `.codex/rules/*.rules` guidance for approval and command-governance policy
- `.codex-plugin/plugin.json` guidance for packaging Codex plugin bundles
- Codex-specific compatibility notes, references, and refresh workflows

## Non-Goals

- GitHub Copilot-specific metadata authoring rules that belong in `github-copilot-metadata-authoring`
- Claude Code-specific metadata authoring rules that belong in `claude-code-metadata-authoring`
- Product-specific runtime behavior outside Codex metadata surfaces
- Repository-specific business policy ownership

## Must-Follow Constraints

- Keep always-on Codex metadata focused on scope, boundaries, and must-follow rules.
- Push long procedures, examples, platform caveats, and refresh detail into the `codex-metadata` skill and support docs.
- Keep Codex-specific ownership separate from GitHub Copilot, Claude Code, and repository-specific business policy.

## Load For Detail

- Load `.github/skills/codex-metadata/SKILL.md` for the full authoring workflow.
- Prefer `.agents/skills/codex-metadata/SKILL.md` when synchronizing the skill into a Codex-consuming repository.
- Use `.github/skills/codex-metadata/BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md` for second-layer detail.
- Use `.github/agents/codex-metadata-authoring-steward.agent.md` and `.github/prompts/codex-metadata-authoring-refresh-online-guidance.prompt.md` for source-backed review or refresh work.
- Use `.codex/config.toml` and `.codex/agents/codex-metadata-authoring-steward.toml` when a Codex-consuming repository should receive Codex-native routing and specialist review metadata.

## Included Metadata

- `.github/instructions/codex-*.instructions.md`
- `.github/skills/codex-metadata/**`
- `.github/agents/codex-metadata-authoring-steward.agent.md`
- `.github/prompts/codex-metadata-authoring-refresh-online-guidance.prompt.md`
- `.agents/skills/codex-metadata/**`
- `.codex/config.toml`
- `.codex/agents/codex-metadata-authoring-steward.toml`

## Ownership Boundaries

- Owns Codex-specific authoring guidance for instruction files, config, skills, subagents, hooks, and rules
- Does not own generic `.github/` metadata conventions or non-Codex platform guidance

## Composition Notes

- Compose with `github-copilot-metadata-authoring` when a repository maintains both GitHub Copilot and Codex metadata and wants shared promotion patterns.
- Compose with `claude-code-metadata-authoring` when a repository maintains both Codex and Claude Code metadata and wants clear tool-specific boundaries.
- Compose with `model-role-guidance` when subagent, hook, or config authoring needs source-backed role-to-model defaults and override guidance.
- Compose with `reflection` when durable memory captures or planning retrospectives should become Codex metadata improvements.
- Compose with `devtools` for shared shell, validation, and temp-artifact handling conventions.---
  name: Codex Metadata Authoring
  description: Standards and workflows support authoring, reviewing, and maintaining OpenAI Codex metadata constructs.
  license: SEE-LICENSE-IN-REPO

---

# Capability: Codex Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for OpenAI Codex repository metadata.

## Primary Concern

Codex-native metadata quality, structure, compatibility, and promotion readiness.

## Authoring stance

- Always-on metadata surfaces should stay minimal.
- Main instruction files should carry trigger conditions, scope, precedence, and must-follow constraints first.
- Detailed procedures, examples, edge cases, and long workflows should be progressively loaded from support docs, skills, agents, or prompt bodies only when needed.
- Repeated procedural detail across always-on files is a metadata smell unless the duplication is required for enforcement.

## In Scope

- `AGENTS.md` and `AGENTS.override.md` layering and authoring guidance
- `.codex/config.toml` configuration guidance for instructions, MCP, approval, and sandbox policy
- `.agents/skills/` authoring guidance for reusable Codex workflows
- `.codex/agents/*.toml` authoring guidance for explicit specialist subagents
- `.codex/hooks.json` guidance, including current platform constraints
- `.codex/rules/*.rules` guidance for approval and command-governance policy
- Codex-specific compatibility notes, references, and refresh workflows

## Non-Goals

- GitHub Copilot-specific metadata authoring rules that belong in `github-copilot-metadata-authoring`
- Claude Code-specific metadata authoring rules that belong in `claude-code-metadata-authoring`
- Product-specific runtime behavior outside Codex metadata surfaces
- Repository-specific business policy ownership

## Included Metadata

- `.github/instructions/codex-agents-files.instructions.md`
- `.github/instructions/codex-agents-md.instructions.md`
- `.github/instructions/codex-config.instructions.md`
- `.github/instructions/codex-skills.instructions.md`
- `.github/instructions/codex-subagents.instructions.md`
- `.github/instructions/codex-hooks.instructions.md`
- `.github/instructions/codex-rules.instructions.md`
- `.github/prompts/codex-metadata-authoring-refresh-online-guidance.prompt.md`
- `.github/agents/codex-metadata-authoring-steward.agent.md`
- `.github/skills/codex-metadata/**`

## Reuse and Portability

- Designed for cross-repository Codex metadata reuse and review
- Anchors behavior claims to authoritative OpenAI documentation
- Keeps Windows hook limitations explicit so consumers do not assume unsupported automation paths

## Ownership Boundaries

- Owns Codex-specific authoring guidance for instruction files, config, skills, subagents, hooks, and rules
- Does not own generic `.github/` metadata conventions or non-Codex platform guidance

## Composition Notes

- Compose with `github-copilot-metadata-authoring` when a repository maintains both GitHub Copilot and Codex metadata and wants shared promotion patterns
- Compose with `claude-code-metadata-authoring` when a repository maintains both Codex and Claude Code metadata and wants clear tool-specific boundaries
- Compose with `reflection` when durable memory captures or planning retrospectives should become Codex metadata improvements
- Compose with `devtools` for shared shell, validation, and temp-artifact handling conventions

## Adjacent Capabilities

- `github-copilot-metadata-authoring`: owns GitHub Copilot metadata authoring standards and reusable promotion mechanics.
- `claude-code-metadata-authoring`: owns Claude Code metadata authoring standards and reusable promotion mechanics.
- `reflection`: owns reusable durable-memory capture, backend-aware memory maintenance, and proposal-first reinforcement rules.
- `devtools`: owns general command execution and tool workflow guidance outside Codex-specific metadata.
