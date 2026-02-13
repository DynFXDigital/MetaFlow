# Phase 2 – Extension Rewire

**Status:** Complete

## Objective

Rewire the VS Code extension (`src/`) to import from `@metaflow/engine` instead of its local `./engine/` and `./config/` directories. After this phase the extension behavior is identical but the engine code lives in a shared package.

## Tasks

- [ ] Update `src/package.json`:
  - Add `"@metaflow/engine": "workspace:*"` to `dependencies`
  - Remove engine/config source files from `src/src/engine/` and `src/src/config/`
- [ ] Update all import paths in the extension:
  - `src/src/commands/` — change `from '../engine/...'` → `from '@metaflow/engine'`
  - `src/src/views/` — same import rewire
  - `src/src/diagnostics/` — same import rewire
  - `src/src/extension.ts` — same import rewire
- [ ] Update `src/tsconfig.json`:
  - Add path mapping or project reference to `packages/engine`
  - Ensure `tsc` resolves `@metaflow/engine` correctly
- [ ] Verify extension compiles:
  - `cd src && npm run compile` succeeds
- [ ] Verify extension tests pass:
  - All 21 integration tests pass (Extension Host)
  - No behavioral changes
- [ ] Update `.vscodeignore`:
  - Ensure `@metaflow/engine` built output is included in VSIX (or bundled)
  - Test: `npm run package` produces working VSIX
- [ ] Verify VSIX still works:
  - Install VSIX in VS Code → extension activates, commands work

## Deliverables

- Extension compiles and all tests pass using `@metaflow/engine` imports.
- No engine/config source files remain in `src/src/engine/` or `src/src/config/`.
- VSIX packages correctly with the engine included.
- Zero behavioral changes from user perspective.

## Reference

- Existing imports: `src/src/commands/*.ts`, `src/src/views/*.ts`, `src/src/extension.ts`
- Engine barrel: `packages/engine/src/index.ts`
