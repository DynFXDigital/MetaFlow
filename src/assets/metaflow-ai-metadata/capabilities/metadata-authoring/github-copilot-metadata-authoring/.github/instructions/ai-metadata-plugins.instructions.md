---
description: 'Requirements for Agent Plugins v1 and host-specific plugin manifests, including plugin-local skill, hook, MCP, and LSP paths.'
applyTo: '**/plugin.json,**/.plugin/plugin.json,**/.github/plugin/plugin.json,**/.claude-plugin/plugin.json,**/hooks.json,**/com.github.copilot/hooks/*.json,**/.github/hooks/*.json,**/mcp.json,**/.mcp.json,**/lsp.json,**/.lsp.json,**/lsp-config/servers.json'
---

# Agent Plugin Packaging

Use these requirements when a distributable agent plugin contains skills, hooks, MCP servers, LSP
servers, or scripts. A matching filename does not make path or runtime semantics portable.

## Sources and versioning

- Last reviewed: 2026-09-03
- Sources:
    - https://agent-plugins.org/specification
    - https://code.visualstudio.com/docs/agent-customization/agent-plugins
    - https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
    - https://docs.github.com/en/copilot/reference/hooks-reference
    - https://github.com/github/copilot-cli/blob/main/changelog.md
    - https://code.claude.com/docs/en/plugins-reference
    - https://open-plugins.com/plugin-builders/specification
    - https://open-plugins.com/agent-builders/components/hooks
    - https://agentskills.io/specification

## Select the format before authoring paths

- If a request says only "capability" or "agent plugin" and the desired format cannot be inferred,
  you MUST ask whether the user wants a GitHub Copilot agent plugin or a strict Agent Plugins v1
  package before creating or rewriting files.
- You MUST identify the owning plugin format and target hosts before choosing manifest, hook,
  MCP, or LSP paths.
- Treat the exact Agent Plugins v1 `$schema` value as a positive format marker. Do not add
  Copilot, OpenPlugin, Claude, or MetaFlow manifest fields to a strict v1 package.
- In MetaFlow, a root `plugin.json` without that marker remains the backward-compatible Copilot
  format. Adding the canonical marker is the explicit opt-in to Agent Plugins v1 packaging; it is
  not a cosmetic schema annotation.
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

- A backward-compatible hook-bearing capability MAY ship both the legacy root Copilot pair
  (`plugin.json` plus `hooks.json`) and the OpenPlugin compatibility pair
  (`.plugin/plugin.json` plus `hooks/hooks.json`). Both hook files MUST address the same packaged
  script through their documented plugin-root contract. This is MetaFlow's current built-in
  compatibility layout while Agent Plugins v1 support is still maturing in VS Code.
- A strict Agent Plugins v1 package MUST instead use the canonical root `$schema` and place VS
  Code/Copilot hook configuration at `com.github.copilot/hooks/hooks.json`. Do not add an
  `.plugin/plugin.json` shim to that emitted package: the higher-precedence legacy manifest would
  prevent VS Code from selecting the strict v1 format.
- A root-only plugin hook that launches a repository-relative `.github/hooks` script is unsafe
  when the capability is registered as an external plugin. Package the script and resolve it from
  the plugin root.
- A hook synchronized into the consuming repository at `.github/hooks/*.json` is settings-injected
  repository configuration, not plugin injection. It MAY use a repository-root-relative script
  path when that script is also synchronized into the repository and the target hosts are
  validated.
- Keep these outputs distinct even when they delegate to the same source implementation.

## Format contracts

### Agent Plugins v1

- Use the built-in `agent-plugins` capability for the strict manifest, fixed `skills/`
  and `mcp.json` discovery locations, extension namespaces, containment, and validation rules.
- Use the built-in `agent-skills` capability for every skill under `skills/`.
- Require the canonical v1 `$schema` value in root `plugin.json`. Preserve a recognized strict-v1
  package as strict v1 during maintenance; stop on invalid, mixed, or unsupported schema versions
  instead of converting it to a host-specific manifest.
- Keep Copilot-specific manifest data under the `"com.github.copilot"` key in `extensions` and
  Copilot-specific files under the matching top-level `com.github.copilot/` namespace. VS Code
  discovers v1 plugin hooks at `com.github.copilot/hooks/hooks.json`; use `${PLUGIN_ROOT}` for
  packaged hook targets.
  These files are a client extension, not a third portable component alongside `skills/` and
  `mcp.json`.
- Do not assume GitHub Copilot's legacy format is a superset of Agent Plugins v1.

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
- VS Code supports `${PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` for Copilot plugin paths, expands
  the selected token at runtime, and exposes it to hook processes. Prefer `${PLUGIN_ROOT}` for new
  cross-format compatibility assets.
- Copilot CLI also exports `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_ROOT`. When a
  shell-specific hook field reads the environment directly, use that shell's syntax:
    - Bash: `node "$PLUGIN_ROOT/scripts/hook.mjs"`
    - PowerShell: `node "$env:PLUGIN_ROOT/scripts/hook.mjs"`
- Validate both the default command and every shell-specific override on the claimed hosts.

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
- Confirm that a strict-v1 package uses `com.github.copilot/hooks/hooks.json` and that a legacy
  Copilot package uses root `hooks.json`; do not treat those locations as interchangeable.
- Validate the emitted directory tree, not only the authoring-source tree.
- Run at least one plugin hook from a working directory outside the plugin root.
- On Windows, exercise the actual PowerShell command and verify `$env:PLUGIN_ROOT` resolves.
- Verify every skill-local link or script reference from the parent directory of its `SKILL.md`.
