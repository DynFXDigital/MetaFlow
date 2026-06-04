---
uid: 3cdc581b-1bf9-481a-84d8-f75926e673e8
name: GitHub Copilot Metadata Authoring
description: GitHub Copilot metadata standards, prompts, and skills support portable AI metadata artifacts and promotion workflows.
license: SEE-LICENSE-IN-REPO
agentPlugin: true
---

# Capability: GitHub Copilot Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for GitHub Copilot repository metadata.

## Primary Concern

GitHub Copilot-native metadata quality, structure, compatibility, context efficiency, and promotion readiness.

## Use This Capability When

- a repository needs GitHub Copilot-specific guidance for instructions, prompts, agents, skills, or hooks
- authoring work needs portable GitHub Copilot metadata conventions instead of product-specific behavior rules
- a task needs the deeper `ai-metadata` skill, steward agent, or prompt support rather than restating long workflow detail in layer 1

## In Scope

- Authoring standards for `.github/copilot-instructions.md`, instructions, prompts, agents, skills, and hooks
- Interactive-decision patterns for prompts, agents, and instructions that collect high-impact user input consistently
- Progressive-discovery patterns that keep hot-path GitHub Copilot metadata concise and move detail into support docs
- GitHub Copilot and VS Code compatibility guidance for current metadata constructs
- AGENTS.md scope and precedence conventions
- Review and refresh workflows for GitHub Copilot metadata guidance

## Non-Goals

- Codex-specific metadata authoring rules that belong in `codex-metadata-authoring`
- Claude Code-specific metadata authoring rules that belong in `claude-code-metadata-authoring`
- Product-specific runtime feature behavior outside GitHub Copilot metadata surfaces
- Release pipeline governance for non-metadata artifacts

## Must-Follow Constraints

- Keep always-on metadata surfaces minimal and front-load trigger conditions, scope, precedence, and must-follow rules.
- Move long procedures, examples, edge cases, rationale, and compatibility detail into second-layer support docs unless duplication is required for enforcement.
- Keep GitHub Copilot-specific guidance inside this capability instead of claiming adjacent Codex or Claude Code ownership.

## Load For Detail

- Load `.github/skills/ai-metadata/SKILL.md` for the full authoring workflow.
- Use `.github/skills/ai-metadata/BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md` for second-layer detail.
- Use `.github/agents/github-copilot-metadata-authoring-steward.agent.md` for source-backed refresh or review passes.
- Use the local metadata-authoring prompts when the task is prompt-shaped instead of capability-shaped.

## Ownership Boundaries

- Owns GitHub Copilot-specific metadata artifact conventions and promotion design rules
- Owns shared authoring guidance for when interactive metadata should use askQuestions, including trigger, batching, and fallback expectations
- Does not own non-Copilot metadata contracts or domain-specific implementation policy outside metadata scope

## Composition Notes

- Compose with `codex-metadata-authoring` and `claude-code-metadata-authoring` when a repository maintains multiple agent-system metadata surfaces with clear ownership boundaries.
- Compose with `model-role-guidance` when agent or prompt construction needs source-backed model defaults, tier mapping, or delegator override guidance.
- Compose with `reflection` for durable-memory and reinforcement workflows.
- Compose with `planning` for structured planning conventions around metadata work.---
  name: GitHub Copilot Metadata Authoring
  description: GitHub Copilot metadata standards, prompts, and skills support portable AI metadata artifacts and promotion workflows.
  license: SEE-LICENSE-IN-REPO

---

# Capability: GitHub Copilot Metadata Authoring

## Mission

Provide reusable standards and maintenance workflows for GitHub Copilot repository metadata.

## Primary Concern

GitHub Copilot-native metadata quality, structure, compatibility, context efficiency, and promotion readiness.

## Authoring stance

- Always-on metadata surfaces should stay minimal.
- Main instruction files should carry trigger conditions, scope, precedence, and must-follow constraints first.
- Detailed procedures, examples, edge cases, and long workflows should be progressively loaded from support docs, skills, or prompt bodies only when needed.
- Repeated procedural detail across always-on files is a metadata smell unless the duplication is required for enforcement.

## In Scope

- Authoring standards for `.github/copilot-instructions.md`, instructions, prompts, agents, skills, and hooks
- Reusable interactive-decision patterns for prompts, agents, and instructions that collect high-impact user input consistently
- Progressive-discovery patterns that keep hot-path GitHub Copilot metadata concise and move detail into support docs
- GitHub Copilot and VS Code compatibility guidance for current metadata constructs
- AGENTS.md scope and precedence conventions
- Review and refresh workflows for GitHub Copilot metadata guidance

## Non-Goals

- Codex-specific metadata authoring rules that belong in `codex-metadata-authoring`
- Claude Code-specific metadata authoring rules that belong in `claude-code-metadata-authoring`
- Product-specific runtime feature behavior outside GitHub Copilot metadata surfaces
- Release pipeline governance for non-metadata artifacts

## Included Metadata

- `.github/instructions/ai-metadata-*.instructions.md`
- `.github/agents/github-copilot-metadata-authoring-steward.agent.md`
- `.github/prompts/create-agents-md.prompt.md`
- `.github/prompts/review-metadata-authoring-capability.prompt.md`
- `.github/skills/ai-metadata/**`

## Reuse and Portability

- Designed for cross-repository GitHub Copilot metadata reuse and review
- Anchors behavior claims to authoritative GitHub and VS Code documentation
- Keeps two prompts intentionally: one reusable authoring helper and one capability-review entry point
- Requires portable paths and excludes private or internal-only context

## Ownership Boundaries

- Owns GitHub Copilot-specific metadata artifact conventions and promotion design rules
- Owns shared authoring guidance for when interactive metadata should use askQuestions, including trigger, batching, and fallback expectations
- Does not own non-Copilot metadata contracts or domain-specific implementation policy outside metadata scope

## Composition Notes

- Compose with `codex-metadata-authoring` and `claude-code-metadata-authoring` when a repository maintains multiple agent-system metadata surfaces with clear ownership boundaries
- Compose with `reflection` for durable-memory and reinforcement workflows
- Compose with `planning` for structured planning conventions around metadata work

## Adjacent Capabilities

- `codex-metadata-authoring`: owns Codex-specific metadata authoring standards.
- `claude-code-metadata-authoring`: owns Claude Code-specific metadata authoring standards.
- `reflection`: owns reflection workflows, durable-memory capture, and evidence-gated policy reinforcement.
- `planning`: owns project plan and issue-management conventions.
