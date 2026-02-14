# Phase 3 – Release Governance

## Objective

Make extension release behavior deterministic, gated, and auditable from commit to marketplace publication.

## Deliverables

- Hardened `.github/workflows/release.yml` with explicit preconditions.
- Standardized tag strategy and pre-release semantics.
- Release notes/changelog automation decision and implementation.

## Tasks

- [x] Release gating:
   - [x] Ensure publish is only allowed from tags or approved manual refs.
   - [x] Require successful CI status before publish.
   - [x] Prevent duplicate concurrent publishes for the same version.
- [x] Versioning policy:
   - [x] Define version/tag mapping (`vX.Y.Z`, optional prerelease suffix rules).
   - [x] Define rollback/hotfix procedure.
- [x] Release notes automation:
   - [x] Choose between Release Please and Release Drafter.
   - [x] Configure labels/categories for changelog quality.
- [x] Publish safety:
   - [x] Add `--skip-duplicate` behavior where applicable.
   - [x] Validate secret availability and fail clearly with actionable messages.
- [x] Artifact retention and provenance:
   - [x] Retain VSIX artifacts for reproducibility window.
   - [x] Ensure GitHub release always attaches exact published VSIX.

## Validation

- [ ] Dry-run release from a non-production ref.
- [ ] Real tag rehearsal in test cycle.
- [ ] Confirm generated notes are accurate and useful.

## Exit Criteria

- Releases are blocked when CI fails or prerequisites are missing.
- Release artifact, tag, and notes are aligned and reproducible.
- Maintainers can execute releases with a repeatable checklist.

## Risks

- Manual dispatch may bypass expected guardrails.
  - Mitigation: enforce explicit checks in workflow logic, not operator memory.
