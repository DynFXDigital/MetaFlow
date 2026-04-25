---
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

- `.agents/skills/codex-metadata/SKILL.md`

## Planned Metadata

- `AGENTS.md` and `AGENTS.override.md` authoring guidance
- `.codex/config.toml` authoring guidance
- `.codex/agents/*.toml` authoring guidance
- `.codex/hooks.json` guidance
- `.codex/rules/*.rules` guidance
- `.github/prompts/codex-metadata-authoring-refresh-online-guidance.prompt.md`
- `.github/agents/codex-metadata-authoring-steward.agent.md`

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
