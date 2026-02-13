# Phase 1 – Engine Extraction

**Status:** Complete

## Objective

Extract the existing pure TypeScript engine (`src/src/engine/` + `src/src/config/`) into a standalone `packages/engine/` package. Set up the monorepo structure (npm workspaces or TypeScript project references) so both the VS Code extension and future CLI can import `@metaflow/engine`.

## Tasks

- [ ] Create `packages/engine/` package structure:
  - `packages/engine/package.json` (name: `@metaflow/engine`, no `vscode` dependency)
  - `packages/engine/tsconfig.json` (strict, ES2022, commonjs output)
  - `packages/engine/src/config/` — move `configSchema.ts`, `configLoader.ts`, `configPathUtils.ts`, `index.ts`
  - `packages/engine/src/engine/` — move all 12 engine modules + `index.ts`
  - `packages/engine/src/index.ts` — barrel re-export of config + engine
- [ ] Set up monorepo workspace:
  - Root `package.json` with `workspaces: ["packages/*", "src"]` (or npm/pnpm workspace config)
  - Ensure `npm install` / `pnpm install` links workspace packages
- [ ] Move unit tests:
  - `packages/engine/src/test/unit/` — move or copy existing config + engine unit tests
  - Ensure tests run standalone: `cd packages/engine && npm test`
  - All 111 existing unit tests must pass unmodified (or with import path changes only)
- [ ] Validate no `vscode` imports:
  - Add a lint rule or CI check: `grep -r "from 'vscode'" packages/engine/src/` must return empty
- [ ] Set up build:
  - `packages/engine/scripts`: compile, test, lint
  - Output to `packages/engine/out/`

## Deliverables

- `packages/engine/` compiles independently and passes all unit tests.
- `@metaflow/engine` exports the full config + engine API.
- No `vscode` imports in the package (enforced).
- Monorepo workspace links packages correctly.

## Reference

- Current engine source: `src/src/engine/` (12 modules, 0 vscode imports)
- Current config source: `src/src/config/` (4 modules, 0 vscode imports)
- Existing unit tests: `src/src/test/unit/` (111 tests)
