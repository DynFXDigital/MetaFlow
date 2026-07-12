---
uid: 3cdc581b-1bf9-481a-84d8-f75926e673e8
name: GitHub Copilot Metadata Authoring
description: GitHub Copilot metadata standards, prompts, and skills support portable AI metadata artifacts and promotion workflows.
license: SEE-LICENSE-IN-REPO
agentPlugin: true
---

# Capability: GitHub Copilot Metadata Authoring

## Mission

Review and maintain GitHub Copilot metadata after Copilot or a human has produced an initial draft.

## Primary Concern

Metadata design quality: choosing the smallest effective surface, scoping it correctly, limiting
permissions, preserving host compatibility, and deciding whether it is ready to share or promote.

## Use This Capability When

- generated or existing Copilot metadata needs a quality, security, or compatibility review
- a task must choose between instructions, prompts, agents, skills, and hooks
- metadata is being prepared for reuse across repositories, hosts, or an organization
- a task needs the deeper `ai-metadata` skill, steward agent, or review prompt

For a simple first draft, use Copilot's native generators and documentation first. Load this
capability when the draft needs judgment beyond file syntax or when it will be shared.

## In Scope

- Selecting and scoping `.github/copilot-instructions.md`, instructions, prompts, agents, skills, and hooks
- Review criteria for context cost, tool exposure, executable behavior, and maintainability
- Interactive-decision patterns for prompts, agents, and instructions that collect high-impact user input consistently
- Progressive-discovery patterns that keep hot-path metadata concise and move detail into support docs
- GitHub Copilot and VS Code compatibility guidance for current metadata constructs
- AGENTS.md scope and precedence conventions
- Review, validation, refresh, and promotion workflows for reusable metadata

## Non-Goals

- Re-teaching basic filenames and frontmatter that current Copilot generators and official documentation already provide
- Codex-specific metadata authoring rules that belong in `codex-metadata-authoring`
- Claude Code-specific metadata authoring rules that belong in `claude-code-metadata-authoring`
- Product-specific runtime feature behavior outside GitHub Copilot metadata surfaces
- Release pipeline governance for non-metadata artifacts

## Must-Follow Constraints

- Treat generated metadata as a draft: verify its purpose, owning surface, scope, permissions, and host assumptions before sharing it.
- Choose the smallest effective artifact and scope; do not use always-on or global application when a narrower surface works.
- Keep always-on metadata surfaces minimal and front-load trigger conditions, scope, precedence, and must-follow rules.
- Move long procedures, examples, edge cases, rationale, and compatibility detail into second-layer support docs unless duplication is required for enforcement.
- Review executable metadata, including hooks and unrestricted tools, as a security boundary rather than as ordinary prose.
- State the supported Copilot surfaces when behavior differs between VS Code, GitHub.com, and Copilot CLI.
- Keep GitHub Copilot-specific guidance inside this capability instead of claiming adjacent Codex or Claude Code ownership.

## Load For Detail

- Load `.github/skills/ai-metadata/SKILL.md` for the full authoring workflow.
- Use `.github/skills/ai-metadata/BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md` for second-layer detail.
- Use `.github/agents/github-copilot-metadata-authoring-steward.agent.md` for source-backed refresh or review passes.
- Use the local metadata-authoring prompts when the task is prompt-shaped instead of capability-shaped.

## Ownership Boundaries

- Owns GitHub Copilot-specific metadata selection, review, compatibility, and promotion design rules
- Owns shared authoring guidance for when interactive metadata should use askQuestions, including trigger, batching, and fallback expectations
- Does not own non-Copilot metadata contracts or domain-specific implementation policy outside metadata scope

## Composition Notes

- Compose with `codex-metadata-authoring` and `claude-code-metadata-authoring` when a repository maintains multiple agent-system metadata surfaces with clear ownership boundaries.
- Compose with `model-role-guidance` when agent or prompt construction needs source-backed model defaults, tier mapping, or delegator override guidance.
- Compose with `reflection` for durable-memory and reinforcement workflows.
- Compose with `planning` for structured planning conventions around metadata work.
