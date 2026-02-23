# Phase 1: Authoritative Coverage Definition

## Objective

Establish complete and unambiguous authoritative definitions for functional testability and procedures before implementation work begins.

## Tasks

1. Audit current high-risk gaps and map them to `REQ-*`.
2. Add/adjust `TC-*` entries in `doc/tcs/TCS-metaflow-ext.md` for uncovered high-risk behaviors.
3. Add/adjust `TP-*` procedures in `doc/ftd/FTD-metaflow-ext.md` for all changed/new `TC-*` rows.
4. Verify `TC -> REQ` and `TP -> TC` mappings are complete for affected areas.

## Exit Criteria

1. All targeted gaps have explicit `TC-*` representation.
2. All targeted `TC-*` rows have at least one executable `TP-*`.
3. No Phase 1 gap remains only in planning docs.

## Candidate Gap Targets

- Command output contracts (`status`, `promote`) with strict assertions.
- Watcher-triggered config refresh behavior.
- Progress notifications for `apply` and `clean`.
- Settings injection matrix edge cases (skills/agents/hooks and hooks disabled mode).
- Safety requirements (`REQ-0601`, `REQ-0602`, `REQ-0603`) represented as explicit `TC-*` rows.
