---
description: "Unit testing rules for behavior completeness, data coverage, and failure-mode-driven regression protection."
applyTo: "**/*.test.ts,**/*.test.js,**/*.spec.ts,**/*.spec.js,src/src/test/unit/**/*.ts,packages/**/test/**/*.ts"
---

# Unit Testing Policy

Unit tests must provide strong defect containment and early failure detection.

## Objectives

- Treat unit tests as the first defense against defect escape.
- Reproduce defects in unit tests first when issues are discovered in higher test levels.
- Validate behavior correctness, not just implementation traversal.

## Required Coverage Dimensions

1. Behavioral coverage:
- Normal paths.
- Edge paths.
- Error paths.
- State transition and side-effect paths.

2. Structural coverage:
- Statement and branch coverage analysis is required.
- Coverage reports are used to find weak spots, not to justify shallow tests.
- Any intentionally uncovered logic must be documented in test comments or review notes.

3. Data coverage:
- Use equivalence partitions for valid and invalid inputs.
- Include boundary-value tests for numeric, collection, and string/path inputs.
- Include malformed and adversarial data where relevant.

## Test Case Design Rules

- Every public unit contract must have tests for success and failure behavior.
- Assertions must verify outputs, side effects, and invariant preservation.
- Dependencies must be controlled (fake/mock/stub) so tests are deterministic and repeatable.
- Avoid flaky timing and external-environment coupling.
- Test names must communicate behavior and failure mode intent.

## Defect Reproduction Rule

When a defect is found during functional, validation, or exploratory testing:

1. Add a focused failing unit test that reproduces the issue.
2. Confirm the test fails pre-fix.
3. Implement the fix.
4. Confirm the unit test passes and keep it as a permanent regression test.

## Execution Rule

- Run the smallest relevant unit test set after changes.
- Use coverage analysis to identify meaningful gaps.
- Add tests for uncovered risk, not only to increase percentages.
