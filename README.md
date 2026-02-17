# MetaFlow

[![CI](https://github.com/kiates/MetaFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/kiates/MetaFlow/actions/workflows/ci.yml)
[![Release](https://github.com/kiates/MetaFlow/actions/workflows/release.yml/badge.svg)](https://github.com/kiates/MetaFlow/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/kiates/MetaFlow?display_name=tag)](https://github.com/kiates/MetaFlow/releases)

MetaFlow helps teams manage AI coding metadata in a deterministic, auditable way across local repos, CI, and editor workflows.

It combines:

- a VS Code extension (`src/`)
- a shared engine (`packages/engine`)
- a CLI (`packages/cli`)

If you want reliable metadata layering (profiles, overlays, provenance, drift detection) instead of ad-hoc copy/paste config, MetaFlow is built for that.

## Why MetaFlow

- **Deterministic outcomes**: same inputs produce the same materialized output.
- **Traceable changes**: provenance headers make generated files easy to audit.
- **Safer automation**: drift-aware workflows reduce accidental config clobbering.
- **Editor + CLI parity**: run the same model in VS Code and automation scripts.

## How MetaFlow works (simple)

1. You define your metadata setup in `.metaflow.json` (layers, filters, profile, injection mode).
2. MetaFlow reads those inputs and builds one effective view of what files/settings should exist.
3. When you apply, it writes managed outputs and adds provenance so generated content is traceable.
4. If a managed file was manually changed, drift detection warns before overwrite.
5. The same logic is used by both the VS Code extension and the CLI, so local and CI behavior stay aligned.

## Quick start

From repository root:

```bash
npm ci
npm run build
npm test
```

`npm test` runs engine tests, CLI tests, and extension unit tests.
Run `npm run test:integration` to execute extension-host integration tests.

For extension-specific usage and local install details, see `src/README.md`.

## What’s in this repo

- `src/` — VS Code extension package (`metaflow`)
- `packages/engine/` — pure TypeScript core (`@metaflow/engine`)
- `packages/cli/` — CLI (`@metaflow/cli`)
- `doc/` — requirements, design, test, and validation artifacts
- `.github/` — workflows, templates, governance, and maintenance automation

## Common developer commands

From repository root:

```bash
# Build engine + CLI + extension
npm run build

# Package-specific tests
npm run test:engine
npm run test:cli

# Extension tests
npm run test:unit
npm run test:integration
```

Note: root `npm test` does not include `test:integration`.

## CI and release automation

- `.github/workflows/ci.yml` — minimal build + unit test checks for PRs and `main`
- `.github/workflows/release.yml` — package VSIX + create GitHub Release on `v*` tags, with optional manual marketplace publish (`publish_to_marketplaces`)
- `.github/dependabot.yml` — scheduled dependency updates

### Release secrets

- `VSCE_PAT` — required when `publish_to_marketplaces` is enabled
- `OVSX_PAT` — required when `publish_to_marketplaces` is enabled

## Contributing

See `.github/CONTRIBUTING.md`.

## Security

See `.github/SECURITY.md`.

## License

MIT
