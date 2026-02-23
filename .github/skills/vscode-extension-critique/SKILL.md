---
name: vscode-extension-critique
description: Use this skill when critically evaluating a VS Code extension project — its architecture, code quality, test coverage, documentation, traceability, conventions, and process rigor. Apply skepticism: assume nothing is correct until verified.
---

# Project Critique

## Purpose

Provide an adversarial, evidence-based critique of a VS Code extension project. The goal is to expose weaknesses before they become defects or release blockers — not to validate what already exists.

**Default posture: skeptical.** Every claim in docs, tests, and code must be earned, not assumed.

## Scope

Critique spans all layers:

1. **Architecture & Design** — Is the design sound, appropriately simple, and not over-engineered?
2. **Code Quality** — Correctness, readability, strict-mode hygiene, security surface, dead code.
3. **Test Coverage** — Gaps, false confidence, untested edge cases, missing failure-mode tests.
4. **Documentation & Traceability** — Stated requirements, design docs, and test records: do they form a complete, consistent chain?
5. **Process & Conventions** — Are stated conventions (AGENTS.md, copilot-instructions, contributing guides) actually followed in code?
6. **Packaging & Release** — VSIX integrity, marketplace manifest accuracy, changelog hygiene, version consistency.

## Critique Protocol

### Step 1 — Orient

Before critiquing, gather live evidence:

- Locate and read the primary entry files: `package.json` (root and any sub-packages), `AGENTS.md` or `CONTRIBUTING.md`, `README.md`, and any release/changelog document.
- Identify the extension entry point (typically `src/extension.ts` or similar) and the test runner configuration.
- List any documentation directories (e.g., `doc/`, `docs/`) and skim their structure.
- Note every claim that can be spot-checked against actual code or test output.

### Step 2 — Enumerate critique targets

Build a critique matrix with at minimum one entry per scope area above. For each target:

| ID | Area | Target | Claim or Concern | Evidence Needed |
|----|------|--------|------------------|-----------------|

### Step 3 — Gather evidence

For each matrix entry, use workspace tools to verify or refute the claim:

- `grep_search` — find actual usage vs. stated convention.
- `read_file` — inspect implementation vs. documented design.
- Run tests via terminal to confirm pass/fail; do not rely on prior results.
- If the project uses a traceability model (REQ/TC/FTD/FTR or similar), cross-reference IDs end-to-end.

Never accept a documentation claim as true without at least one corroborating code or output artifact.

### Step 4 — Rate each finding

Use a four-level severity:

| Level | Label | Meaning |
|-------|-------|---------|
| C1 | Critical | Correctness failure, security hole, or completely broken chain |
| C2 | Major | Significant gap that would block a quality release, or repeated pattern violation |
| C3 | Minor | Inconsistency, missing test, or doc inaccuracy that does not block release |
| C4 | Observation | Low-risk smell; worth noting but not worth fixing immediately |

### Step 5 — Write the critique report

For each finding produce:

```
## [C<N>] <Short title>

**Area:** <Architecture | Code | Tests | Docs | Process | Packaging>
**Evidence:** <exact file/line/output that shows the problem>
**Impact:** <what breaks or misleads if left unfixed>
**Recommendation:** <concrete fix, not vague suggestion>
```

Use the bundled template at `assets/critique-report-template.md` as the base structure for the final report. Fill every section, then remove placeholder markers.
The `Context` section must explicitly record the producing AI model (for example: `AI Model: GPT-5.3-Codex`).

Write the completed report file under `.ai/temp/critiques/`.
Recommended filename pattern: `critique-report-<YYYY-MM-DD>-<agent-or-model>.md`.

### Step 6 — Summarize

End with:
- Total finding counts per severity level.
- Top 3 findings that most threaten release quality.
- One-line verdict: *Ready / Needs Work / Not Ready*.

## Anti-Patterns to Flag Automatically

Always call out these patterns if spotted, regardless of explicit request:

### Universal VS Code extension patterns

- **`vscode` API leaking into pure-logic modules**: any `import ... from 'vscode'` outside of the extension entry point, command handlers, and view providers — this prevents unit testing in Node.
- **Disposable leaks**: subscriptions created but not pushed to `context.subscriptions` (or equivalent lifecycle management).
- **Activation event over-reach**: `activationEvents: ["*"]` or unnecessarily broad activation that loads the extension on every workspace open.
- **Swallowed activation errors**: `activate()` catching errors silently, leaving the extension broken with no user-visible feedback.
- **Stale `package.json` contributions**: commands, menus, or views declared in `contributes` but not implemented (or vice versa).
- **Extension Host API misuse**: calling synchronous file I/O or long-running operations on the Extension Host thread.

### General quality patterns

- **Coverage cheating**: tests that assert nothing meaningful, or mock so heavily nothing real is tested.
- **AGENTS.md / CONTRIBUTING.md drift**: documented commands that do not match actual `package.json` scripts.
- **Stale changelogs**: CHANGELOG.md entries that do not reflect the latest code changes, or missing entries entirely.
- **Dead test fixtures**: fixture files that no test actually references.
- **Linter suppression abuse**: `eslint-disable` or `@ts-ignore` without an explanatory comment.
- **Unchecked error paths**: `catch` blocks that swallow errors silently.
- **Specification theater** (if docs exist): requirement, design, or test documents that exist structurally but contain no verifiable, traceable content.
- **Broken traceability chains** (if traceability is claimed): any ID in a requirements doc with no matching entry downstream in design, test cases, or test results.

## Constraints

- Do not soften findings to protect feelings. Report exactly what the evidence shows.
- Do not manufacture findings. Every critique entry must cite real, inspectable evidence.
- Do not propose fixes until Step 5 is complete. Diagnosis before prescription.
- Distinguish between "found no evidence of X" (unknown) and "evidence confirms X is absent" (confirmed gap).

## Output Format

The final critique report is a Markdown document suitable for filing as an issue or attaching to a release review.

- Start from `assets/critique-report-template.md`.
- Keep one `## [C<N>]` block per finding.
- Include the severity summary table, top 3 release threats, and one-line verdict.
- Do not include summaries of what you read — only findings with evidence.
- Save the report to `.ai/temp/critiques/`.
