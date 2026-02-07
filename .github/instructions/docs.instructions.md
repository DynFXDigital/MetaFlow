---
description: Overview of documentation standards for plugins and components.
applyTo: "**/doc/**"
---

# Documentation Standards

Every plugin/component maintains a `doc/` folder with core documents linked by traceability.

## Document Types

| Document | Purpose                                                    | File                     |
| -------- | ---------------------------------------------------------- | ------------------------ |
| **SRS**  | Software Requirements Specification – what the system does | `doc/srs/*.md`           |
| **SDD**  | Software Design Document – how it's implemented            | `doc/sdd/*.md`           |
| **TCS**  | Test Case Specification – test definitions                 | `doc/tcs/*.md`           |
| **FTD**  | Functional Test Document – executable procedures           | `doc/ftd/*.md`           |
| **FTR**  | Functional Test Results – execution evidence               | `doc/ftr/*.md`           |
| **FTW**  | Functional Test Write-up – pytest implementations          | `tests/test_*.py`        |
| **VSRS** | Validation requirements (user intent)                      | `doc/validation/srs/*.md` |
| **VTCS** | Validation test cases                                      | `doc/validation/tcs/*.md` |
| **VFTD** | Validation procedures                                      | `doc/validation/ftd/*.md` |
| **VFTR** | Validation results                                         | `doc/validation/ftr/*.md` |

## Traceability Chain

```
SRS (REQ-xxx) → SDD (implements) → TCS (TC-xxx) → FTD (TP-xxx) → FTR (TR-yyyymmdd-nn) → FTW (test_xxx)
Validation: VSRS (VREQ-xxx) → VTCS (VTC-xxx) → VFTD (VTP-xxx) → VFTR (VTR-yyyymmdd-nn)
```

Every requirement must trace forward to design, test cases, and implementations.

## Requirement IDs

Use stable numeric IDs:

- `REQ-0001`, `REQ-0002`, ...
- Never reuse IDs; reserve ranges per subsystem/plugin when helpful.

## Test Case IDs

Use area code + sequential number:

| Prefix  | Area           | Example     |
| ------- | -------------- | ----------- |
| TC-FN   | Functional     | TC-FN-001   |
| TC-INT  | Integration    | TC-INT-001  |
| TC-PERF | Performance    | TC-PERF-001 |
| TC-ERR  | Error handling | TC-ERR-001  |

## Traceability Matrix

Each document includes a traceability section:

**SRS** – lists requirement IDs in each section:

```
### 3.1 Identification
- **REQ-0001**: Identify named characters from chapter text
- **REQ-0002**: Resolve character name variations
```

**SDD** – maps design elements to requirements:

```
## Traceability
| Requirement | Design Element |
|-------------|----------------|
| REQ-0001  | `CharacterExtractor.extract()` |
```

**TCS** – maps test cases to requirements:

```
## Traceability Matrix
| Requirement | Test Cases |
|-------------|------------|
| REQ-0001  | TC-FN-001, TC-FN-002, TC-ERR-001 |
```

**FTW** – docstrings reference both:

```python
def test_extract_named_characters():
    """TC-FN-001: Verifies REQ-0001."""
```

## Workflow

1. **Define requirements** (SRS) – enumerate with REQ-xxx IDs
2. **Design solution** (SDD) – map design to REQ-xxx
3. **Specify tests** (TCS) – create TC-xxx for each REQ-xxx
4. **Implement tests** (FTW) – reference TC-xxx and REQ-xxx in docstrings

## Validation

Before release:

- Every REQ-xxx appears in SDD traceability
- Every REQ-xxx has at least one TC-xxx
- Every TC-xxx has a corresponding pytest function
- No orphan test cases (TC without REQ)

## Related Instructions

- [product-srs.instructions.md](product-srs.instructions.md) – SRS template and policy
- [dev-sdd.instructions.md](dev-sdd.instructions.md) – SDD template and policy
- [ft-tcs.instructions.md](ft-tcs.instructions.md) – TCS template
- [ft-ftw.instructions.md](ft-ftw.instructions.md) – FTW/pytest template
