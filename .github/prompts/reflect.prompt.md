```prompt
# Reflect (Generic Workspace)

Capture durable learnings from this session, write a proposal to disk, and (when safe) update AI-meta + memory stores so we don’t re-learn the same things.

## Required Outputs (always)

1. Write a proposal file under `.ai/temp/reflect/`.
2. Optionally apply **low-risk, append-only** updates to repo AI-meta and memory stores.

## Primary Artifact: Proposal File

Create `.ai/temp/reflect/` if needed.

Name the file using this convention:
- `REFLECT-<yyyyMMdd>-<context>.md`
  - Examples: `REFLECT-20260103-general.md`, `REFLECT-20260103-universal_client.md`

Inside the file, include these sections:

- `Feature Overview` (1 paragraph): what this reflect is about.
- `Session Learnings` (max ~10 bullets): only durable, reusable facts.
- `Proposed Updates` (bullets): files to change/create + what/why.
- `Candidate Patch Summary` (bullets): what you would edit if applying now.
- `Do Not Store` (bullets): sensitive/transient items intentionally excluded.

## Scope: What Counts As “Durable Learning”

High-signal only:
- Workflow: build/test/lint commands that worked + quirks
- Environment traps: ports, shells, OS/toolchain constraints
- Repo conventions: where docs live, how tasks run, naming patterns
- Decisions: explicit choices made (and why)

Exclude:
- Secrets, tokens, credentials
- PII or private manuscript/customer data
- Large logs or stack traces (summarize instead)
- One-off outcomes that won’t generalize

## Where To Store “Memory”

Prefer (in order):
1. If present, append a short bullet to `.github/instructions/sticky-notes.instructions.md` under `## Current Sticky Notes` using the required format:
   - `- (YYYY-MM-DD) <topic>: <hint>` (≤ ~150 chars)
2. If no sticky-notes system exists, use fallback memory file:
   - `.github/instructions/resources/AI-MEMORY.md` (append-only)
3. If neither exists, create a minimal `MEMORY.md` at repo root (append-only) and note that you created it.

## AI-Meta Updates (instructions/skills/prompts/agents)

Goal: refine the repo’s AI guidance so future runs are smoother.

- Discover existing mechanisms by scanning for:
  - `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, `AGENTS.md`, `.clinerules/`, `.plan/**/Context.md`
  - “agents”, “skills”, “prompts”, “instructions” folders
- Only propose or apply changes to **AI-meta**, not product/runtime code.
- Prefer small, targeted edits (append or tweak), avoid rewrites.

## Safety / Application Rules

- ALWAYS write the proposal file.
- You MAY apply changes immediately only if they are:
  - append-only (e.g., sticky note)
  - clearly correct
  - do not risk behavior changes
- Otherwise: stop after writing the proposal and provide the recommended patch list.

## Optional Delegation

If a subagent tool is available, you may delegate the “repo scan + patch proposal” step. If not, do it yourself.

### Subagent Prompt Template (copy/paste)

Provide this (filled in) to the subagent:

"""
You are a Reflection Implementer subagent.

Input:
- Session learnings (bullets)
- Repo/workspace contents

Tasks:
1) Identify the best available memory mechanism:
  - Prefer `.github/instructions/sticky-notes.instructions.md` if present.
  - Else append to `.github/instructions/resources/AI-MEMORY.md` (or create it if missing).
2) Propose minimal AI-meta updates (instructions/prompts/agent docs):
  - Target only AI-meta files (e.g., `.github/instructions/**`, `.github/prompts/**`, `AGENTS.md`).
  - Prefer append-only or tiny edits.
  - Do not change product/runtime code.
3) Return:
  - A short list of file edits (path + intent)
  - A ready-to-apply patch (if safe)

Constraints:
- No secrets/PII, no large logs.
- If unsure, propose only (no edits).
"""

## Start

1. Summarize session learnings.
2. Write the proposal file to `.ai/temp/reflect/`.
3. Update memory store (sticky-notes or fallback) if safe.
4. Propose AI-meta updates with exact file targets.
```
