# Phase 2 - Authoritative Evidence Closure

## Objective

Convert TP-A017 from `Skip` to authoritative evidence-backed outcome in `FTR`.

## Inputs

- `doc/tcs/TCS-metaflow-ext.md` (`TC-0331` to `TC-0334`)
- `doc/ftd/FTD-metaflow-ext.md` (`TP-A017`)
- Integration test sources under `src/src/test/integration/`

## Tasks

1. Run targeted TP-A017 test scope first.
2. If targeted scope passes, run broader integration confirmation scope as needed.
3. Capture evidence strings and command references for each `TC-*` row.
4. Update `FTR` results table and summary metrics.
5. If blocked after Phase 1 retry budget, execute fallback closure path:
- log blocker issue reference
- document temporary mitigation and manual verification boundary
- keep readiness conditional until blocker is resolved

## Deliverables

- Updated `doc/ftr/FTR-metaflow-ext.md` rows for TP-A017.
- Updated run section including environment details and evidence links.

## Exit Criteria

1. TP-A017 row no longer `Skip` without explicit approved exception.
2. Evidence for each covered `TC-*` is durable and reproducible.
