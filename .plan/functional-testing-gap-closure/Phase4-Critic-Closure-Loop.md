# Phase 4 - Critic Closure Loop

## Objective

Drive the plan to closure using iterative critic feedback until no unresolved in-scope critical/major issues remain for automated release gating.

## Scope

In scope:
- Remaining high-risk FTP backlog items (`GAP-004`, `GAP-005`, `GAP-007`).
- Readiness/governance wording consistency across FTP/FTR.

Tracked as accepted non-blocking residual risk for this gate cycle:
- Activation weak-oracle hardening branch (`GAP-009`).

Out of scope:
- Full manual validation automation unless explicitly approved as a separate validation-track initiative.

## Work Items

- [x] Disposition activation-suite weak-oracle hardening branch as accepted non-blocking risk (`GAP-009`) in FTP/FTR.
- [x] Close or formally risk-accept `GAP-004` (progress notification contracts) with evidence.
- [x] Close or formally risk-accept `GAP-005` (settings injection matrix completeness) with evidence.
- [x] Close or formally risk-accept `GAP-007` (cross-repo precedence integration scenario) with evidence.
- [x] Align FTP/FTR readiness language so there is no contradictory interpretation of readiness boundaries.
- [x] Execute `npm run gate:quick`, `npm run gate:integration`, and `npm run gate:full` after each material closure tranche.
- [x] Run Critic review after each tranche and publish finding disposition table.

## Acceptance Criteria

1. Latest Critic review reports no unresolved in-scope `C1` or `C2` findings.
2. Any unresolved in-scope `C3` finding is explicitly dispositioned (`fixed`, `accepted-risk`, or `rejected`) with evidence.
3. Automated gates pass with recorded run evidence.
4. FTP/FTR readiness statements are consistent and auditable.

## Evidence to Capture

- Critic report files under `.ai/temp/critiques/`.
- Gate run outputs (`gate:quick`, `gate:integration`, `gate:full`).
- Updated references in `doc/ftd/FTP-metaflow-ext-functional-gap-closure.md` and `doc/ftr/FTR-metaflow-ext.md`.
