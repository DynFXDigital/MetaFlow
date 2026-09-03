---
name: agent-plugins
description: Create, review, or maintain strict Agent Plugins Specification v1.0.0 packages. Use when a request mentions portable agent plugins, plugin.json, Agent Plugins v1, skills/ layout, mcp.json, or format-preserving validation.
---

# Agent Plugins v1 authoring

This skill is standards guidance, not a claim that the surrounding MetaFlow capability wrapper is itself a strict v1 package. Read [references/SOURCES.md](references/SOURCES.md) and the bundled snapshots below when exact rules are needed.

## Choose the format first

If the user names GitHub Copilot, follow the Copilot plugin format. If the user names Agent Plugins v1, follow this skill. If “plugin” or “capability” is ambiguous, ask which format they want before creating files. Similar names and concepts do not make the formats interchangeable. Validate the selected format instead of silently converting an existing package.

## Strict v1 contract

1. Treat the package root as one contained filesystem tree. Require a root `plugin.json` whose `$schema` is exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
2. Validate the closed root manifest. Its only permitted top-level fields are `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `extensions`; required fields are `$schema` and `name`. Do not add host-specific fields.
3. Discover portable components only at the fixed locations: immediate child directories of `skills/` containing `SKILL.md`, and optional root `mcp.json`. Agent Plugins v1 defines exactly these two portable component types.
4. If `mcp.json` exists, require its matching canonical `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` marker and validate its closed `mcpServers` configuration. Do not inline MCP configuration in `plugin.json`.
5. Put client-specific manifest data under stable reverse-domain namespaces in `extensions`; put client-specific files in a same-named top-level extension directory. Do not give extension data portable semantics.
6. Resolve every package-relative path against the package root and reject symlink, junction, reparse-point, `..`, or equivalent escapes. A strict package must not gain `.github/` component paths merely because a host wrapper uses them.

## GitHub Copilot extension packaging

When strict v1 is explicitly selected for VS Code, keep the portable root contract above and put
Copilot-only hook configuration at `com.github.copilot/hooks/hooks.json`. Address packaged scripts
through `${PLUGIN_ROOT}` because hooks run from the session or repository working directory, not
the installed plugin directory. Treat this namespace as a Copilot client extension; it does not
add hooks to the two portable v1 component types.

Do not combine this strict-v1 output with `.plugin/plugin.json` or legacy root-manifest fields.
For compatibility while VS Code's v1 support matures, publish a separately validated legacy
Copilot/OpenPlugin output rather than mixing both formats in one emitted package.

## Safe maintenance

Use the canonical schema marker as a positive signal, then validate the manifest, fixed layout, skill format, optional MCP file, and containment before selecting strict-v1 maintenance. Preserve names, root fields, `skills/`, `mcp.json`, and recognized extension namespaces. For invalid, mixed, or ambiguous packages, report the signals and the safe next action; stop rather than rewriting across the Copilot/v1 boundary.

For exact normative text, consult [the v1 specification](https://agent-plugins.org/specification) and the parent-supplied snapshots:

- `references/raw/specification-1.0.0.md`
- `references/raw/plugin.schema.json`
- `references/raw/mcp.schema.json`

Agent Skills inside a v1 package must follow the separate [Agent Skills specification](https://agentskills.io/specification); this skill governs package discovery and boundaries, not a replacement skill syntax.
