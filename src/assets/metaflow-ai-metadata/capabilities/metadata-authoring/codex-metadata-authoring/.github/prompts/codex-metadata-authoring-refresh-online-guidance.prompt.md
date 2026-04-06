---
name: codex-metadata-authoring:refresh-online-guidance
description: Re-read authoritative OpenAI Codex docs, detect metadata-guidance drift, and propose scoped updates.
agent: agent
argument-hint: "scope and mode, for example 'full capability, propose'"
tools: ["read", "search", "edit", "web"]
---

# Codex Metadata Authoring Online Refresh

Use this prompt to refresh this capability against authoritative OpenAI Codex documentation and current repository best practices.

## Inputs
- Scope: ${input:scope:Target scope (for example "full capability" or "Codex skills guidance only")}
- Mode: ${input:mode:Choose "propose" or "apply"}

## Workflow
1. Read the capability contract and current Codex metadata guidance files.
2. Read the authoritative URLs listed in `.github/skills/codex-metadata/References.md`.
3. Compare local guidance with current official behavior and identify drift.
4. Produce a findings-first report with:
   - affected file
   - stale statement
   - source URL
   - recommended update
5. If mode is `propose`, stop after presenting the patch plan.
6. If mode is `apply`, make only the scoped edits, then run focused validation.

## Output Contract
- Findings first, ordered by impact.
- Include exact file paths for each proposed or applied change.
- Keep every recommendation evidence-backed with authoritative URLs.
- Call out unresolved ambiguity or platform limitations explicitly.
