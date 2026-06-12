---
description: Guidance for Claude Code instruction files and @import composition.
applyTo: '**/CLAUDE.md,.claude/CLAUDE.md'
---

# Claude Code instruction files

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources:
    - https://code.claude.com/docs/en/memory.md
    - https://code.claude.com/docs/en/settings.md

## Scope and precedence

- `CLAUDE.md` is the primary repository instruction surface for Claude Code.
- Claude Code loads project and parent-directory `CLAUDE.md` files at session start and loads nested subdirectory `CLAUDE.md` files on demand when Claude traverses into those directories.
- Project guidance can live at the repository root `CLAUDE.md` or `.claude/CLAUDE.md`.
- Use `claudeMdExcludes` in settings when a monorepo needs to suppress irrelevant `CLAUDE.md` files.

## Authoring guidance

- Keep the repository-root `CLAUDE.md` routing-oriented and concise; stay under roughly 200 lines when practical.
- Use `@path/to/file` imports to modularize stable supporting guidance instead of building one monolithic file.
- Keep nested `CLAUDE.md` files delta-only and specific to the subtree that needs them.
- Use repository-relative imports when possible; reserve `@~/...` imports for user-specific composition outside shared repository policy.
- Audit imports and nested files for contradictory instructions.
- Block-level HTML comments are maintainer notes only and are stripped before injection; do not rely on them for behavior Claude must follow.

## What to avoid

- Repeating the same rules across imported, root, and nested `CLAUDE.md` files.
- Embedding permissions, hooks, or MCP configuration that belongs in settings or `.mcp.json`.
- Deep import chains that make the effective policy hard to audit.