# Phase 3: Testing & Documentation

## Goals

Comprehensive integration testing of the full discovery workflow and traceability updates across all MetaFlow documentation artifacts.

## Tasks

### 1. Full Workflow Integration Tests

**File:** `src/src/test/integration/discovery-workflow.test.ts` (new file)

Test cases (IT-DISC-01 through IT-DISC-05):

- **IT-DISC-01**: End-to-end discovery with `autoApply: true`
  - Setup: Multi-repo config, `discover.enabled: true`, `autoApply: true`
  - Action: Add new layer directory with artifacts to source repo
  - Trigger: Config file touch (to trigger watcher)
  - Assert: New layer appears in Layers view, files materialized, managed state updated

- **IT-DISC-02**: Discovery with exclude patterns
  - Setup: Config with `discover.exclude: ["**/deprecated/**", "*/archive/*"]`
  - Action: Add layer in excluded path + layer in allowed path
  - Assert: Only non-excluded layer discovered and resolved

- **IT-DISC-03**: Explicit layerSources override discovered duplicates
  - Setup: Explicit `layerSources` entry for `company/core`, discovery also finds `company/core`
  - Assert: Single layer entry (explicit), no duplicates in resolved layers

- **IT-DISC-04**: Discovery respects repo `enabled: false`
  - Setup: Multi-repo config with one repo `enabled: false, discover.enabled: true`
  - Assert: Disabled repo not scanned, no layers from that repo

- **IT-DISC-05**: Discovery handles missing/invalid repo paths gracefully
  - Setup: Config with `discover.enabled: true`, invalid `localPath`
  - Assert: Error logged to output channel, extension remains functional, other repos still resolve

**Coverage target:** Integration tests cover all critical user journeys.

### 2. Unit Test Expansion

**File:** `packages/engine/test/discovery.test.ts`

Add edge case tests:

- **DISC-09**: Discovery with deeply nested artifact directories (3+ levels)
- **DISC-10**: Discovery with symlinked directories (verify no infinite loops)
- **DISC-11**: Discovery performance with 1000+ directories (should complete <2s)
- **DISC-12**: Discovery with mixed artifact types in same layer

### 3. Documentation Updates

#### 3.1 SRS (Software Requirements Specification)

**File:** `doc/srs/SRS-metaflow-ext.md`

Add requirements:

- **REQ-DISC-01**: Extension SHALL support runtime layer discovery per repository
- **REQ-DISC-02**: Discovery SHALL find directories containing known artifact types
- **REQ-DISC-03**: Discovery SHALL merge discovered layers with explicit config
- **REQ-DISC-04**: Explicit `layerSources` SHALL take precedence over discovered layers
- **REQ-DISC-05**: Discovery SHALL respect `discover.exclude` glob patterns
- **REQ-DISC-06**: Manual repository rescan SHALL be available via Config tree view UI

#### 3.2 SDD (Software Design Document)

**File:** `doc/sdd/SDD-metaflow-ext.md`

Add design sections:

- **Section: Layer Discovery**
  - Subsection: Discovery Algorithm
  - Subsection: Merge Strategy (explicit vs discovered)
  - Subsection: Performance Considerations
  - Code references: `overlayEngine.ts::discoverLayersInRepo()`, `overlayEngine.ts::resolveMultiRepoLayers()`

- **Section: Config Tree View Commands**
  - Subsection: Rescan Repository Command
  - Code references: `commandHandlers.ts::metaflow.rescanRepository`, `configTreeView.ts::RepoSourceItem`

#### 3.3 TCS (Test Case Specification)

**File:** `doc/tcs/TCS-metaflow-ext.md`

Add test cases mapping to requirements:

- **TC-DISC-01** → REQ-DISC-01: Verify basic discovery functionality
- **TC-DISC-02** → REQ-DISC-02: Verify artifact type detection
- **TC-DISC-03** → REQ-DISC-03: Verify merge behavior
- **TC-DISC-04** → REQ-DISC-04: Verify precedence rules
- **TC-DISC-05** → REQ-DISC-05: Verify exclude patterns
- **TC-DISC-06** → REQ-DISC-06: Verify manual rescan UI

#### 3.4 FTD (Functional Test Design)

**File:** `doc/ftd/FTD-metaflow-ext.md`

Add test procedures:

- **TP-DISC-01**: Layer Discovery with AutoApply
  - Setup steps, execution, expected results
  - Maps to TC-DISC-01
  
- **TP-DISC-02**: Manual Repository Rescan
  - Setup steps, UI interaction, expected results
  - Maps to TC-DISC-06

#### 3.5 FTR (Functional Test Report)

**File:** `doc/ftr/FTR-metaflow-ext.md`

Add test execution records:

- Execution date for each TP-DISC-* procedure
- Pass/fail status
- Evidence (screenshots, logs)
- Defects found and resolved

#### 3.6 Validation Checklist

**File:** `doc/validation/ftd/MANUAL-VALIDATION-CHECKLIST-metaflow-ext.md`

Add manual validation items:

- [ ] Discovery: Add new layer directory to source repo, verify automatic detection
- [ ] Discovery: Add layer in excluded path, verify it's ignored
- [ ] UI: Click refresh icon on repo row, verify rescan occurs
- [ ] UI: Verify new layers appear in Layers tree view
- [ ] AutoApply: Verify discovered layers applied when `autoApply: true`
- [ ] Config: Verify explicit entries override discovered duplicates

### 4. User-Facing Documentation

**File:** `README.md` (root)

Add section under "Features":

```markdown
### Automatic Layer Discovery

MetaFlow can automatically detect new metadata layers in your source repositories:

- Enable per-repository: `"discover": { "enabled": true }` in repo config
- Excludes patterns supported: `"discover": { "exclude": ["**/archive/**"] }`
- Works with AutoApply: New layers automatically applied when `autoApply: true`
- Manual rescan: Click refresh icon on repository in Config view

Explicit `layerSources` entries always take precedence over discovered layers.
```

**File:** `doc/concept/metaflow_reference_architecture.md`

Add subsection under "Layer Resolution":

```markdown
#### Layer Discovery

For metadata repositories that frequently evolve (adding/removing layer directories), 
MetaFlow supports runtime layer discovery. When enabled via `discover.enabled: true`, 
the engine scans the repository for directories containing known artifact types and 
merges them with explicit `layerSources` configuration. Discovery respects exclude 
patterns and defers to explicit entries for ordering precedence.
```

## Acceptance Criteria

- [ ] All IT-DISC-* integration tests pass
- [ ] All DISC-* unit tests pass with 95%+ coverage
- [ ] SRS, SDD, TCS, FTD, FTR updated with traceability
- [ ] Manual validation checklist items completed
- [ ] User-facing documentation includes discovery feature
- [ ] README.md updated with discovery usage examples
- [ ] Full test suite (unit + integration) passes clean: `npm test` in root and `src/`

## Dependencies

- Phase 1 and Phase 2 completion
- Access to test fixtures and workspace setup utilities
- Traceability tooling (custom scripts or manual updates)

## Estimated Effort

3-4 days (comprehensive testing + documentation updates + traceability)

## Verification

Run full validation pass:

```powershell
# Engine tests
npm -w @metaflow/engine test

# CLI tests
npm -w @metaflow/cli test

# Extension unit + integration
cd src
npm run test:unit
npm test

# Full workspace
cd ..
npm test
```

All tests should pass with no regressions. Manual validation checklist completed and signed off.
