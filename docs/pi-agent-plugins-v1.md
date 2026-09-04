# Pi Agent Plugins v1 target

MetaFlow can project portable skills from the active capability profile into
project-local Agent Plugins 1.0 packages for Pi. The target is explicit,
default-off, skills-only, and preserves each source plugin as a separate package.

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

Use compatibility version 6 and explicitly enable the Pi target in the project
configuration:

```jsonc
{
    "compatibilityVersion": 6,
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
`plugin.json` and immediate `skills/<name>/SKILL.md` children. Each enabled
capability projects to `.pi/plugins/<plugin.json name>` and retains the portable
manifest name, version, and descriptive metadata. MetaFlow does not create a
synthetic package identity or write provenance into projected package content.

Duplicate plugin names block the complete target because two sources cannot own
the same project-plugin root. Pi skill commands are session-global, so duplicate
skill names across active plugins also block rather than selecting a winner.
Plugins that declare `mcp.json` or non-empty client `extensions` are blocked in
this skills-only slice; publishing the same identity while silently dropping
declared behavior would not be a faithful projection.

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
.pi/plugins/<original-plugin-name>/
  plugin.json                 # original portable identity and metadata
  skills/<name>/SKILL.md      # exact validated bytes
.pi/plugins/<another-plugin-name>/
  ...
.metaflow/pi-target-state.json
```

Package order, manifest serialization, and managed hashes are deterministic.
Source provenance and ownership are stored in the separate target state rather
than added to any portable manifest. A verified ledger from the unreleased
aggregate implementation is migrated on the next successful Apply: the old
`.pi/plugins/metaflow.project` root is removed and the original-name roots are
installed in the same journaled reconciliation.

Pi loads project plugins only after the project is trusted. In non-interactive
Pi runs, use Pi's normal `--approve` option when the project has not already been
trusted.

## Ownership and cleanup

MetaFlow owns only the package roots recorded in its separate target ledger.
Preview is read-only. Apply and watch reconcile the complete managed set through
one multi-root journal, remove stale packages and skills, and recover interrupted
reconciliations.

An untracked generated root, an unexpected file, or changed managed content
blocks apply, validate, and clean. `metaflow apply --force` does not override Pi
target drift. Resolve or preserve that content explicitly before retrying.

Disable `targets.pi.enabled`, or run `metaflow clean`, to remove all verified
managed package roots and the ledger. Cleanup preserves unrelated `.pi` content,
including unowned plugins and user-authored `.pi/mcp.json`.

## Portability boundary

Only strict portable manifest metadata and skills are emitted. MCP definitions
and client extensions block projection until MetaFlow can reproduce their
behavior safely. Instructions, prompts, commands, agents, hooks, LSP, monitors,
and MetaFlow governance metadata remain host-specific and are reported as
non-portable where applicable. MetaFlow never mutates global Pi state.

## Troubleshooting

- No packages after Preview: Preview never writes. Run Apply after confirming the
  config uses compatibility version 6 and the Pi target is explicitly enabled.
- No skill in Pi: confirm `pi-agent-plugins` is installed, the project is trusted,
  and the capability is selected by the active profile. Use `/plugin list` or
  `/plugin doctor`, then `/plugin reload` after changing generated content.
- Projection is blocked: read the diagnostic for a duplicate plugin or skill,
  declared MCP/client-extension behavior, invalid portable package, untracked
  same-name root, or drifted managed file. MetaFlow will not choose a duplicate
  winner, publish an incomplete identity, or overwrite unowned content.
- No MCP server appears: this is expected. The first target is skills-only and
  does not require or configure `pi-mcp-adapter`.
- Disable or Clean is blocked: restore the recorded managed bytes or preserve and
  relocate user-authored content before retrying. MetaFlow does not delete
  content whose ownership it cannot prove.

## Extending the target

Contributors must keep portable serialization separate from the legacy
Copilot/MetaFlow manifest path. New portable components must be validated by the
shared Agent Plugins inspector, represented by deterministic projection inputs,
and covered by containment, ownership, loss-diagnostic, and host-client tests.
Do not add MetaFlow fields to the strict root manifest. MCP output requires a
separately accepted trust-change contract before implementation.
