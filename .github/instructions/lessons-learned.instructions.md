---
description: "Instructs agents to record lightweight lessons learned (dated + contextual) while working in this repo."
applyTo: ".github/instructions/lessons-learned.instructions.md"
---

# Lessons Learned

Lightweight, append-only operational notes

- Record lessons learned while working (things you would want to remember next time), even if they are not specific to the current task.
- Do not try to categorize or reorganize entries. Append new entries to the bottom in chronological order.
- Include a short context so the note is actionable (area, file, command, config, symptom, etc.).
- Use this format:
  - `(YYYY-MM-DD) Context: Lesson learned.`
- Keep entries concise (aim for 1–3 sentences).
- Prefer durable guidance (repeatable commands, stable paths, non-obvious pitfalls) over transient details.
- Never record secrets, credentials, customer data, private conversation content, or long stack traces/log dumps.

## Maintenance

- If an entry becomes obsolete, append a new entry that supersedes it (do not rewrite history).
- If this section grows beyond ~100 lines, prune by deleting clearly obsolete entries (or collapse multiple entries into one newer entry that preserves the key idea).

## Current Lessons Learned

Append new entries here following the required format.

- (2026-02-13) MetaFlow extension unit tests: `npm -C src run test:unit` does not compile TypeScript first; run `npm -C src run compile` before unit tests after source edits.
