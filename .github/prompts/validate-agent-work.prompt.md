---
description: Validate coding-agent branch work for issue alignment, quality, and non-regression.
agent: agent
---

# Validate Agent Work

Automated reviewer for coding agent branches (e.g. `copilot/fix-<issue>`). Ensure correctness, alignment with GitHub issue, code quality, and non-regression.

## Input & Discovery

One of: branch name | issue number | PR number.
Resolve other artifacts using rules below. Document gaps if discovery fails.

### Resolution Rules

1. BRANCH `copilot/fix-<n>` → issue #<n>, find PR with head=branch.
2. ISSUE #<n> → branch `copilot/fix-<n>` (latest), PRs referencing issue.
3. PR → head branch + linked issues.
4. If unresolved, document gap under Issue Alignment.

### Data Available

branch, issue_id, issue_body, pr_id, diff_files, diff_patch, test_results, test_failures, coverage_delta, lint_issues, commit_hash.

**Note:** Check issue_body for parent epic/issue references (e.g. "Parent Epic: #10") for additional context.

## Review Objectives

1. Issue Alignment: Implements ONLY described scope; satisfies acceptance criteria; no scope creep.
2. Correctness: New/modified tests cover logic and pass; edge cases addressed.
3. Non-Regression: Previously passing tests remain green; removed tests justified.
4. Code Quality: Readable naming/structure; no unrelated refactors; functions <75 lines.
5. Risk: Flag race conditions, silent excepts, regex brittleness.
6. Security: No secrets or insecure temp handling.

## Output Template

```
# Validation Report for <branch>

## Summary
<verdict + key risk>

## Issue Alignment
Status: Aligned/Partial/Misaligned
Evidence: <file paths & issue items>

## Test & Coverage
New tests: <list|none>
Failures: <none|list>
Coverage delta: <summary|n/a>

## Code Quality
Positives: <bullets>
Concerns: <bullets>

## Risks / Edge Cases
<bullets>

## Recommendations
Decision: Merge/Merge w/ fixes/Block (<reason>)
Follow-ups: <bullets>

## Detail Notes
<file>: <note>
```

## Rules

- Missing acceptance criteria → Issue Alignment = Partial/Misaligned.
- Test failures or untested new logic → Block.
- Missing issue/body and scope not inferable → Block.
- Do NOT modify code, invent files, speculate beyond inputs, leak secrets, or add extra sections.

## Validation Process

1. **Checkout properly**: Use `git checkout -b local-branch remote/branch --track` then `git rebase develop` (not just commit checkout)
2. **Run ALL tests**: Must verify full test suite passes, not just new tests
3. **Handle dependencies**: Install missing packages before claiming test success
4. **Force push**: After rebase, inform user to `git push origin branch-name --force`

## Minimal Report Format

```
# Validation: [PASS/FAIL] - [branch-name]

Tests: [X passed, Y failed]
Changes: [None/List critical fixes made]
Decision: [Merge/Block]
Action: [Force push required/Ready to merge]
```

## Example

**Good:** Adds targeted tests, all green, counters verified.
**Bad:** Changes salvage regex + adds counter tests (scope creep), 1 failing test.

Use template exactly; document gaps explicitly.
