# Phase 2 – Security and Supply Chain

## Objective

Introduce first-class security workflows and dependency risk controls comparable to production repositories.

## Deliverables

- CodeQL workflow for TypeScript/JavaScript scanning.
- Dependency review workflow on pull requests.
- Security triage guidance updates linked from `.github/SECURITY.md`.

## Tasks

- [x] Add CodeQL workflow:
   - [x] Trigger on `push` to `main`, `pull_request`, and scheduled scan.
   - [x] Scope languages to JavaScript/TypeScript.
   - [x] Tune build commands for workspace.
- [x] Add dependency-review workflow:
   - [x] Trigger on pull requests.
   - [x] Enforce fail/warn thresholds for high and critical advisories.
- [x] Security policy refinements:
   - [x] Extend `.github/SECURITY.md` with expected SLA targets (acknowledge/respond windows).
   - [x] Document vulnerability fix and disclosure flow.
- [x] Baseline triage process:
   - [x] Define how to suppress false positives with justification.
   - [x] Define ownership for recurring findings.

## Validation

- [ ] Run both workflows on a PR with dependency changes.
- [ ] Verify alerts appear in GitHub Security tab.
- [x] Confirm policy documentation is clear and actionable.

## Exit Criteria

- Security scanning is continuously active and visible.
- Dependency risk is evaluated before merge.
- Maintainers have documented triage procedures.

## Risks

- Initial CodeQL noise can overwhelm maintainers.
  - Mitigation: start with default queries, suppress only with documented rationale.
