---
name: ai-metadata
description: Review and improve GitHub Copilot metadata for correct surface selection, scope, security, portability, and promotion readiness.
---

# AI metadata review skill

Use this skill when a Copilot-generated or human-authored metadata draft needs review before it is
committed, shared, or promoted. Current Copilot generators and official documentation are usually
enough for a simple first draft; this skill supplies the judgment and validation pass around it.

Use it when creating or updating:

- Repository custom instructions
- Prompt files
- Custom agents
- Agent skills
- Hooks
- Agent plugins and plugin-local MCP/LSP configuration

## Core workflow

1. Identify the intended outcome, target hosts, and whether the artifact is local, shared, or intended for promotion.
2. Select the smallest effective surface:
    - instructions for stable rules that apply automatically
    - prompts for repeatable, user-invoked tasks
    - skills for specialized workflows with supporting resources
    - agents for distinct roles, tool boundaries, or delegation
    - hooks for deterministic lifecycle automation or enforcement
3. Review scope and context cost. Prefer the narrowest `applyTo` or invocation boundary, avoid duplicate rules, and move examples and procedures into progressively loaded support files.
4. Review execution risk. Check agent tools, subagent access, hook commands, input handling, secrets, filesystem effects, and whether a human decision is required.
5. Review host compatibility. State meaningful differences between VS Code, GitHub.com, and Copilot CLI, and label preview-only behavior. Do not infer portability from matching filenames.
6. Validate frontmatter, path bases, references, and any executable behavior. Resolve skill
   resources from the directory containing `SKILL.md`; validate plugin resources against the
   selected manifest format and emitted plugin root. Run a representative task when the metadata
   changes user-visible agent behavior.
7. Report unresolved assumptions and promotion readiness. Do not promote a draft merely because its syntax is valid.

## Decision rules

- Treat generated metadata as a draft, not as evidence that the design is correct.
- Prefer repository-specific facts and enforceable rules over generic advice that Copilot already
  knows.
- Keep always-on metadata thin and high-signal. A long procedure belongs in a skill or prompt.
- Ask for user input only when it changes the artifact surface, scope, permissions, host target, or
  validation criteria; batch those decisions instead of guessing.
- Keep repo-specific instruction files authoritative for enforcement and scoping.

## Supporting material

- Read [References.md](./References.md) when source freshness matters.
- Apply [BestPractices.md](./BestPractices.md) for the detailed review checklist.
- Check [Compatibility.md](./Compatibility.md) for host-specific behavior and preview status.
- Read
  [ai-metadata-plugins.instructions.md](../../instructions/ai-metadata-plugins.instructions.md)
  before authoring plugin manifests, hooks, MCP/LSP config, or plugin-local script paths.
- Use [ReflectionReinforcement.md](./ReflectionReinforcement.md) when converting observed outcomes
  into durable policy.

## Versioning

- Last reviewed: 2026-07-23
