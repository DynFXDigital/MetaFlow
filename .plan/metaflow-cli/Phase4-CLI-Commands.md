# Phase 4 – Integration Tests + Polish

**Status:** Complete

## Objective

Add end-to-end integration tests that exercise the full CLI workflow, polish help text and error handling, and ensure the complete system (engine + CLI + extension) works together.

## Tasks

### Integration Tests

- [x] Full lifecycle test: `init → apply → status → modify → promote → clean`
  - Create temp workspace + metadata repo
  - Run each command in sequence
  - Assert file system state at each step
- [x] Multi-artifact test: apply with skills, agents, instructions, prompts
- [x] Profile switch test: `profile set` → `apply` → verify different output sets
- [x] Idempotency test: `apply` twice → identical results
- [x] Drift protection test: modify managed file → `apply` skips → `promote` detects
- [x] Error handling tests: missing config, invalid JSON, missing repo, bad profile name

### CLI Polish

- [x] Consistent `--help` text across all commands
- [x] `--version` flag
- [x] `--json` output option for machine-readable results (status, preview)
- [x] Exit codes: 0=success, 1=error, 2=drift detected
- [ ] Colorized output for terminal (deferred to Phase 5)

### Cross-Package Validation

- [x] Verify engine unit tests still pass: `npm -w metaflow run test:unit` (111 passing)
- [x] Verify extension integration tests still pass: `npm -w metaflow test` (21 passing)
- [x] Verify CLI tests pass: `npm -w @metaflow/cli test` (27 passing)
- [x] Run all from root: `npm test` (138 passing)

### Documentation

- [x] CLI README with usage examples
- [x] Updated repo AGENTS.md with CLI build/test commands
- [x] Root package.json with combined test scripts

## Deliverables

- Complete integration test suite covering full workflow.
- Polished CLI with help text, exit codes, and error handling.
- All tests passing across all three packages.
- Updated documentation.

## Reference

- [Editing and Promotion Workflow](../../doc/concept/ai_metadata_overlay_sync_system_reference_architecture.md#editing-and-promotion-workflow)
