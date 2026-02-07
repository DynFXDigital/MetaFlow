---
description: Template for Functional Test Write-ups (FTW) - implemented pytest tests.
applyTo: "**/tests/test_*.py"
---

# FTW Template

Guidelines for implementing TCS test cases as pytest tests.

## File Layout

```
tests/
├── test_{component}.py
├── test_{component}_integration.py
├── conftest.py
└── fixtures/
```

## Function Format

```python
def test_{what}_{scenario}_{expected}():
    """TC-FN-001: {description}.

    Verifies: REQ-FN-001
    """
    # Arrange
    # Act
    # Assert
```

## Naming

`test_{what}_{scenario}_{outcome}`

- `test_extraction_empty_file_returns_empty`
- `test_report_markdown_includes_summary`
- `test_config_invalid_raises_error`

## Patterns

**Fixtures:**

```python
@pytest.fixture
def sample_chapter():
    return "Chapter text..."
```

**Parametrized:**

```python
@pytest.mark.parametrize("input,expected", [("a", 1), ("b", 2)])
def test_func(input, expected): ...
```

**Mocking:**

```python
def test_api_retry(mocker):
    mock = mocker.patch("module.api_call", side_effect=[Error(), ok])
    result = func()
    assert mock.call_count == 2
```

## Markers

```python
@pytest.mark.slow        # >5s
@pytest.mark.integration # external services
@pytest.mark.unit        # fast, isolated
```

## Assertions

- Specific: `assert result.status == "ok"`
- With message: `assert len(items) == 3, f"got {len(items)}"`
- Avoid: `assert result` or `assert result is not None`

## Coverage

- Each TCS case → pytest function
- Critical paths → multiple scenarios
- Error paths tested
- Target ≥80% for new code

## Traceability

Every test function docstring must include:

- **TC-xxx ID** from TCS
- **REQ-xxx ID** being verified

Example:

```python
def test_extract_named_characters():
    """TC-FN-001: Extract characters from chapter.

    Verifies: REQ-FN-001
    """
    ...

def test_extract_empty_chapter_returns_empty():
    """TC-ERR-001: Handle empty input gracefully.

    Verifies: REQ-FN-001, REQ-NF-003
    """
    ...
```

## Validation

- `grep -r "TC-" tests/` lists all implemented test cases
- Every TC-xxx in TCS should appear in test docstrings
- No orphan tests (pytest without TC reference)
