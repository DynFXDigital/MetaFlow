# Reflect Prompt (Generic)

This repo includes an on-demand Copilot prompt file that performs “session reflection”:

- Extracts durable learnings from the current session
- Writes a proposal to `.ai/temp/reflect/` (git-ignored)
- Updates the best available memory store (prefer sticky notes; fallback to a small memory doc)
- Proposes minimal improvements to AI-meta (instructions/prompts/agent docs)

## Prompt File

- `.github/prompts/reflect.prompt.md`

## Proposal Output

- Directory: `.ai/temp/reflect/`
- Filename convention (preferred): `REFLECT-<yyyyMMdd>-<context>.md`

## Memory Store Selection

1. `.github/instructions/sticky-notes.instructions.md` (append a dated bullet)
2. `.github/instructions/resources/AI-MEMORY.md` (fallback, append-only)
3. If neither exists, create `MEMORY.md` at repo root (append-only)

## Safety Defaults

- Always write the proposal file first.
- Only apply **append-only, low-risk** updates automatically.
- Never store secrets, PII, or manuscript/customer content.
