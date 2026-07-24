---
name: ai-metadata
description: Consolidated guidance for authoring Copilot instructions, prompt files, custom agents, agent skills, hooks, and agent plugins with current compatibility caveats.
---

# AI metadata skill

Use this skill when creating or updating:
- Repository custom instructions
- Prompt files
- Custom agents
- Agent skills
- Hooks
- Agent plugins and plugin-local MCP/LSP configuration

## Scope
This skill consolidates current best practices and compatibility notes across GitHub Copilot and VS Code. It is intentionally redundant with the repo’s instruction files so guidance is available both as instructions and as a loadable skill, while still favoring thin hot-path metadata and progressive discovery of detail.

## How to use
1. Read `References.md` for authoritative sources and last-reviewed dates.
2. Apply `BestPractices.md` when authoring or reviewing metadata files.
3. Use `ReflectionReinforcement.md` for evidence-gated reflection-to-policy updates.
4. Check `Compatibility.md` for environment-specific caveats and preview status.
5. Keep repo-specific instruction files authoritative for enforcement and scoping.
6. When editing metadata files, proactively offer to fix non-compliant patterns.
7. Prefer metadata that puts trigger conditions, scope, and must-follow rules in the main file, then moves extended examples, edge cases, and long procedures into support docs.
8. Resolve skill resources from the directory containing `SKILL.md`; validate plugin resources
   against the selected manifest format and emitted plugin root.
9. Read `../../instructions/ai-metadata-plugins.instructions.md` before authoring plugin
   manifests, hooks, MCP/LSP config, or plugin-local script paths.

## Files
- `References.md`
- `BestPractices.md`
- `ReflectionReinforcement.md`
- `Compatibility.md`

## Versioning
- Last reviewed: 2026-07-23
