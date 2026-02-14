# Phase 4 – Operations and Maintenance

## Objective

Improve long-term maintainability by reducing update noise, clarifying ownership, and codifying support/triage operations.

## Deliverables

- Enhanced `.github/dependabot.yml` with grouping, labels, and cadence controls.
- Maintainer operations docs (`SUPPORT.md` or equivalent guidance in `CONTRIBUTING`).
- Optional triage automations (stale/lock policies) based on issue volume.

## Tasks

- [x] Dependabot policy refinement:
   - [x] Group updates by ecosystem area (engine, cli, extension, actions).
   - [x] Add labels and optional assignees/reviewers.
   - [x] Tune open PR limits by risk profile.
- [x] Support channel clarity:
   - [x] Add explicit support routing and expected response model.
   - [x] Distinguish bug reports, feature requests, and usage questions.
- [x] Maintainer runbook:
   - [x] Add cadence for dependency triage and release readiness checks.
   - [x] Add emergency patch procedure summary.
- [x] Optional hygiene automation:
   - [x] Evaluate stale/lock workflows only if issue backlog volume justifies it.

## Validation

- [ ] Observe one full Dependabot cycle for PR quality and volume.
- [ ] Confirm new contributor/support routing reduces issue misclassification.

## Exit Criteria

- Dependency update flow is predictable and manageable.
- Contributor support paths are explicit and discoverable.
- Maintainers have a documented operational routine.

## Risks

- Over-automation can hide important update context.
  - Mitigation: group conservatively; keep critical updates visible.
