# MetaFlow Copilot Instructions

## Testing Workflow (Required)

- Always run the smallest relevant test set after making code changes.
- Prefer targeted tests first; run the full suite when changes are broad or riskier.
- If tests cannot be run, state the reason and the exact command to run later.
- Use test results as the primary feedback loop before finalizing changes.

## Dependency And Release Hardening (Required)

- Use `npm ci` for clean validation, packaging, and release verification; do not switch to `npm install` unless the task intentionally updates dependencies and reviews the resulting lockfile diff.
- Do not use bare latest-tag package execution in release-significant flows; prefer tools already pinned in the workspace lockfile.
- When dependencies change, review manifest and lockfile diffs for new packages, new lifecycle scripts, and suspicious transitive additions before treating the update as safe.
- Before release or VSIX publish, verify the packaged artifact came from the reviewed lockfile state and that the dependency delta is intentional.
- If an install, test, or package step shows unexpected install-time execution or outbound network behavior, stop and treat the environment as potentially compromised.

## Commands

- Run tests: `npm run test:unit`
