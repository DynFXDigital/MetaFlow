# Agent Skills Standard

This MetaFlow capability is a host-facing wrapper around the published Agent Skills specification. It provides concise guidance for authoring portable `SKILL.md` directories, organizing optional resources, and validating the result.

## Included guidance

- `.github/skills/agent-skills-standard/SKILL.md` is the concise progressive-discovery entry point.
- `.github/skills/agent-skills-standard/references/SOURCES.md` records the authoritative live specification and pinned bundled snapshot.

The location `.github/skills/` describes one host's discovery convention; it does not change the Agent Skills format. A skill can be hosted in other supported locations while retaining the same `SKILL.md` contract. Likewise, this directory's `plugin.json` is a MetaFlow host-facing wrapper and does not claim strict Agent Plugins v1 conformance.

Start with [the standard skill](.github/skills/agent-skills-standard/SKILL.md), then consult its [source index](.github/skills/agent-skills-standard/references/SOURCES.md) and raw reference for exact details.

Authoritative live references: [Agent Skills Specification](https://agentskills.io/specification), [Agent Plugins Specification v1.0.0](https://agent-plugins.org/specification), and [GitHub Copilot agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).
