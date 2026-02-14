# MetaFlow

MetaFlow is an open-source monorepo for AI metadata overlay tooling:

- VS Code extension (`src/`)
- Shared core engine (`packages/engine`)
- Command-line interface (`packages/cli`)

The system provides deterministic overlay resolution, materialization with provenance, profile/layer management, and drift-safe workflows for AI coding metadata.

## Repository layout

- `src/` — VS Code extension package (`metaflow`)
- `packages/engine/` — pure TypeScript engine (`@metaflow/engine`)
- `packages/cli/` — CLI (`@metaflow/cli`)
- `doc/` — traceability and validation documentation
- `.github/` — CI, release workflows, issue/PR templates, governance docs

## Quick start

```bash
npm ci
npm run build
npm test
```

## Common commands

From repository root:

```bash
# Build engine + cli + extension
npm run build

# Engine tests
npm run test:engine

# CLI tests
npm run test:cli

# Extension unit tests (fast)
npm run test:unit

# Extension integration tests (Extension Host)
npm run test:integration
```

## VS Code extension docs

See `src/README.md` for extension usage, commands, settings, and local VSIX install steps.

## Open source maintenance and release

This repository includes GitHub automation for extension lifecycle:

- `.github/workflows/ci.yml` — build/test/package checks on PRs and `main`
- `.github/workflows/release.yml` — package + publish on `v*` tags (and manual dispatch)
- `.github/dependabot.yml` — weekly npm/actions dependency updates

### Release secrets

Set repository secrets before publishing:

- `VSCE_PAT` — VS Code Marketplace token
- `OVSX_PAT` — Open VSX token

## Contributing

See `.github/CONTRIBUTING.md`.

## Security

See `.github/SECURITY.md`.

## License

MIT
