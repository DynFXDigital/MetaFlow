---
name: ai-metadata
description: Consolidated guidance for authoring Copilot instructions, prompt files, slash commands, custom agents, agent skills, hooks, and agent plugins with current compatibility caveats.
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
1. If a request says only "capability" or "agent plugin" and the format is not otherwise clear,
   ask whether the user wants a GitHub Copilot agent plugin or strict Agent Plugins v1 package.
   Use the built-in `agent-plugins-v1-standard` capability for strict v1 and
   `agent-skills-standard` for portable skill syntax; do not merge the formats.
2. Read `References.md` for authoritative sources and last-reviewed dates.
3. Apply `BestPractices.md` when authoring or reviewing metadata files.
4. Use `ReflectionReinforcement.md` for evidence-gated reflection-to-policy updates.
5. Check `Compatibility.md` for environment-specific caveats and preview status.
6. Keep repo-specific instruction files authoritative for enforcement and scoping.
7. When editing metadata files, proactively offer to fix non-compliant patterns.
8. Prefer metadata that puts trigger conditions, scope, and must-follow rules in the main file, then moves extended examples, edge cases, and long procedures into support docs.
9. Resolve skill resources from the directory containing `SKILL.md`; validate plugin resources
   against the selected manifest format and emitted plugin root.
10. Choose commands for named, user-invoked plugin entry points; choose skills for reusable
   workflows that may also be model-discovered; choose prompts for hosts that only support
   prompt-file injection. A command is an individual Markdown file under the manifest's
   `commands` directory, not a prompt renamed by convention.
11. Keep command names plain kebab-case. Plugin hosts may add a namespace such as
    `/plugin-name:command-name`; do not put that namespace in the filename or frontmatter.
12. Use `disable-model-invocation: true` when a command should be explicitly user-run, and
    document `argument-hint` plus the expected input boundary when arguments are accepted.
13. Read `../../instructions/ai-metadata-plugins.instructions.md` before authoring plugin
   manifests, hooks, MCP/LSP config, or plugin-local script paths.

## Files
- `References.md`
- `BestPractices.md`
- `ReflectionReinforcement.md`
- `Compatibility.md`

## Versioning
- Last reviewed: 2026-07-23
