---
name: ai-metadata
description: Review GitHub Copilot metadata for correct scope, safety, portability, and the configured MetaFlow Agent Plugins v1 disposition.
---

# AI metadata review skill

Use this skill when a Copilot-generated or human-authored metadata draft needs review before it is
committed, shared, or promoted. Current Copilot generators and official documentation are usually
enough for a simple first draft; this skill supplies the judgment and validation pass around it.

Use it when creating or updating:

- Repository custom instructions
- Prompt files
- User-invoked agent-plugin commands
- Custom agents
- Agent skills
- Hooks
- Agent plugins and plugin-local MCP/LSP configuration

## MetaFlow disposition

- Read `.metaflow/config.jsonc` when available. An omitted `agentPlugins.disposition` means
  `compatibility`; disposition is independent from auto-apply and injection mode.
- `compatibility` preserves GitHub Copilot packaging and authoring unless strict v1 is explicitly
  requested.
- `prefer-standard` prefers Skills for new reusable workflows, MCP for new tool integrations, and
  strict v1 packaging when the mapping is lossless. It preserves host metadata without warnings.
- `audit-standard` applies the same standard-first preferences and additionally reports advisory
  warnings for legacy, invalid, no-equivalent, and vendor-specific metadata.
- Prompts, slash commands, scoped instructions/rules, custom agents, and hooks have no direct
  portable v1 equivalent. Preserve them as GitHub extensions, and keep authoring hooks with the
  GitHub Copilot contract, unless the user explicitly selects another migration shape.
- Require one explicit `keep-vendor`, `add-standard-alongside`, or
  `replace-with-disclosed-loss` decision per affected artifact before semantic conversion or
  deletion. Packaging retained files under `com.github.copilot/` is conformant but nonportable.

## Core workflow

1. Identify the intended outcome, target hosts, configured disposition, and whether the artifact is local, shared, or intended for promotion. If no disposition is available and a request says only "capability" or "agent plugin," ask whether the user wants a GitHub Copilot agent plugin or strict Agent Plugins v1 package. Route strict v1 work through the built-in `agent-plugins` capability and portable skill syntax through `agent-skills`.
2. Select the smallest effective surface:
    - instructions for stable rules that apply automatically
    - commands for named, user-invoked plugin entry points
    - prompts for repeatable tasks when the target host only exposes prompt files
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

## Command guidance

- A command is an individual Markdown file in the plugin manifest's `commands` directory.
- Keep the filename plain kebab-case; hosts may expose it as `/plugin-name:command-name`.
- Do not copy a plugin namespace into `name` or the filename.
- Use `disable-model-invocation: true` for workflows that must be deliberately started by a user.
- Keep the command entry point short and move reusable procedures into a skill or adjacent resource.
- Treat command arguments, repository text, and referenced files as untrusted input unless the
  command explicitly validates them.

## Decision rules

- Treat generated metadata as a draft, not as evidence that the design is correct.
- Prefer repository-specific facts and enforceable rules over generic advice that Copilot already
  knows.
- Keep always-on metadata thin and high-signal. A long procedure belongs in a skill or prompt.
- Ask for user input only when it changes the artifact surface, scope, permissions, host target, or
  validation criteria; batch those decisions instead of guessing.
- Do not infer migration consent from standard-oriented disposition. Preserve existing metadata
  until every semantic candidate has an explicit keep, add, or replace decision.
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

- Last reviewed: 2026-09-04
