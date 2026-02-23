# Phase 1 - Unblock Integration Execution

## Objective

Eliminate or isolate the Extension Host update-lock so TP-A017 can run in a reproducible way.

## Inputs

- `src/src/test/runTest.ts`
- Existing RUN-003 and RUN-004 notes in `doc/ftr/FTR-metaflow-ext.md`
- Local host/process state and `.vscode-test` cache state

## Tasks

1. Define retry budget and deterministic run protocol.
2. Execute startup sanity matrix:
- clear `.vscode-test`
- ensure no stale VS Code host processes
- verify launch args used by integration runner
- run targeted integration entry command
3. Record each attempt with timestamp, command, and first-failure signature.
4. Classify outcome as `Unblocked` or `Persistent External Blocker`.

## Deliverables

- Attempt log added to working notes and summarized in `FTR` change log.
- Confirmed decision whether TP-A017 is runnable in current environment.

## Exit Criteria

1. At least one deterministic run starts Extension Host without update-lock.
2. If still blocked, blocker is declared external with reproducible signature and escalation path.
