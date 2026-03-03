# Phase 2: Hygiene and Build Baseline

## Goal

Demonstrate and document a clean-clone quality baseline while triaging dependency/security hygiene findings.

## Scope

- Dependency installation/build/test baseline.
- Vulnerability triage and decision recording.
- Secrets/internal dependency sanity checks.

## Work Items

- [x] Execute and record baseline commands:
  - `npm ci`
  - `npm run build`
  - `npm run test:unit`
- [x] Run `npm audit` and classify findings by severity, exploitability, and ownership.
- [x] Create remediation list with target versions or accepted-risk justifications.
- [x] Confirm no secrets/internal endpoints in tracked files (regex + manual review).
- [x] Document whether `.env.example` is required; if not, explicitly state "no runtime env vars required".

## Acceptance Criteria

- Baseline commands pass on a clean clone and are reflected in docs.
- Dependency advisories have explicit disposition (`fix now`, `track`, or `accepted risk`).
- Security hygiene statement exists in docs/contributing guidance.

## Evidence

- Command output snippets in PR validation section.
- Audit triage table attached to PR or added to maintainer docs.

## Risks

- Transitive vulnerabilities may not have immediate upgrades.
- Fixes for advisories can induce regressions without targeted retesting.
