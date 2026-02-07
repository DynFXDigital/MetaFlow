---
description: Template for Test Case Specifications (TCS).
applyTo: "**/doc/TCS.md"
---

# TCS Template

Define test cases that verify SRS requirements.

## Structure

### 1. Overview

- Component, SRS reference, coverage goals

### 2. Environment

- Python version, fixtures, mocks

### 3. Test Cases

```
#### TC-FN-001: {Description}
**Req:** REQ-FN-001
**Pre:** {setup conditions}
**Input:** {test data}
**Steps:** {numbered steps if multi-step}
**Expected:** {verifiable outcome}
**Priority:** Critical | High | Medium | Low
```

## Categories

- **3.1 Functional** (TC-FN-xxx) – happy path, edge cases, errors
- **3.2 Integration** (TC-INT-xxx) – APIs, file I/O, cross-module
- **3.3 Performance** (TC-PERF-xxx) – throughput, resource limits
- **3.4 Error Handling** (TC-ERR-xxx) – failures, retries, fallbacks

## ID Prefixes

| Prefix  | Category       |
| ------- | -------------- |
| TC-FN   | Functional     |
| TC-INT  | Integration    |
| TC-PERF | Performance    |
| TC-ERR  | Error handling |

## Traceability Matrix

| Requirement | Test Cases                       | Coverage |
| ----------- | -------------------------------- | -------- |
| REQ-FN-001  | TC-FN-001, TC-FN-002, TC-ERR-001 | Full     |
| REQ-FN-002  | TC-FN-003                        | Partial  |
| REQ-NF-001  | TC-PERF-001                      | Full     |

## Style

- One requirement = at least one test case
- Verifiable expected results
- Include positive and negative cases
- Target 10-30 test cases per plugin
