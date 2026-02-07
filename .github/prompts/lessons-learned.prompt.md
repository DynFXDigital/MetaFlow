---
agent: agent
description: 'Record any durable lessons learned (append-only) using runSubagent.'
tools: ['read', 'edit', 'search', 'agent', 'memory', 'todo']
---

Record any lessons learned from the work just completed.

## Inputs
- `${input:focus:What area should lessons focus on (optional; e.g., "build", "tests", "automation", "docs")}`

## Procedure
1. Use `runSubagent` to review recent work context (recent conversation + current workspace changes) and extract 0–3 durable, repo-helpful lessons learned.
   - Prefer stable, repeatable guidance (commands, cwd, env vars, file paths, ordering constraints, common pitfalls).
   - Exclude transient details and anything sensitive.
   - If there are no meaningful lessons, return “No lessons learned to record.” and stop.

2. Before writing, skim existing entries in `.github/instructions/lessons-learned.instructions.md` to avoid duplicating an existing lesson.

3. Append the new entries to the bottom of the “## Current Lessons Learned” section in `.github/instructions/lessons-learned.instructions.md`.
   - Do not reorganize, rewrite, or reflow existing entries.
   - Use exactly this format per entry:
     - `(YYYY-MM-DD) Context: Lesson learned.`
   - Keep each entry 1–3 sentences.

## Output
- List the entries appended (or “No lessons learned to record.”).

## Acceptance Criteria
- Only appends new bullets under “## Current Lessons Learned”.
- No categorization or re-ordering.
- No secrets / credentials / private conversation content / long logs.
