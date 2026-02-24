# Phase 4 - Code-Path Remediation

## Objective

Remediate implementation risks in extension command paths while preserving functional behavior.

## Tasks

- [x] Inventory sync filesystem calls in `src/src/commands/commandHandlers.ts` and related helpers.
- [x] Migrate command-path sync operations to async (`vscode.workspace.fs` or `fs/promises`) with proper error surfacing.
- [x] Add/upgrade unit tests for command behavior affected by async migration.
- [x] Validate config-write semantics for JSONC files:
  - [x] Preserve comments/format where required using JSONC edit APIs.
  - [x] Document and test expected behavior for normalization edge cases.
- [ ] Strengthen integration tests where no-throw oracles are currently too weak.
- [ ] If proposed API warning is confirmed, refactor menu contributions for stable compatibility.

## Deliverables

1. Code updates in extension command paths and persistence utilities.
2. New/updated tests demonstrating behavior and failure-mode coverage.
3. Disposition record for proposed API finding (fixed or rejected with evidence).

## Completion Criteria

- No blocking sync I/O remains in user-triggered command hot paths without explicit exception rationale.
- Config persistence behavior is deterministic and covered by tests.
