# MetaFlow

Compose and apply layered AI metadata for GitHub Copilot and other coding agents from shared repositories into your VS Code workspace, without ad-hoc copy and paste.

> [!IMPORTANT]
> MetaFlow is in `v0.x` preview. Expect workflow and command-surface adjustments as feedback is incorporated.

## Why MetaFlow

- Keep instructions, prompts, skills, and agents consistent across projects.
- Resolve shared metadata into one effective workspace view before anything is written.
- Protect local edits with drift-aware synchronization and provenance headers.
- Use the same overlay model in the VS Code extension and the CLI.

## The MetaFlow sidebar

MetaFlow adds four views to the Activity Bar:

| View                | What it helps you do                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Metadata**     | Review metadata sources, warnings, rescans, and repository update actions.                                                                                |
| **Profiles**        | Switch the active profile for the current workspace.                                                                                                      |
| **Capabilities**    | Enable or disable capabilities, toggle whole folder branches in tree mode, browse underlying artifact directories and files, and open capability details. |
| **Effective Files** | Inspect the resolved files, where they came from, and whether they are settings-backed or synchronized.                                                   |

## Get started in VS Code

### 1. Install MetaFlow

Install a release VSIX from the [Releases](https://github.com/dynfxdigital/MetaFlow/releases) page:

```powershell
powershell -File ./src/scripts/install-vsix.ps1 -VsixPath ./<metaflow-release>.vsix -Cli code
```

Or install directly with:

```bash
code --install-extension <metaflow-release>.vsix --force
```

### 2. Initialize configuration

Open the Command Palette and run **MetaFlow: Initialize Configuration**. MetaFlow scaffolds `.metaflow/config.jsonc`, discovers available repositories and capabilities, and leaves capability activation opt-in so you can choose what to enable.

If you want the full config contract, migration behavior, command list, or settings reference, use [src/README.md](src/README.md).

### 3. Refresh and let automatic mode do the routine work

The normal workflow is automatic mode. After you save configuration changes, MetaFlow refreshes the overlay and applies the result for you.

Use **MetaFlow: Preview Overlay** when you want to inspect pending changes without writing files. Use **MetaFlow: Apply Overlay** when you want an explicit write step.

## Everyday workflow

| Task                        | Where to do it                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Switch profile**          | Use the **Profiles** view or **MetaFlow: Switch Profile**.                                                                                                 |
| **Toggle a capability**     | Check or uncheck it in the **Capabilities** view. In tree mode, folder rows also toggle every descendant capability in that branch.                        |
| **Browse layer artifacts**  | Expand artifact rows such as `instructions` or `skills` in the **Capabilities** tree to inspect nested folders and files with friendly names and tooltips. |
| **Inspect a capability**    | Open the capability details view from a capability row.                                                                                                    |
| **Review effective output** | Browse **Effective Files** to see resolved files, sources, and realization mode.                                                                           |
| **Review metadata repos**   | Use **AI Metadata** to rescan repositories and review update status.                                                                                       |
| **Pull repo updates**       | Use the inline repo actions or **MetaFlow: Pull Repository Updates**.                                                                                      |
| **Review local drift**      | Run **MetaFlow: Promote Changes** to see which managed synchronized files changed locally.                                                                 |

In the **Capabilities** tree, folder checkboxes use a deterministic branch rule: checked means every descendant capability is enabled; unchecked means the branch is either partially enabled or fully disabled. Checking the folder enables the whole branch, and unchecking it disables the whole branch.

Artifact rows inside a capability stay toggleable at the class level, but they also expand when metadata exists under that class. Their nested folders and files are browse-only, prefer user-facing names from metadata when available, and show tooltips with the canonical path plus description.

`MetaFlow: Promote Changes` is an awareness step in the extension. It reports drift and helps you decide what to copy back upstream manually. Automated promotion belongs in the CLI workflow.

## Built-in MetaFlow capability

MetaFlow includes bundled starter metadata so you can try the workflow without setting up a large external metadata repository first.

**Built-in layer mode** enables the bundled capability as a read-only, settings-only projection that the extension tracks in workspace state. It does not mutate `.metaflow/config.jsonc`.

**Synchronize mode** copies the bundled files into editable workspace `.github` paths. Only these synchronized files participate in drift detection and promote workflows.

The intended path is:

1. Start with the built-in capability to learn the workflow.
2. Synchronize the files when you want to inspect or edit them locally.
3. Externalize the patterns that work into a shared team or organization metadata repository.

## Where to go next

| Topic                                                                         | Document                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| Full extension reference: config schema, command surface, settings, manifests | [src/README.md](src/README.md)                   |
| CLI commands, automated promotion, validation, watch workflows                | [packages/cli/README.md](packages/cli/README.md) |
| Troubleshooting and support                                                   | [SUPPORT.md](SUPPORT.md)                         |
| Contributor workflow, testing, release readiness                              | [AGENTS.md](AGENTS.md)                           |
| Release process                                                               | [RELEASING.md](RELEASING.md)                     |

## Support

- Usage help and issue routing: [SUPPORT.md](SUPPORT.md)
- Bug reports and feature requests: [GitHub Issues](https://github.com/dynfxdigital/MetaFlow/issues)
- Security reporting: [.github/SECURITY.md](.github/SECURITY.md)

## License

MIT
