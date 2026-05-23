---
description: 'Guidelines for repo-wide and agent instruction files used by Copilot and other AI coding agents.'
applyTo: '**/AGENTS.md,CLAUDE.md,GEMINI.md,.github/copilot-instructions.md,.github/instructions/**/*.instructions.md'
---

# Repo-wide and Agent Instructions

This repository uses both repo-wide custom instructions and agent-specific instructions.

## Sources and versioning

- Last reviewed: 2026-05-22
- Sources: - https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot - https://code.visualstudio.com/docs/copilot/customization/custom-instructions - https://docs.github.com/en/copilot/concepts/agents/about-agent-skills

## Repo-wide Copilot instructions (.github/copilot-instructions.md)

Use for broad repo context and defaults.

Include (high signal)

- What the repo builds and how to validate changes.
- Key directories and where common work happens.
- Build/test/run order, required tool versions, and CI parity.
- Conventions: naming, formatting, “always/never” rules.

Avoid

- One-off task instructions.
- Vague style demands that fight other instruction layers.
- “Go read X” as the primary instruction (unless stable and essential).

## Path-specific Copilot instructions (.github/instructions/\*\*/NAME.instructions.md)

Use for targeted, directory- or file-type-specific guidance without bloating repo-wide instructions.

Required YAML frontmatter

- Must start with YAML frontmatter; nothing may appear before the opening `---`.
- `description` is required: short, specific summary.
- `applyTo` is required: glob pattern(s) for what the file applies to.
- Multiple `applyTo` patterns are comma-separated inside a single YAML string.
- Preferred key order for instruction files: `description`, then `applyTo`, then `excludeAgent` (if used), then other optional keys.
- Do not add decorative frontmatter keys such as `name`; use the first Markdown heading as the human-readable title.
- Quote values only when needed for YAML parsing clarity.

Optional YAML frontmatter

- `excludeAgent` disables the file for specific agents: - `excludeAgent: 'code-review'` - `excludeAgent: 'coding-agent'`

Scoping

- Keep scope tight: only rules that apply to files matched by `applyTo`.
- Prefer imperative, testable constraints (“always/never”, exact commands, exact file locations).
- Keep the hot path thin: include enforceable defaults and short delegation cues, then point deeper workflow detail at a nearby skill or support doc.
- For always-on instruction surfaces, prefer telling the agent when to invoke a workflow over embedding the full workflow inline.
- If a capability intentionally uses broad `applyTo` scope as an always-on optimization, keep the instruction extremely compact and route to a skill or nearby support doc instead of carrying the workflow there.
- Put backend-selection rules and other short routing logic in the always-on file only when they change what happens next; move operational steps into progressively loaded support docs.
- Avoid contradictions with `.github/copilot-instructions.md` and the closest `AGENTS.md`.
- When an instruction governs interactive workflows, prefer explicit trigger conditions over vague “use askQuestions” wording.
- For user-facing clarifications or approvals, define what counts as materially missing or ambiguous input, tell the agent to batch the smallest useful question set, prefer recommended defaults, and include a concise chat fallback when the tool is unavailable.

## Agent instruction files (AGENTS.md / CLAUDE.md / GEMINI.md)

Use for agent-specific workflows, constraints, and gotchas.

## Placement and precedence

- You can create one or more `AGENTS.md` files anywhere in the repository.
- When an agent is working, the nearest `AGENTS.md` in the directory tree takes precedence over more distant ones.
- As an alternative, a single `CLAUDE.md` or `GEMINI.md` file can be placed in the repository root.

## Instruction layering

Multiple instruction layers can apply and are combined; higher-precedence layers can override lower ones.

- Personal instructions
- Repository custom instructions (path-specific + repo-wide)
- Agent instructions (for example `AGENTS.md`)
- Organization custom instructions

## Environment notes

- On GitHub.com, path-specific instructions are only supported for Copilot coding agent and Copilot code review.
- In VS Code, `.instructions.md` files can be applied automatically via `applyTo` or attached manually.
- VS Code combines instruction files; no order is guaranteed.

## Practical constraint: code review length

Copilot code review reads only the first ~4,000 characters of any instruction file. Put the most review-critical constraints near the top.

## What to include

- Dev environment prerequisites and “known gotchas”.
- Exact build/test commands and required ordering.
- How to run the smallest relevant test set first.
- PR expectations: CI requirements, naming conventions, formatting/linting expectations.
- Repo-specific constraints that reduce trial-and-error (paths, scripts, tools).

## What to avoid

- Long background narratives.
- Duplicating generic repo-wide instructions; link or summarize instead.
- Repeating full procedures that already live in a reusable skill or support doc.
- Conflicting instructions across multiple `AGENTS.md` files.

## Style

- Use short, imperative bullets.
- Prefer explicit commands over prose.
- Prefer stable local paths and scripts over “go look for X”.
- When referring to optional or shared metadata capabilities, prefer soft capability-oriented wording over hard-coded cross-repo paths or exact skill filenames.---
  description: 'Guidelines for repo-wide and agent instruction files used by Copilot and other AI coding agents.'
  applyTo: '**/AGENTS.md,CLAUDE.md,GEMINI.md,.github/copilot-instructions.md,.github/instructions/**/\*.instructions.md'

---

# Repo-wide and Agent Instructions

This repository uses both repo-wide custom instructions and agent-specific instructions.

## Sources and versioning

- Last reviewed: 2026-03-26
- Sources:
    - https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot
    - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
    - https://docs.github.com/en/copilot/concepts/agents/about-agent-skills

## Repo-wide Copilot instructions (.github/copilot-instructions.md)

Use for broad repo context and defaults.

Include (high signal)

- What the repo builds and how to validate changes.
- Key directories and where common work happens.
- Build/test/run order, required tool versions, and CI parity.
- Conventions: naming, formatting, “always/never” rules.

Avoid

- One-off task instructions.
- Vague style demands that fight other instruction layers.
- “Go read X” as the primary instruction (unless stable and essential).

## Path-specific Copilot instructions (.github/instructions/\*\*/NAME.instructions.md)

Use for targeted, directory- or file-type-specific guidance without bloating repo-wide instructions.

Required YAML frontmatter

- Must start with YAML frontmatter; nothing may appear before the opening `---`.
- `description` is required: short, specific summary.
- `applyTo` is required: glob pattern(s) for what the file applies to.
- Multiple `applyTo` patterns are comma-separated inside a single YAML string.
- Preferred key order for instruction files: `description`, then `applyTo`, then `excludeAgent` (if used), then other optional keys.
- Do not add decorative frontmatter keys such as `name`; use the first Markdown heading as the human-readable title.
- Quote values only when needed for YAML parsing clarity.

Optional YAML frontmatter

- `excludeAgent` disables the file for specific agents:
    - `excludeAgent: 'code-review'`
    - `excludeAgent: 'coding-agent'`

Scoping

- Keep scope tight: only rules that apply to files matched by `applyTo`.
- Prefer imperative, testable constraints (“always/never”, exact commands, exact file locations).
- Keep the hot path thin: include enforceable defaults and short delegation cues, then point deeper workflow detail at a nearby skill or support doc.
- For always-on instruction surfaces, prefer telling the agent when to invoke a workflow over embedding the full workflow inline.
- If a capability intentionally uses broad `applyTo` scope as an always-on optimization, keep the instruction extremely compact and route to a skill or nearby support doc instead of carrying the workflow there.
- Put backend-selection rules and other short routing logic in the always-on file only when they change what happens next; move operational steps into progressively loaded support docs.
- Avoid contradictions with `.github/copilot-instructions.md` and the closest `AGENTS.md`.
- When an instruction governs interactive workflows, prefer explicit trigger conditions over vague “use askQuestions” wording.
- For user-facing clarifications or approvals, define what counts as materially missing or ambiguous input, tell the agent to batch the smallest useful question set, prefer recommended defaults, and include a concise chat fallback when the tool is unavailable.

## Agent instruction files (AGENTS.md / CLAUDE.md / GEMINI.md)

Use for agent-specific workflows, constraints, and gotchas.

## Placement and precedence

- You can create one or more `AGENTS.md` files anywhere in the repository.
- When an agent is working, the nearest `AGENTS.md` in the directory tree takes precedence over more distant ones.
- As an alternative, a single `CLAUDE.md` or `GEMINI.md` file can be placed in the repository root.

## Instruction layering

Multiple instruction layers can apply and are combined; higher-precedence layers can override lower ones.

- Personal instructions
- Repository custom instructions (path-specific + repo-wide)
- Agent instructions (for example `AGENTS.md`)
- Organization custom instructions

## Environment notes

- On GitHub.com, path-specific instructions are only supported for Copilot coding agent and Copilot code review.
- In VS Code, `.instructions.md` files can be applied automatically via `applyTo` or attached manually.
- VS Code combines instruction files; no order is guaranteed.

## Practical constraint: code review length

Copilot code review reads only the first ~4,000 characters of any instruction file. Put the most review-critical constraints near the top.

## What to include

- Dev environment prerequisites and “known gotchas”.
- Exact build/test commands and required ordering.
- How to run the smallest relevant test set first.
- PR expectations: CI requirements, naming conventions, formatting/linting expectations.
- Repo-specific constraints that reduce trial-and-error (paths, scripts, tools).

## What to avoid

- Long background narratives.
- Duplicating generic repo-wide instructions; link or summarize instead.
- Repeating full procedures that already live in a reusable skill or support doc.
- Conflicting instructions across multiple `AGENTS.md` files.

## Style

- Use short, imperative bullets.
- Prefer explicit commands over prose.
- Prefer stable local paths and scripts over “go look for X”.
- When referring to optional or shared metadata capabilities, prefer soft capability-oriented wording over hard-coded cross-repo paths or exact skill filenames.
