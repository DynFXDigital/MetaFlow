# Phase 2 - Bundled Metadata Baseline

## Objective

Implement extension-packaged baseline metadata that can be enabled by setting and composed deterministically with existing MetaFlow layer sources.

## Deliverables

1. Bundled metadata asset package under extension source.
2. Managed workspace realization flow for bundled assets.
3. Refresh/apply integration that includes bundled source at lowest precedence.
4. Commands or init flow enhancements for baseline enable/disable and repair.

## Implementation Tasks

- [x] Add extension asset manifest and bundled metadata directory structure.
- [x] Implement workspace-managed realization path (create/update/cleanup logic).
- [x] Inject bundled source into overlay resolution when enabled.
- [x] Add migration-safe initialization behavior for new vs existing workspaces.
- [x] Add diagnostics/status visibility for bundled source version and health.
- [x] Ensure `clean` and `refresh` semantics remain deterministic.

## Testing and Validation

- [x] Unit tests for bundled source path resolution and managed-file behavior.
- [x] Unit tests for precedence: bundled < repo source < higher-priority layers.
- [x] Integration tests for setting transitions (`off` -> `baseline-plus-local` -> `baseline-only`).
- [x] Integration tests for initialization flows and non-destructive upgrades.

## Exit Criteria

1. Bundled baseline can be enabled/disabled without manual file operations.
2. Effective file precedence remains deterministic and visible in views/status output.
3. Existing repositories without bundled mode remain behaviorally unchanged by default.
4. No regressions in injection/materialization pathways.

## Risks and Mitigations

- Risk: path portability and permission issues on remote/readonly environments.
- Mitigation: centralize file-system abstraction and add guarded fallbacks with clear warnings.

- Risk: stale bundled assets after extension updates.
- Mitigation: versioned managed directory and explicit refresh/update policy.
