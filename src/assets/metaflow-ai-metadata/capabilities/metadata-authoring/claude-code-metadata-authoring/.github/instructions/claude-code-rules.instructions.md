---
description: Guidance for Claude Code rules files, including path-scoped rules.
applyTo: '.claude/rules/**/*.md'
---

# Claude Code rules

## Sources and versioning
- Last reviewed: 2026-05-22
- Sources:
  - https://code.claude.com/docs/en/memory.md

## Purpose
- `.claude/rules/` is Claude Code's modular rule surface for unconditional and path-scoped instructions.
- Rules are best for constraints, conventions, and domain knowledge; reusable procedures belong in skills instead.

## Authoring guidance
- Rules without `paths` frontmatter load unconditionally at session start.
- Rules with `paths:` frontmatter load on demand only when Claude reads files matching the glob patterns.
- Use `paths:` when the instruction only matters for specific subsystems or file types.
- Keep path globs tight and reviewable; prefer one clear domain per rule file.
- Use Markdown headings and imperative bullets so the constraint is easy to scan.
- Keep rules compatible with `CLAUDE.md` rather than restating root instructions verbatim.

## What to avoid
- Packing multi-step operational workflows into rules when a skill would be clearer.
- Broad catch-all globs that force irrelevant instructions into unrelated work.
- Conflicting rule files for overlapping paths without an explicit reason.---
description: Guidance for Claude Code rules files, including path-scoped rules.
applyTo: '.claude/rules/**/*.md'
---

# Claude Code rules

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://code.claude.com/docs/en/memory.md

## Purpose
- `.claude/rules/` is Claude Code's modular rule surface for unconditional and path-scoped instructions.
- Rules are best for constraints, conventions, and domain knowledge; reusable procedures belong in skills instead.

## Authoring guidance
- Rules without `paths` frontmatter load unconditionally at session start.
- Rules with `paths:` frontmatter load on demand only when Claude reads files matching the glob patterns.
- Use `paths:` when the instruction only matters for specific subsystems or file types.
- Keep path globs tight and reviewable; prefer one clear domain per rule file.
- Use Markdown headings and imperative bullets so the constraint is easy to scan.
- Keep rules compatible with `CLAUDE.md` rather than restating root instructions verbatim.

## What to avoid
- Packing multi-step operational workflows into rules when a skill would be clearer.
- Broad catch-all globs that force irrelevant instructions into unrelated work.
- Conflicting rule files for overlapping paths without an explicit reason.
