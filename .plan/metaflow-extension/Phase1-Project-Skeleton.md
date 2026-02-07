# Phase 1 — Project Skeleton + Config Model

## Objectives

- Establish the VS Code extension scaffold with build/test/lint tooling.
- Implement the clean `ai-sync.json` config schema loader and diagnostics.
- Deliver unit tests for all config-related code.
- Update SDD and TCS with config design elements and test cases.

## Scope

**In scope**
- `package.json`, `tsconfig.json`, `.eslintrc.json`, `.vscodeignore`, `.vscode-test.mjs`
- `src/extension.ts` — minimal activation path (graceful degradation)
- `src/config/configLoader.ts` — JSON/JSONC config parser and validator
- `src/config/configPathUtils.ts` — config discovery and path resolution
- `src/config/configSchema.ts` — TypeScript interfaces for `ai-sync.json` (single or multiple metadata repositories)
- `src/diagnostics/configDiagnostics.ts` — VS Code diagnostic collection for config errors
- `src/views/outputChannel.ts` — structured output channel with log levels
- `src/views/statusBar.ts` — minimal status bar (loading/error/idle states)
- `src/test/unit/configLoader.test.ts` — config loader unit tests
- `src/test/unit/configPathUtils.test.ts` — path utilities unit tests
- `src/test/unit/configDiagnostics.test.ts` — diagnostics unit tests
- `test-workspace/` — minimal fixture with valid and invalid `ai-sync.json` files

**Out of scope**
- Overlay engine logic
- Materialization/provenance
- Full UI views (beyond minimal status bar)

## Tasks

### T1.1 — Extension Scaffold

1. Create `package.json` with MetaFlow command IDs (`metaflow.*`), activation events, and contribution points.
2. Create `tsconfig.json` with `strict: true`, target `ES2022`, module `commonjs`.
3. Create `.eslintrc.json` with TypeScript ESLint rules.
4. Create `.vscodeignore` excluding test and source files from VSIX.
5. Add compile/lint/test scripts matching Sync-AI-Metadata extension patterns.
6. Create `.vscode-test.mjs` separating unit and integration test configurations.

### T1.2 — Config Schema & Loader

1. Define TypeScript interfaces for `ai-sync.json` in `configSchema.ts`:
   - `metadataRepo` (single repo) and `metadataRepos` (multi-repo)
   - `layerSources` entries with `{ repoId, path }`
   - Shared path support for `localPath` (absolute or relative)
   - Validation rules: unique `metadataRepos` IDs; all `layerSources.repoId` must exist
2. Implement `configLoader.ts`:
   - Parse with `jsonc-parser` for fault-tolerant loading.
   - Validate required fields (`metadataRepo`, `layers`).
   - Return typed config or error.
3. Implement `configPathUtils.ts`:
   - Config discovery: `ai-sync.json` → `.ai/ai-sync.json` fallback.
   - Path resolution relative to workspace root.

### T1.3 — Config Diagnostics

1. Implement `configDiagnostics.ts` using `vscode.languages.createDiagnosticCollection`.
2. Report JSON parse errors with line/column positions.
3. Report schema violations (missing required fields, invalid types).

### T1.4 — Minimal Extension Activation

1. Implement `extension.ts` with:
   - Output channel creation.
   - Status bar initialization.
   - Config discovery and loading.
   - Graceful degradation when config is missing.
   - Placeholder command registrations for `metaflow.initConfig`, `metaflow.openConfig`.

### T1.5 — Test Fixture Workspace

1. Create `test-workspace/ai-sync.json` — valid minimal config.
2. Create `test-workspace/.ai/ai-sync.json` — fallback config.
3. Create `test-workspace/invalid-config/ai-sync.json` — intentionally malformed.
4. Create mock metadata directory with empty layer folders.

### T1.6 — Unit Tests

1. Config loader tests:
   - Valid config parsing.
   - Missing required fields.
   - JSONC comments and trailing commas.
   - Empty / null / malformed input.
2. Config path utils tests:
   - Primary path discovery.
   - Fallback path discovery.
   - No config found.
3. Config diagnostics tests:
   - Parse error diagnostics.
   - Schema violation diagnostics.

### T1.7 — Update Traceability Docs

1. Add DES-* entries to SDD for config loader, path utils, diagnostics.
2. Add TC-* entries to TCS for config test cases.
3. Map TC-* to REQ-* in traceability matrix.

## Deliverables

- Compilable VS Code extension skeleton with `npm run compile`, `npm run lint`, `npm test`
- Config loader and diagnostics with passing unit tests
- Test fixture workspace
- Updated SDD and TCS

## Exit Criteria

- `npm run compile` passes with zero errors.
- `npm run lint` passes (or lint issues are non-blocking per linting policy).
- Config loader unit tests pass.
- Config diagnostics unit tests pass.
- SDD contains DES-* entries for all Phase 1 components.
- TCS contains TC-* entries for all Phase 1 test cases.

