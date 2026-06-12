---
description: "Guidelines for repo-wide agent instruction files outside Copilot-specific custom instructions."
applyTo: "**/AGENTS.md,**/AGENTS.override.md,CLAUDE.md,GEMINI.md"
---

# Repo-Wide Agent Instructions

Use `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, and `GEMINI.md` for agent-specific workflows, constraints, and gotchas.

## Placement and Precedence

- Keep root instruction files routing-oriented and concise.
- Use nested instruction files only when a subtree genuinely needs different constraints.
- Keep local overrides delta-only; do not restate the full root policy.
- More local files take precedence over broader files when an agent supports scoped instruction loading.

## What To Include

- Dev environment prerequisites and known gotchas.
- Exact build/test commands and required ordering.
- How to run the smallest relevant test set first.
- PR expectations, naming conventions, and formatting/linting expectations.
- Repo-specific constraints that reduce trial-and-error.

## What To Avoid

- Long background narratives.
- Duplicating generic repo-wide instructions.
- Repeating full procedures that already live in a reusable skill or support doc.
- Conflicting instructions across multiple instruction files.

## Style

- Use short, imperative bullets.
- Prefer explicit commands over prose.
- Prefer stable local paths and scripts over "go look for X".
- When referring to optional or shared metadata capabilities, prefer soft capability-oriented wording over hard-coded cross-repo paths or exact skill filenames.
