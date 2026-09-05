# Agent Plugins

This MetaFlow capability is a host-facing wrapper around the published Agent Plugins Specification v1.0.0. It helps authors create, review, and safely maintain portable Agent Plugins packages without silently converting them to a host-specific format.

## Included guidance

- `.github/skills/agent-plugins/SKILL.md` is the concise progressive-discovery entry point.
- `.github/skills/agent-plugins/references/SOURCES.md` records authoritative live sources and pinned bundled snapshots.

The `plugin.json` in this directory is MetaFlow's backward-compatible host-facing capability manifest. It intentionally uses `.github/skills` and does **not** claim strict Agent Plugins v1 conformance. A strict portable package must have its own root `plugin.json` with the canonical v1 `$schema` value and must pass the v1 contract. For VS Code hooks in that strict package, use the client extension path `com.github.copilot/hooks/hooks.json` rather than legacy root `hooks.json`.

When a request says only “capability” or “plugin,” ask whether the target is GitHub Copilot's legacy plugin format or strict Agent Plugins v1. Validate the selected format; do not convert between formats implicitly. In MetaFlow, omitting the canonical schema keeps legacy behavior, while adding it is the explicit v1 opt-in.

Start with [the Agent Plugins skill](.github/skills/agent-plugins/SKILL.md), then consult its [source index](.github/skills/agent-plugins/references/SOURCES.md) and raw references when exact schema or normative wording is needed.

Authoritative live references: [Agent Plugins Specification v1.0.0](https://agent-plugins.org/specification), [plugin schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), [MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json), and [Agent Skills Specification](https://agentskills.io/specification).
