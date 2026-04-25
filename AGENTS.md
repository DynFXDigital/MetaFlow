# MetaFlow Public Repository

## Scope

These instructions apply inside the public MetaFlow product repository. The private superproject owns internal SDLC, planning, traceability, and process material; do not move those artifacts into this repository unless explicitly asked to publish them.

## Architecture

- `packages/engine/src/` is the pure TypeScript overlay engine. It must not import `vscode`.
- `packages/cli/src/` is the CLI wrapper around the engine.
- `src/src/` is the VS Code extension layer that owns commands, views, diagnostics, settings writes, and webviews.
- `src/assets/metaflow-ai-metadata/` contains bundled starter metadata shipped with the extension.

## Commands

- From this repository root:
  - `npm run build`
  - `npm test`
  - `npm run gate:quick`
  - `npm run gate:integration`
- From `src/`:
  - `npm run compile`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run gate:quick`

From the private superproject root, the fast extension unit-test command is `npm -C public/metaflow/src run test:unit`.

## Working Rules

- Default application-value work to the `develop` branch.
- Do not push, merge, rewrite `main`, create tags, publish releases, or change branch protection unless the user explicitly asks for release or `main` operations.
- Keep engine changes deterministic and covered by engine or extension unit tests as appropriate.
- Preserve existing GitHub Copilot behavior when adding Codex or other agent metadata support.
- Keep public docs user-facing. Internal SDLC chain documents belong in the private parent repository.
