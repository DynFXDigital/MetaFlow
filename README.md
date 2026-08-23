# MetaFlow

Solve AI metadata sprawl by composing and applying layered AI metadata for GitHub Copilot and other coding agents from shared repositories into your VS Code workspace, without ad-hoc copy and paste.

> [!IMPORTANT]
> MetaFlow is in `v0.x` preview. Expect workflow and command-surface adjustments as feedback is incorporated.

![MetaFlow sidebar overview](src/images/metaflow-sidebar-overview.png)

_MetaFlow brings shared AI metadata, capabilities, profiles, and effective output review into one VS Code workflow._

## Why MetaFlow

- Deploy shared AI metadata consistently across large teams and organizations.
- Package related metadata into reusable capabilities made up of instructions, prompts, skills, agents, and hooks.
- Experiment with different metadata combinations through profiles and selective capability activation.
- Resolve everything into one effective workspace view before anything is written.
- Protect local edits with drift-aware synchronization and provenance tracking.

## What MetaFlow Enables

- Standardize AI coding guidance across many repositories without copying metadata by hand.
- Browse and activate reusable capabilities instead of managing loose files.
- Switch between different metadata setups with a few clicks using profiles.
- Roll out shared metadata updates deliberately by seeing when upstream repositories changed and deciding when to pull them.
- Materialize effective metadata into local `.github` folders when file-based consumption or checked-in snapshots are useful.
- Keep file-based metadata local-only with `.gitignore` when it should not be committed.
- Review synchronized changes as normal file diffs and promote useful local improvements back to shared metadata sources.
- Choose which metadata types are delivered through VS Code settings versus synchronized files.
- Choose whether settings-backed metadata lands at the user, workspace, or workspace-folder scope.

## The MetaFlow sidebar

MetaFlow adds four views to the Activity Bar:

| View                | What it helps you do                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Metadata**     | Review metadata sources, warnings, rescans, and repository update actions.                                                                                      |
| **Profiles**        | Switch the active profile for the current workspace.                                                                                                            |
| **Capabilities**    | Enable or disable whole capabilities, toggle whole folder branches in tree mode, browse underlying artifact directories and files, and open capability details. |
| **Effective Files** | Inspect the resolved files, where they came from, and whether they are settings-backed or synchronized.                                                         |

## Get Started

Install MetaFlow from the VS Code Marketplace, open your workspace, and initialize or connect your metadata sources.

From there, the normal workflow is:

- Connect one or more shared metadata repositories.
- Browse available capabilities.
- Enable the capabilities your workspace needs.
- Switch profiles when you want to compare different metadata combinations.
- Review effective output before or after changes are applied.
- Pull upstream metadata updates when you are ready.

## Everyday Workflow

| Task                        | Where to do it                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Switch profile**          | Use the **Profiles** view.                                                                                                                                                                                                                          |
| **Toggle a capability**     | Check or uncheck it in the **Capabilities** view. In tree mode, folder rows also toggle every descendant capability in that branch. Capabilities are atomic: artifact folders inside a capability are browse-only, not partial enablement switches. |
| **Browse capabilities**     | Expand capability branches and artifact rows to inspect nested folders and files with friendly names and tooltips.                                                                                                                                  |
| **Inspect a capability**    | Open the capability details view from a capability row.                                                                                                                                                                                             |
| **Review effective output** | Browse **Effective Files** to see resolved files, sources, and realization mode.                                                                                                                                                                    |
| **Review metadata repos**   | Use **AI Metadata** to rescan repositories and review update status.                                                                                                                                                                                |
| **Pull repo updates**       | Use the inline repo actions when shared metadata changes upstream.                                                                                                                                                                                  |
| **Review local drift**      | Use MetaFlow's synchronization and promote workflows to see what changed locally and what should be pushed back upstream.                                                                                                                           |

Tree layout preferences are local workspace state, not VS Code settings. MetaFlow persists the Capabilities layout and Effective Files layout in `.metaflow/state.json`, defaulting to hierarchical Capabilities and flat Effective Files.

In the **Capabilities** tree, folder checkboxes use a deterministic branch rule: checked means every descendant capability is enabled; unchecked means the branch is either partially enabled or fully disabled. Checking the folder enables the whole branch, and unchecking it disables the whole branch.

Artifact rows inside a capability expand when metadata exists under that class. The rows and their nested folders/files are browse-only, prefer user-facing names from metadata when available, and show tooltips with the canonical path plus description.

## Shared Metadata Workflows

- **Centralize metadata at scale**: keep instructions, prompts, agents, skills, and hooks in shared repositories and deploy them consistently across many workspaces.
- **Experiment safely**: use profiles and selective capability activation to compare different metadata combinations without rebuilding your setup by hand.
- **Check in the effective state when needed**: synchronize metadata into the local `.github` folder when you want a reviewable, reproducible snapshot in the repository.
- **Keep local-only materialization out of git**: use `.gitignore` when file-based metadata is required locally but should not be committed.
- **Promote improvements upstream**: when a synchronized local copy is improved, treat it as a candidate to reverse-sync back into the shared metadata repository for broader reuse.
- **Mix delivery models by type**: keep some artifact types settings-backed while materializing others as files.
- **Activate plugin-capable capabilities locally**: route supported artifact types through local Copilot plugin discovery instead of only alternate-path settings or `.github` synchronization.
- **Choose the right scope for settings injection**: deliver settings-backed metadata at the user, workspace, or workspace-folder level depending on how your team operates.

## Built-in MetaFlow Capability

MetaFlow includes a bundled starter capability so you can try the workflow before setting up a larger shared metadata repository.

- Use it to understand the capability model quickly.
- Use the bundled metadata-authoring guidance when you need to create or refine README package descriptors, instructions, prompts, agents, skills, hooks, or plugin manifests from the current context.
- Synchronize it locally when you want editable files.
- Bundled authoring instructions stay narrowly scoped; the built-in set does not rely on exact `applyTo: "**"` injections.
- Externalize the patterns that work into a shared team or organization metadata repository.

## Package README Descriptors

New package roots use `README.md` as the human-facing descriptor. Its portable front matter contains
the required `name`, `description`, and valid publisher-assigned UUID `id`; the Markdown body is
free-form package documentation. Recommended topics include purpose, when to use the package,
included components, activation, trust, compatibility, and further documentation. These topics do
not impose required headings, and detailed agent behavior remains in component files.

Existing package roots that still have `CAPABILITY.md` remain supported through the legacy fallback
when README is absent. README and CAPABILITY are never merged. Use `MetaFlow: Create README
Descriptor` to seed the package-root descriptor for new authoring.

## Capability Plugin Metadata

MetaFlow can also treat a capability as an agent-plugin-compatible manifest when the capability opts in explicitly.

- Place a `plugin.json` file beside the package-root `README.md`.
- Keep plugin runtime fields in `plugin.json`; do not duplicate them in README front matter.
- MetaFlow validates the embedded plugin manifest and surfaces errors or warnings in the normal Problems and diagnostics flows.
- Use `MetaFlow: Create README Descriptor` to migrate an existing legacy package when desired; it preserves the legacy body and keeps legacy-only fields out of README front matter.
- Use `MetaFlow: Maintain Plugin Manifest (plugin.json)` to backfill or repair managed plugin manifest fields for an existing capability without replacing unrelated `plugin.json` content.
- Use `MetaFlow: Maintain All Plugin Manifests (plugin.json)` to sweep every capability directory in a selected metadata repository and backfill missing plugin data in one pass.

The maintained plugin manifest contract currently expects:

- `name`: a stable plugin identifier such as `my-capability`
- `version`: a SemVer plugin version such as `1.0.0`
- `description`: a concise user-facing summary
- `keywords`: capability-specific plugin discovery tags authored in `plugin.json`; MetaFlow copies them into the generated marketplace manifest without adding generic tags
- `agents`: defaults to `.github/agents` when MetaFlow scaffolds or repairs the manifest
- `skills`: defaults to `.github/skills` when MetaFlow scaffolds or repairs the manifest
- `rules`: defaults to `.github/instructions` when MetaFlow scaffolds or repairs the manifest
- `metaflow.pluginHosts`: an array of supported consumers such as `github-copilot`
- `metaflow.minimumMetaflowVersion`: the minimum MetaFlow version range expected by the plugin manifest

MetaFlow also builds a normalized internal plugin catalog from valid capability plugin manifests and can generate `.github/plugin/marketplace.json` from those manifests for discovery surfaces.

### Portable Agent Plugins 1.0 packages

MetaFlow treats the published Agent Plugins 1.0 contract as a separate compatibility profile from the maintained host/Copilot manifest above. A portable package declares the canonical `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` identifier and follows the standard's closed root manifest, fixed `skills/*/SKILL.md` discovery, and optional root `mcp.json` contract.

- Portable names may contain lowercase periods as well as letters, numbers, and hyphens; `version` is optional and is not required to be SemVer.
- Unknown root fields and a non-object `extensions` field are reported and ignored as required by the standard. Other manifest schema violations reject portable loading.
- Invalid skills and MCP server entries are isolated from independently valid components, and filesystem-resolved package paths must remain inside the plugin root.
- Client-specific manifest data belongs under reverse-domain keys in `extensions`; MetaFlow/Copilot fields are not added to the portable root schema.
- Portable packages are not serialized through MetaFlow's existing Copilot marketplace projection. Classification and compatibility do not imply installation, enablement, trust, or host-effective activation.

### Pi project target

Projects can explicitly enable a skills-only Pi target with compatibility version 5 and `targets.pi.enabled: true`. MetaFlow aggregates valid portable skills from the active capability profile into `.pi/plugins/metaflow.project`, records ownership separately in `.metaflow/pi-target-state.json`, and leaves Pi discovery to `pi-agent-plugins`. Preview is read-only; apply, validate, watch, disable, and clean share the same fail-closed ownership contract. MetaFlow does not generate Pi MCP configuration or mutate global Pi state.

See [Pi Agent Plugins v1 target](docs/pi-agent-plugins-v1.md) for prerequisites, configuration, lifecycle, cleanup, and portability limits.

Plugin-first is now the built-in default for plugin-capable artifact types. A fresh MetaFlow config defaults `instructions`, `skills`, `agents`, and Copilot hook artifacts to `plugin`; prompts remain settings-backed because Copilot plugin discovery does not consume MetaFlow prompt directories directly.

An explicit config looks like this:

```jsonc
{
    "injection": {
        "instructions": "plugin",
        "skills": "plugin",
        "agents": "plugin",
        "prompts": "settings",
    },
}
```

When `MetaFlow: Apply` runs, MetaFlow injects those capability roots into the user-scoped `chat.pluginLocations` setting, which VS Code uses as the local plugin registration and enablement map for repo-backed plugins.

Current scope:

- `plugin` is the default mode for `instructions`, `skills`, `agents`, and hook artifacts (`hooks.json`, `hooks/**`, or `.github/hooks/**`)
- `prompts` remain `settings` or `synchronize` because Copilot plugin discovery does not consume MetaFlow prompt directories directly
- legacy top-level `hooks.preApply` and `hooks.postApply` remain settings-backed script paths; they are distinct from Copilot plugin hook configuration
- `plugin.json` must exist at the capability root and its shared `name` and `description` should agree with `README.md`.

## Where to go next

| Topic                                                                         | Document                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Full extension reference: config schema, command surface, settings, manifests | [src/README.md](src/README.md)                             |
| CLI commands, automated promotion, validation, watch workflows                | [packages/cli/README.md](packages/cli/README.md)           |
| Pi Agent Plugins v1 target setup, lifecycle, and safety boundaries            | [docs/pi-agent-plugins-v1.md](docs/pi-agent-plugins-v1.md) |
| Troubleshooting and support                                                   | [SUPPORT.md](SUPPORT.md)                                   |
| Contributor workflow and testing                                              | [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)         |
| Release process                                                               | [RELEASING.md](RELEASING.md)                               |

## Support

- Usage help and issue routing: [SUPPORT.md](SUPPORT.md)
- Bug reports and feature requests: [GitHub Issues](https://github.com/dynfxdigital/MetaFlow/issues)
- Security reporting: [.github/SECURITY.md](.github/SECURITY.md)

## License

MIT
