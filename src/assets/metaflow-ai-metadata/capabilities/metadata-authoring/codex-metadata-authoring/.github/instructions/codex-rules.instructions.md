---
description: Guidance for OpenAI Codex approval and command-governance rules.
applyTo: '.codex/rules/**/*.rules'
---

# Codex rules

## Sources and versioning
- Last reviewed: 2026-05-22
- Sources:
  - https://developers.openai.com/codex/rules

## Purpose
- Rules files are governance metadata for command approval behavior.
- Keep them separate from general reasoning, coding style, or repository navigation guidance.

## Authoring guidance
- Scope rules to clear approval and execution concerns.
- Prefer narrow, auditable rule intent over broad wildcard behavior.
- Keep risky-command policy explicit so reviewers can see why a command path is allowed or blocked.
- Align rules with the repository's documented safety model rather than inventing hidden exceptions.
- When a rule exists to compensate for missing repo instructions, fix the instruction gap instead of bloating the rule set.

## What to avoid
- Rewriting `AGENTS.md` guidance as approval rules.
- Using rules as a hidden place to encode repository policy that should be readable in documentation.
- Relying on overly broad patterns when a smaller, more reviewable rule is possible.---
description: Guidance for OpenAI Codex approval and command-governance rules.
applyTo: '.codex/rules/**/*.rules'
---

# Codex rules

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://developers.openai.com/codex/rules

## Purpose
- Rules files are governance metadata for command approval behavior.
- Keep them separate from general reasoning, coding style, or repository navigation guidance.

## Authoring guidance
- Scope rules to clear approval and execution concerns.
- Prefer narrow, auditable rule intent over broad wildcard behavior.
- Keep risky-command policy explicit so reviewers can see why a command path is allowed or blocked.
- Align rules with the repository's documented safety model rather than inventing hidden exceptions.
- When a rule exists to compensate for missing repo instructions, fix the instruction gap instead of bloating the rule set.

## What to avoid
- Rewriting `AGENTS.md` guidance as approval rules.
- Using rules as a hidden place to encode repository policy that should be readable in documentation.
- Relying on overly broad patterns when a smaller, more reviewable rule is possible.
