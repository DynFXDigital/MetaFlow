# Pi Agent Plugins v1 target

MetaFlow can project portable skills from the active capability profile into one
project-local Agent Plugins 1.0 package for Pi. The target is explicit,
default-off, and skills-only.

## Compatibility

The validated compatibility target is:

- Node.js 20 or newer
- Pi 0.84.2
- `pi-agent-plugins` 0.1.8
- Agent Plugins schema 1.0.0

Pi 0.84 or newer is required by `pi-agent-plugins`. MetaFlow does not install or
configure Pi packages, so install the client separately:

```bash
pi install npm:pi-agent-plugins@0.1.8
```

`pi-mcp-adapter` is not required for MetaFlow's skills-only target. MetaFlow does
not generate `.pi/mcp.json`; MCP projection remains outside this release.

## Enable the target

Use compatibility version 5 and explicitly enable the Pi target in the project
configuration:

```jsonc
{
    "compatibilityVersion": 5,
    "metadataRepos": [{ "id": "primary", "localPath": "../my-ai-metadata" }],
    "layerSources": [{ "repoId": "primary", "path": "company/core" }],
    "profiles": {
        "default": {
            "enabledCapabilities": ["primary:company/core"],
        },
    },
    "activeProfile": "default",
    "targets": {
        "pi": { "enabled": true },
    },
}
```

An eligible capability is a strict Agent Plugins 1.0 package with a root
`plugin.json` and immediate `skills/<name>/SKILL.md` children. MetaFlow combines
the valid skills from enabled capabilities in the active profile. Duplicate
skill names block the complete target instead of choosing a winner.

## Preview, apply, and validate

From the CLI:

```bash
metaflow preview
metaflow apply
metaflow validate
```

From VS Code, use `MetaFlow: Refresh`, `MetaFlow: Preview`, `MetaFlow: Apply`,
and `MetaFlow: Status`. Existing MetaFlow auto-apply policy also governs the Pi
target; enabling `targets.pi` does not create a second background policy.

Apply creates:

```text
.pi/plugins/metaflow.project/
  plugin.json
  skills/<name>/SKILL.md
.metaflow/pi-target-state.json
```

The generated package has a fixed `metaflow.project` identity and a deterministic
content-derived version. Source provenance is stored in the separate target
state rather than added to the portable manifest.

Pi loads project plugins only after the project is trusted. In non-interactive
Pi runs, use Pi's normal `--approve` option when the project has not already been
trusted.

## Ownership and cleanup

MetaFlow owns only the fixed generated package root and its separate target
ledger. Preview is read-only. Apply and watch replace the complete package
transactionally, remove stale skills, and recover interrupted reconciliations.

An untracked generated root, an unexpected file, or changed managed content
blocks apply, validate, and clean. `metaflow apply --force` does not override Pi
target drift. Resolve or preserve that content explicitly before retrying.

Disable `targets.pi.enabled`, or run `metaflow clean`, to remove a verified
MetaFlow-managed package and ledger. Cleanup preserves unrelated `.pi` content,
including other plugins and user-authored `.pi/mcp.json`.

## Portability boundary

Only strict portable skills are emitted. MCP definitions are diagnosed as
deferred, while instructions, prompts, commands, agents, hooks, LSP, monitors,
and MetaFlow governance metadata remain host-specific. Compatibility diagnostics
make omissions visible; MetaFlow never treats those artifacts as Pi-supported or
mutates global Pi state.
