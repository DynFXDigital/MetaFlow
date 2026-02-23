---
mode: 'agent'
description: 'Design and implement rigorous unit tests using behavior, data, and failure-mode coverage.'
---

# Unit Testing Rigor

Design and implement high-rigor unit tests for `${input:target:Target module, class, or function}`.

## Context

- Risk level: `${input:risk:Risk level (normal, high, safety-critical)}`
- Language/runtime: `${input:runtime:Language and runtime}`
- Relevant failure or bug report: `${input:failure:Known failure mode or defect summary (optional)}`

## Requirements

1. Build a compact test design matrix that covers:
- Behavioral scenarios (nominal, edge, error)
- Data partitions (valid, invalid, boundary)
- Interaction/error modes (dependency errors, retries/timeouts if applicable)

2. Implement or update unit tests to cover all high-risk cells in the matrix.

3. Use coverage results to identify weak spots, but do not stop at line/branch percentages.

4. If `${input:failure}` is provided, create a failing reproduction test first, then ensure it passes after the fix.

5. Keep tests deterministic, isolated, and explicit in assertions.

## Output Format

1. `Coverage and Risk Summary`
- Brief summary of existing test completeness and key weak spots.

2. `Test Design Matrix`
- Table with scenario, data class/boundary, expected behavior, and implemented test name.

3. `Implemented Tests`
- List of created/updated test files and what each verifies.

4. `Residual Risks`
- Remaining gaps and why they are out of scope or blocked.

5. `Validation Run`
- Exact command(s) executed and pass/fail result.
