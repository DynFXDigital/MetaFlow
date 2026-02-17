# Phase 2 — TypeScript Overlay Engine

## Objectives

- Implement the deterministic overlay engine in pure TypeScript (no `vscode` imports).
- Cover layer resolution, include/exclude filtering, profile activation, and artifact classification.
- Deliver comprehensive unit tests for all engine logic.
- Update SDD and TCS with engine design elements and test cases.

## Scope

**In scope**
- `src/engine/types.ts` — config model interfaces, `OverlayResult`, `EffectiveFile`, `ArtifactClassification`
- `src/engine/overlayEngine.ts` — layer resolution with deterministic precedence
- `src/engine/filterEngine.ts` — include/exclude glob pattern evaluation
- `src/engine/profileEngine.ts` — profile enable/disable pattern application
- `src/engine/classifier.ts` — classify artifacts as settings vs materialized
- `src/engine/globMatcher.ts` — glob matching utility (using minimatch or custom)
- `src/test/unit/overlayEngine.test.ts`
- `src/test/unit/filterEngine.test.ts`
- `src/test/unit/profileEngine.test.ts`
- `src/test/unit/classifier.test.ts`
- `src/test/unit/globMatcher.test.ts`

**Out of scope**
- Materialization and managed state (Phase 3)
- Extension UI integration (Phase 4)

## Design Principles

- **Pure functions** — engine functions accept input data and return output data; no side effects.
- **No VS Code dependency** — engine modules do not import `vscode`, enabling fast unit tests.
- **Determinism** — layer resolution order is strictly defined by the `layers` array; no heuristics.

## Tasks

### T2.1 — Define TypeScript Interfaces

1. `OverlayConfig` — mirrors `.metaflow.json` schema.
2. `LayerContent` — represents files within a resolved layer.
3. `EffectiveFile` — a file after overlay resolution with source-layer info.
4. `ArtifactClassification` — `settings | materialized` with reasoning.
5. `OverlayResult` — the complete resolution result (effective files + classification + metadata).

### T2.2 — Implement Layer Resolution

1. Read layer directories in order from `layers` array (single repo) or `layerSources` (multi-repo).
2. Resolve `repoId` to a configured metadata repository root.
3. **Global precedence rule:** `layerSources` order is authoritative across all repos.
4. Apply later-wins precedence for files with the same relative path.
5. Track which layer contributed each effective file (including repoId).

### T2.3 — Implement Filter Engine

1. Evaluate `include` glob patterns against candidate files.
2. Evaluate `exclude` glob patterns; explicit exclude wins.
3. Return filtered file list.

### T2.4 — Implement Profile Engine

1. Apply active profile's `enable` patterns.
2. Apply active profile's `disable` patterns; disable wins on conflict.
3. No profile or empty profile = all files enabled.

### T2.5 — Implement Classifier

1. Default rules per updated Copilot capabilities:
   - `instructions/**` → settings
   - `prompts/**` → settings
   - `skills/**` → settings (Insiders) or materialized when configured
   - `agents/**` → settings (Insiders) or materialized when configured
   - `hooks/**` → settings (path to hook files)
2. Support override via `injection` config field.

### T2.6 — Unit Tests

1. **Layer resolution tests:**
   - Single layer with all files.
   - Multiple layers with no conflicts.
   - Multiple layers with conflicts (later-wins).
   - Empty layers.
   - Layer with nested directory structure.
2. **Filter engine tests:**
   - Include-only patterns.
   - Exclude-only patterns.
   - Combined include + exclude.
   - Wildcard patterns.
   - Empty filter config.
3. **Profile engine tests:**
   - Baseline profile (enable all).
   - Selective disable.
   - Selective enable.
   - No active profile.
   - Profile with conflicting enable/disable.
4. **Classifier tests:**
   - Standard classification per artifact type.
   - Injection config override.
   - Unknown file types.
5. **Glob matcher tests:**
   - Exact match.
   - Wildcard patterns.
   - Double-star recursive patterns.
   - Negation.

### T2.7 — Update Traceability Docs

1. Add DES-* entries to SDD for overlay engine, filter engine, profile engine, classifier.
2. Add TC-* entries to TCS for each test category.
3. Update traceability matrix.

## Deliverables

- Overlay engine producing `OverlayResult` with classified effective files
- Comprehensive unit tests covering edge cases
- Updated SDD and TCS

## Exit Criteria

- All engine unit tests pass.
- Engine produces deterministic outputs for fixed inputs (verified by tests).
- ≥80% line coverage for `src/engine/**`.
- SDD has DES-* for all engine components.
- TCS has TC-* for all engine test cases.

