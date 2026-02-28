# Agent & Contributor Guidelines — MetaFlow

## Overview

MetaFlow is a VS Code extension that implements the MetaFlow Reference Architecture as a pure TypeScript extension. It provides deterministic overlay resolution, materialization with provenance, and profile/layer management for AI coding agent metadata.

## Quick Start

```powershell
cd .
npm install
npm -w @metaflow/engine run build
npm -w @metaflow/cli run build
cd src
npm run compile
npm run test:unit   # unit tests (fast, no Extension Host)
npm run gate:integration # integration tests (launches Extension Host without pretest coupling)
npm run lint
cd ..
npm -w @metaflow/engine test    # engine API tests
npm -w @metaflow/cli test       # CLI integration tests
npm test                         # all tests (engine + CLI + extension unit)
npm run gate:quick               # build + lint + engine/cli/extension unit
npm run gate:integration         # extension-host integration gate
npm run gate:full                # quick gate + integration gate
```

## Architecture

- `packages/engine/src/config/` — Config model, loader, path discovery
- `packages/engine/src/engine/` — Pure TS engine (no `vscode` imports): overlay, filter, profile, classifier, materializer, provenance, drift, managed state, settings injector
- `packages/engine/test/` — Engine standalone tests (Mocha)
- `packages/cli/src/` — TypeScript CLI (Commander.js): status, preview, apply, clean, profile, promote (--auto), validate, watch, init
- `packages/cli/test/` — CLI integration tests (Mocha)
- `src/src/commands/` — VS Code command handlers, init config
- `src/src/views/` — TreeView providers, status bar, output channel
- `src/src/diagnostics/` — Problems panel integration
- `src/src/extension.ts` — Entry point; wires everything together
- `src/src/test/unit/` — Mocha unit tests (run in Node)
- `src/src/test/integration/` — Mocha integration tests (run in Extension Host)
- `src/test-workspace/` — Fixture for both test types
- `doc/` — Traceability docs: SRS, SDD, TCS, FTD, FTR, plus validation (VSRS, VTC, VTP, VTR)
- `.plan/` — Phase plans (read-only reference)

## Key Conventions

- **Engine modules must not import `vscode`** — enables fast unit testing in Node.
- **Disposable pattern** — all VS Code subscriptions tracked in `context.subscriptions`.
- **TreeDataProvider pattern** — all 4 views implement `onDidChangeTreeData`.
- **ExtensionState** — shared mutable state with `EventEmitter<void>` for change notification.
- **TypeScript strict mode** — `tsconfig.json` uses `strict: true`.
- **JSONC-tolerant** — `jsonc-parser` used for config files supporting comments and trailing commas.

## Test Practices

- Run `npm run test:unit` for fast feedback (no Extension Host).
- Run `npm run gate:integration` (alias: `npm run test:integration`) for extension-host integration tests.
- Run `npm run gate:quick` for the local CI-equivalent quality gate.
- Run `npm run gate:full` before release-sensitive changes.
- For non-blocking lint monitoring, run `npm -w metaflow run lint:monitor:summary` (or in `src/`: `npm run lint:monitor:summary`).
- Coverage: `npm -w @metaflow/engine run test:coverage` (95%+ stmts) and `npm -w @metaflow/cli run test:coverage` (92%+ stmts).
- Unit tests use `tmp_path` pattern (`os.tmpdir()` + `mkdtemp`) for isolation.
- Integration tests use `test-workspace/` fixture.

## Traceability

Full documentation pyramid:
- **SRS** → **SDD** → **TCS** → **FTD** → **FTR** (functional testing)
- **VSRS** → **VTC** → **VTP** → **VTR** (validation testing)

When adding features, update the relevant docs in `doc/`.

## Security

- Never commit `.env*` files or secrets.
- No private data in config fixtures.
