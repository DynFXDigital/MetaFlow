# Sources and snapshot provenance

Authoritative live sources for the supported Agent Plugins v1.0.0 guidance:

- [Agent Plugins Specification v1.0.0](https://agent-plugins.org/specification)
- [Agent Plugins v1.0.0 plugin manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Agent Plugins v1.0.0 MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- [Agent Skills Specification](https://agentskills.io/specification)
- [GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins)

## Bundled snapshots

The files in `raw/` are exact upstream copies pinned to agentplugins/agent-plugins-spec commit `ff8ab5e392cc87bd88d87c060815a87490e51003`:

| File | Upstream path | SHA-256 |
| --- | --- | --- |
| `raw/specification-1.0.0.md` | `spec/1.0.0.md` | `97a658b7dca3ce1b4c2266b95da300fa51d9dc4ade59d73168e5f9104272da18` |
| `raw/plugin.schema.json` | `schemas/1.0.0/plugin.schema.json` | `0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883` |
| `raw/mcp.schema.json` | `schemas/1.0.0/mcp.schema.json` | `6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb` |
| `raw/LICENSE.md` | `LICENSE.md` | `c614e83c1e0d6b1a53feb0d279fbfcfc2cc048ba34c19b751315d7dbb481c7a5` |

Use the live links when checking for newer upstream releases. Use the bundled snapshots for reproducible review of MetaFlow's supported v1.0.0 baseline. Specification and documentation material is CC BY 4.0; schemas and software material are Apache 2.0, as recorded in the bundled upstream license.
