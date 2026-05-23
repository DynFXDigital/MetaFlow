---
description: Guidance for Claude Code MCP configuration files.
applyTo: '.mcp.json'
---

# Claude Code MCP configuration

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources:
    - https://code.claude.com/docs/en/mcp.md

## Purpose

- `.mcp.json` is the project-scoped Claude Code MCP configuration surface.
- Use it for shared MCP server connectivity, not for general reasoning or instruction policy.

## Authoring guidance

- Keep the file valid JSON with an explicit `mcpServers` object.
- Prefer project-scoped `.mcp.json` for team-shared MCP setup and user-level MCP files for personal additions.
- Use environment variable references for secrets rather than hardcoding credentials.
- Keep server names stable and descriptive.
- Choose the appropriate transport (`stdio`, `http`, `sse`, or `ws`) deliberately and document any non-portable dependencies nearby.
- Let agent frontmatter `mcpServers:` narrow scope further when only one agent needs a server.

## What to avoid

- Hiding shared MCP dependencies only inside agent bodies or settings comments.
- Hardcoding local-only secrets or machine paths when a portable alternative exists.
- Treating `.mcp.json` as a substitute for `CLAUDE.md`, rules, or settings.---
  description: Guidance for Claude Code MCP configuration files.
  applyTo: '.mcp.json'

---

# Claude Code MCP configuration

## Sources and versioning

- Last reviewed: 2026-03-28
- Sources:
    - https://code.claude.com/docs/en/mcp.md

## Purpose

- `.mcp.json` is the project-scoped Claude Code MCP configuration surface.
- Use it for shared MCP server connectivity, not for general reasoning or instruction policy.

## Authoring guidance

- Keep the file valid JSON with an explicit `mcpServers` object.
- Prefer project-scoped `.mcp.json` for team-shared MCP setup and user-level MCP files for personal additions.
- Use environment variable references for secrets rather than hardcoding credentials.
- Keep server names stable and descriptive.
- Choose the appropriate transport (`stdio`, `http`, `sse`, or `ws`) deliberately and document any non-portable dependencies nearby.
- Let agent frontmatter `mcpServers:` narrow scope further when only one agent needs a server.

## What to avoid

- Hiding shared MCP dependencies only inside agent bodies or settings comments.
- Hardcoding local-only secrets or machine paths when a portable alternative exists.
- Treating `.mcp.json` as a substitute for `CLAUDE.md`, rules, or settings.
