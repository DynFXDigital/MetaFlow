---
description: Template for Functional Test Write-ups (FTW) - implemented automated tests.
applyTo: "**/*.test.ts"
---

# FTW Template

Guidelines for implementing TCS test cases as automated TypeScript tests.

## File Layout

```
test/
├── {component}.test.ts
├── {component}.integration.test.ts
└── fixtures/
```

## Function Format

```ts
it('TC-FN-001: {description} (Verifies: REQ-FN-001)', () => {
    // Arrange
    // Act
    // Assert
});
```

## Naming

`{what}_{scenario}_{outcome}`

- `extracts_empty_file_returns_empty`
- `report_markdown_includes_summary`
- `config_invalid_throws_error`

## Patterns

**Fixtures:** create reusable builders/helpers under `test/fixtures/`.

**Parameterized tests:** use table-driven `for ... of` loops or framework parameterization helpers.

**Mocking:** use Sinon/test doubles or dependency injection according to local test conventions.

## Markers

Use suite names or tags to differentiate `unit`, `integration`, and `slow` cases.

## Assertions

- Specific: `assert result.status == "ok"`
- With message: `assert len(items) == 3, f"got {len(items)}"`
- Avoid: `assert result` or `assert result is not None`

## Coverage

- Each TCS case → automated test case
- Critical paths → multiple scenarios
- Error paths tested
- Target ≥80% for new code

## Traceability

Every automated test should include:

- **TC-xxx ID** from TCS
- **REQ-xxx ID** being verified

Example:

```ts
it('TC-FN-001: Extract characters from chapter (Verifies: REQ-FN-001)', () => {
    // ...
});

it('TC-ERR-001: Handle empty input gracefully (Verifies: REQ-FN-001, REQ-NF-003)', () => {
    // ...
});
```

## Validation

- `grep -r "TC-" test/` lists all implemented test cases
- Every TC-xxx in TCS should appear in test docstrings
- No orphan tests (automated tests without TC reference)
