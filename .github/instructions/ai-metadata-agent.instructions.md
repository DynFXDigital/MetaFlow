---
description: 'Guidelines for repo-wide and agent instruction files used by Copilot and other AI coding agents.'
applyTo: '**/AGENTS.md,CLAUDE.md,GEMINI.md,.github/copilot-instructions.md,.github/instructions/**/*.instructions.md'
---

# Repo-wide and Agent Instructions

This repository uses both repo-wide custom instructions and agent-specific instructions.

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

## Path-specific Copilot instructions (.github/instructions/**/NAME.instructions.md)
Use for targeted, directory- or file-type-specific guidance without bloating repo-wide instructions.

Required YAML frontmatter
- Must start with YAML frontmatter; nothing may appear before the opening `---`.
- `description` is required: short, specific summary.
- `applyTo` is required: glob pattern(s) for what the file applies to.
- Multiple `applyTo` patterns are comma-separated inside a single YAML string.
- Preferred key order for instruction files: `description`, then `applyTo`, then optional keys.
- Quote values only when needed for YAML parsing clarity.

Optional YAML frontmatter
- `excludeAgent` disables the file for specific agents:
	- `excludeAgent: 'code-review'`
	- `excludeAgent: 'coding-agent'`

Scoping
- Keep scope tight: only rules that apply to files matched by `applyTo`.
- Prefer imperative, testable constraints (“always/never”, exact commands, exact file locations).
- Avoid contradictions with `.github/copilot-instructions.md` and the closest `AGENTS.md`.

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
- Conflicting instructions across multiple `AGENTS.md` files.

## Style
- Use short, imperative bullets.
- Prefer explicit commands over prose.
- Prefer stable paths and scripts over “go look for X”.
