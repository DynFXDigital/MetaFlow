---
name: ai-metadata
description: Consolidated guidance for authoring AI metadata under MetaFlow's compatibility, prefer-standard, and audit-standard Agent Plugins v1 dispositions.
---

# AI metadata skill

Use this skill when creating or updating:

- Repository custom instructions
- Prompt files
- User-invoked agent-plugin commands
- Custom agents
- Agent skills
- Hooks
- Agent plugins and plugin-local MCP/LSP configuration

## Scope

This skill consolidates current best practices and compatibility notes across GitHub Copilot and VS Code. It is intentionally redundant with the repo’s instruction files so guidance is available both as instructions and as a loadable skill, while still favoring thin hot-path metadata and progressive discovery of detail.

## How to use

1. Read `.metaflow/config.jsonc` when available. Treat an omitted
   `agentPlugins.disposition` as `compatibility`; disposition does not enable auto-apply or
   change injection mode.
2. In `compatibility`, preserve legacy GitHub Copilot packaging and authoring unless the user
   explicitly requests strict Agent Plugins v1.
3. In `prefer-standard`, prefer Skills for new reusable workflows, MCP for new tool integrations,
   and a strict v1 package when that shape is lossless. Preserve existing and host-specific
   metadata without conformance warnings.
4. In `audit-standard`, use the same standard-first choices and surface advisory conformance
   diagnostics: error severity for invalid strict-v1 packages or components and warning severity
   for legacy, no-equivalent, migration, and vendor-specific findings. These findings do not alter
   apply or validation exit status.
5. Prompts, slash commands, scoped instructions/rules, custom agents, and hooks have no direct
   portable v1 equivalent. Preserve them as host metadata; continue using the GitHub Copilot hook
   contract unless the user explicitly chooses another shape.
6. Before converting semantics or deleting a source artifact, require an explicit
   `keep-vendor`, `add-standard-alongside`, or `replace-with-disclosed-loss` decision for every
   candidate. A `com.github.copilot/` package namespace is conformant but remains nonportable.
7. If a request says only "capability" or "agent plugin", no disposition is available, and the
   format is otherwise unclear, ask whether the user wants a GitHub Copilot agent plugin or strict
   Agent Plugins v1 package. Use the built-in `agent-plugins` capability for strict v1 and
   `agent-skills` for portable skill syntax; do not merge the formats.
8. Read `References.md` for authoritative sources and last-reviewed dates.
9. Apply `BestPractices.md` when authoring or reviewing metadata files.
10. Use `ReflectionReinforcement.md` for evidence-gated reflection-to-policy updates.
11. Check `Compatibility.md` for environment-specific caveats and preview status.
12. Keep repo-specific instruction files authoritative for enforcement and scoping.
13. When editing metadata files, proactively offer to fix non-compliant patterns.
14. Prefer metadata that puts trigger conditions, scope, and must-follow rules in the main file, then moves extended examples, edge cases, and long procedures into support docs.
15. Resolve skill resources from the directory containing `SKILL.md`; validate plugin resources
    against the selected manifest format and emitted plugin root.
16. Choose commands for named, user-invoked plugin entry points; choose skills for reusable
    workflows that may also be model-discovered; choose prompts for hosts that only support
    prompt-file injection. A command is an individual Markdown file under the manifest's
    `commands` directory, not a prompt renamed by convention.
17. Keep command names plain kebab-case. Plugin hosts may add a namespace such as
    `/plugin-name:command-name`; do not put that namespace in the filename or frontmatter.
18. Use `disable-model-invocation: true` when a command should be explicitly user-run, and
    document `argument-hint` plus the expected input boundary when arguments are accepted.
19. Read `../../instructions/ai-metadata-plugins.instructions.md` before authoring plugin
    manifests, hooks, MCP/LSP config, or plugin-local script paths.

## Files

- `References.md`
- `BestPractices.md`
- `ReflectionReinforcement.md`
- `Compatibility.md`

## Versioning

- Last reviewed: 2026-09-04
