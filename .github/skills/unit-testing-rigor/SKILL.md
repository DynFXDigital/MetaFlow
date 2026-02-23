---
name: unit-testing-rigor
description: Use this skill when designing, implementing, or reviewing unit tests that must be thorough, data-aware, failure-mode-driven, and resilient enough for industrial or safety-critical quality expectations.
---

# Unit Testing Rigor

## Purpose

This skill drives unit tests beyond line coverage by requiring behavior completeness, data coverage, and failure-mode reproduction.

Unit tests are treated as:
- First defense against defect escape.
- First artifact to reproduce failures found in functional, validation, or exploratory testing.

## Core Rules

1. Coverage is evidence, not the objective.
2. Test the unit contract completely: valid behavior, boundaries, invalid inputs, and error handling.
3. Cover data partitions explicitly, not just code paths.
4. Add regression tests for every discovered failure mode before fixing implementation.
5. Keep tests deterministic, isolated, and fast.

## Required Test Design Dimensions

For each unit under test, design tests across all dimensions below.

1. Behavioral coverage:
- Nominal flows.
- Alternate flows.
- Error and exception paths.
- Side effects and state transitions.

2. Structural coverage:
- Statement and branch coverage.
- Decision combinations for critical condition logic.
- Justify any uncovered branches.

3. Data coverage:
- Equivalence classes (valid and invalid).
- Boundary values (min, max, empty, one, many, overflow-like, malformed).
- Representative domain values and risky real-world values.

4. Interaction coverage:
- Dependency success/failure behavior.
- Retries/timeouts/cancellation where applicable.
- Idempotency and reentrancy where applicable.

5. Regression coverage:
- Reproduction test for each known defect.
- Assertion that the prior failure no longer occurs.

## Workflow

1. Define the unit contract.
2. Build a test matrix (behavior x data partitions x error modes).
3. Implement tests for all high-risk matrix cells first.
4. Run targeted unit tests.
5. Run coverage and inspect weak spots.
6. Add missing tests for meaningful risk, not cosmetic percentage gain.
7. Record remaining gaps and rationale.

## Quality Bar for Tests

1. Assertions check outcomes, side effects, and invariants.
2. Tests avoid hidden coupling and shared mutable state.
3. No flaky timing dependencies.
4. Mocks/fakes validate contracts, not implementation trivia.
5. Test names describe intent and failure mode.

## Failure Mode Reproduction Rule

When a defect is discovered outside unit testing:

1. Add a focused failing unit test that reproduces it.
2. Confirm failure before code fix.
3. Fix implementation.
4. Confirm pass and keep the test permanently as regression protection.

## Output Expectations for Agent Work

When using this skill, produce:

1. Coverage gap summary (behavioral + structural).
2. Data partition and boundary matrix.
3. Implemented test cases with rationale for risk addressed.
4. Any residual risks and why they remain.
