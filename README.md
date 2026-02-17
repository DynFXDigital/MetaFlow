# MetaFlow

[![CI](https://github.com/kiates/MetaFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/kiates/MetaFlow/actions/workflows/ci.yml)
[![Release](https://github.com/kiates/MetaFlow/actions/workflows/release.yml/badge.svg)](https://github.com/kiates/MetaFlow/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/kiates/MetaFlow?display_name=tag)](https://github.com/kiates/MetaFlow/releases)

MetaFlow helps teams manage GitHub Copilot metadata in a deterministic, auditable way across local repos, CI, and editor workflows.

MetaFlow gives you one consistent way to compose and apply layered AI metadata (instructions, prompts, skills, agents) without ad-hoc copy/paste.

## Why teams use MetaFlow

- **Deterministic output**: same config + same metadata input = same result.
- **Safe updates**: drift detection helps avoid overwriting local edits.
- **Auditability**: materialized files include provenance headers.
- **Editor + automation parity**: VS Code and CLI share the same engine behavior.

## What it manages

- Instructions and prompts
- Skills and custom agents
- Layered policy/profile composition
- Settings-backed and materialized artifact routing

## Quick start

### 1) Install

Install a release VSIX from the [Releases](https://github.com/kiates/MetaFlow/releases) page.

```bash
code --install-extension <metaflow-release>.vsix
```

### 2) Initialize config

In VS Code, run:

- `MetaFlow: Init Config`

Then edit `.metaflow/config.jsonc` and set at least:

- `metadataRepo.localPath`
- `layers`
- `activeProfile` (optional; defaults can be used)

### 3) Use automatic mode (default)

Automatic mode is the recommended workflow and is enabled by default (`metaflow.autoApply: true`).

After saving config changes, MetaFlow automatically refreshes and applies overlay results.

In normal use, you do not need to run apply commands manually.

### 4) Optional manual controls

Run:

- `MetaFlow: Preview`
- `MetaFlow: Apply`

Use manual commands when you want explicit control (for example, checking pending changes before writing).

## Typical workflow

1. Adjust layers/profiles in `.metaflow/config.jsonc`.
2. Save config; MetaFlow auto-refreshes and auto-applies.
3. Check status/output if you need to verify results.
4. Use preview/apply only when you want explicit manual control.
5. Use promote/drift workflows when local edits should move upstream.

`.metaflow/config.jsonc` can be either checked in (team-shared behavior) or kept local/untracked (user-isolated behavior). Runtime state stays in `.metaflow/state.json` and is typically ignored.

## Command overview

Core VS Code commands (manual controls and diagnostics):

- `MetaFlow: Refresh`
- `MetaFlow: Preview`
- `MetaFlow: Apply`
- `MetaFlow: Clean`
- `MetaFlow: Status`
- `MetaFlow: Switch Profile`
- `MetaFlow: Toggle Layer`
- `MetaFlow: Open Config`
- `MetaFlow: Init Config`
- `MetaFlow: Promote`

For full command and setting details, see [src/README.md](src/README.md).

## Troubleshooting

- Use `MetaFlow: Status` and the MetaFlow output channel first.
- Validate your metadata repo path and layer names in `.metaflow/config.jsonc`.
- In automatic mode, save config and inspect output; use `Preview`/`Apply` only for explicit control.
- If files are skipped, check drift output and decide whether to promote or force overwrite via CLI.

## Support

- Usage help and troubleshooting: [SUPPORT.md](SUPPORT.md)
- Bug reports and feature requests: GitHub Issues
- Security reporting: [.github/SECURITY.md](.github/SECURITY.md)

## For contributors and maintainers

Developer and project operations docs are intentionally separated from this user-focused README:

- Contributing guide: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- Architecture and contributor workflow: [AGENTS.md](AGENTS.md)
- Release process: [RELEASING.md](RELEASING.md)
- CLI deep usage: [packages/cli/README.md](packages/cli/README.md)
- Formal requirements/design/test docs: [doc/](doc/)

## License

MIT
