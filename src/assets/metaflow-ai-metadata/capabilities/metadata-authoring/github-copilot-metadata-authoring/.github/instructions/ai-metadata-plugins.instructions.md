---
description: 'Requirements for agent plugin manifests and plugin-local skill, hook, MCP, and LSP paths across Copilot, OpenPlugin, and Claude formats.'
applyTo: '**/plugin.json,**/.plugin/plugin.json,**/.github/plugin/plugin.json,**/.claude-plugin/plugin.json,**/hooks.json,**/.github/hooks/*.json,**/.mcp.json,**/.github/mcp.json,**/lsp.json,**/.github/lsp.json,**/.lsp.json,**/lsp-config/servers.json'
---

# Agent Plugin Packaging

Use these requirements when a distributable agent plugin contains skills, hooks, MCP servers, LSP
servers, or scripts. A matching filename does not make path or runtime semantics portable.

## Sources and versioning

- Last reviewed: 2026-07-24
- Sources:
    - https://code.visualstudio.com/docs/agent-customization/agent-plugins
    - https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
    - https://docs.github.com/en/copilot/reference/hooks-reference
    - https://github.com/github/copilot-cli/blob/main/changelog.md
    - https://code.claude.com/docs/en/plugins-reference
    - https://open-plugins.com/plugin-builders/specification
    - https://open-plugins.com/agent-builders/components/hooks
    - https://agentskills.io/specification

## Select the format before authoring paths

- You MUST identify the owning plugin format and target hosts before choosing manifest, hook,
  MCP, or LSP paths.
- VS Code checks manifests in this order: `.plugin/plugin.json`, root `plugin.json`,
  `.github/plugin/plugin.json`, then `.claude-plugin/plugin.json`. The first match determines the
  format.
- A root `plugin.json` therefore shadows `.claude-plugin/plugin.json` in VS Code. You MUST NOT
  recommend a combined root `plugin.json` plus `.claude-plugin/plugin.json` layout when
  Claude-specific hook or root-token semantics are required.
- Prefer a format-specific manifest and hook file. If one repository publishes multiple formats,
  keep independently validated format-specific packages or generated outputs; do not assume a
  copied manifest preserves semantics.

## Resolve each path from its owning artifact

- Manifest component fields such as `skills`, `agents`, `hooks`, `mcpServers`, and `lspServers`
  MUST point to files or directories inside the emitted plugin root, using the spelling required
  by that manifest format.
- A resource referenced from a skill body MUST be resolved relative to the directory containing
  that skill's `SKILL.md`, not relative to the manifest, repository root, or process working
  directory.
- A plugin hook MUST NOT assume that its process starts in the plugin directory. Hook working
  directories are session- or repository-oriented unless the hook sets `cwd`; locate bundled
  scripts through the target format's plugin-root contract.
- Distinguish authoring-source paths from emitted-package paths. A source implementation may live
  under a capability path such as `.github/hooks/scripts/`, while an emitted plugin hook MUST name
  the script or shim as it exists under the emitted plugin root.

## MetaFlow injection modes

- A hook-bearing capability intended for MetaFlow plugin injection through `chat.pluginLocations`
  MUST ship `.plugin/plugin.json`, `hooks/hooks.json`, and a plugin-root script or shim addressed
  through `${PLUGIN_ROOT}`. A root-only Copilot manifest plus a repository-relative
  `.github/hooks` command is unsafe when the capability is registered as an external plugin.
- A hook synchronized into the consuming repository at `.github/hooks/*.json` is settings-injected
  repository configuration, not plugin injection. It MAY use a repository-root-relative script
  path when that script is also synchronized into the repository and the target hosts are
  validated.
- Keep these outputs distinct even when they delegate to the same source implementation.

## Format contracts

### OpenPlugin for VS Code

- Use `.plugin/plugin.json`.
- OpenPlugin manifest component paths MUST start with `./` and remain inside the plugin root.
- OpenPlugin `rules` entries MUST resolve to `.mdc` rule files; do not point `rules` at Copilot
  `.instructions.md` files. VS Code does not currently document rules as a plugin-provided
  component, so deliver VS Code instructions through its instruction-location contract instead.
- Use `hooks/hooks.json` for the plugin hook configuration.
- VS Code supplies and expands `${PLUGIN_ROOT}` for OpenPlugin hook and MCP paths.
- A generated package MAY keep an implementation at
  `.github/hooks/scripts/prompt-injection-guard.mjs` and emit
  `scripts/prompt-injection-guard.mjs` as a shim that imports
  `../.github/hooks/scripts/prompt-injection-guard.mjs`.
- In that emitted layout, `hooks/hooks.json` MUST target the emitted shim:
  `node "${PLUGIN_ROOT}/scripts/prompt-injection-guard.mjs"`. It MUST NOT target a
  pre-materialization capability path or depend on the session working directory.

### Root Copilot format

- Use root `plugin.json`; prefer root `hooks.json` for Copilot-format plugin hooks.
- VS Code defines no plugin-root token for the root Copilot format. Do not use
  `${PLUGIN_ROOT}` as though VS Code will interpolate it for this format.
- Copilot CLI v1.0.26 and later exports `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, and
  `CLAUDE_PLUGIN_ROOT` to plugin hook processes. That is a Copilot CLI runtime guarantee, not a
  cross-host manifest guarantee.
- GitHub documents `${PLUGIN_ROOT}` placeholder interpolation for Copilot plugin LSP fields, but
  does not document equivalent interpolation for Copilot hook command strings. In Copilot CLI
  hooks, read the exported environment variable through the selected shell:
    - Bash: `node "$PLUGIN_ROOT/scripts/hook.mjs"`
    - PowerShell: `node "$env:PLUGIN_ROOT/scripts/hook.mjs"`
- A PowerShell hook MUST use `$env:PLUGIN_ROOT`, not `${PLUGIN_ROOT}`, unless the selected host
  explicitly guarantees config-token interpolation before PowerShell runs.

### Claude format

- Use `.claude-plugin/plugin.json`; keep plugin components at the plugin root, not inside
  `.claude-plugin/`.
- Use `hooks/hooks.json`, `.mcp.json`, and `.lsp.json` at the plugin root for their respective
  Claude plugin components.
- Claude manifest path fields MUST be plugin-root-relative and start with `./`.
- Use `${CLAUDE_PLUGIN_ROOT}` for bundled scripts and configs. Claude documents inline expansion
  and environment export for hook commands and MCP/LSP subprocesses.
- When Claude semantics are required in VS Code, omit higher-precedence manifest formats or
  publish a separate Claude-format package.

## MCP and LSP requirements

- Prefer a format-specific MCP or LSP file referenced by the selected manifest over one shared
  file that relies on ambiguous root-variable behavior.
- Keep the manifest's config-file path plugin-root-relative. Inside the MCP or LSP config, locate
  bundled executables through the root token or environment syntax guaranteed by that format and
  host.
- For Copilot-format LSP configuration, `${PLUGIN_ROOT}` is documented in `bash`, `powershell`,
  and `cwd` fields. Do not generalize that documented interpolation to Copilot hook fields.
- Validate MCP and LSP command, argument, environment, and working-directory behavior on every
  claimed host.

## Validation

- Confirm which manifest VS Code will select before validating any component paths.
- Validate the emitted directory tree, not only the authoring-source tree.
- Run at least one plugin hook from a working directory outside the plugin root.
- On Windows, exercise the actual PowerShell command and verify `$env:PLUGIN_ROOT` resolves.
- Verify every skill-local link or script reference from the parent directory of its `SKILL.md`.
