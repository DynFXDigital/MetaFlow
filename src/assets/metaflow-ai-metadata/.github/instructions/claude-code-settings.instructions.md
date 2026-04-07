---
description: Guidance for Claude Code project and local settings files.
applyTo: '.claude/settings.json,.claude/settings.local.json'
---

# Claude Code settings

## Sources and versioning
- Last reviewed: 2026-03-28
- Sources:
  - https://code.claude.com/docs/en/settings.md
  - https://code.claude.com/docs/en/hooks.md
  - https://code.claude.com/docs/en/hooks-guide.md

## Purpose
- `.claude/settings.json` is the team-shared settings surface for permissions, hooks, environment variables, model defaults, and related Claude Code behavior.
- `.claude/settings.local.json` is the personal per-project override layer and should remain out of shared repository policy.

## Authoring guidance
- Keep project settings valid JSON and explicit about why each permission, hook, or environment variable exists.
- Use `.claude/settings.json` for team-shared defaults and `.claude/settings.local.json` for personal overrides.
- Remember that arrays merge, objects deep-merge, and deny rules win regardless of scope.
- Use `permissions.allow` and `permissions.deny` for auditable command governance rather than informal prose comments.
- Keep hooks deterministic, reviewable, and fast; prefer shared project hooks only when the whole team benefits.
- Use `claudeMdExcludes` to suppress irrelevant instruction files in large repositories.
- Do not commit secrets into `env`; prefer indirection through already-managed environment variables.

## Hooks guidance
- Claude Code hooks are inline settings metadata, not a separate repository file.
- Document the matcher intent clearly when using lifecycle events such as `PreToolUse`, `PostToolUse`, or `InstructionsLoaded`.
- Use blocking behavior deliberately; exit code `2` blocks the action and should be reserved for real policy enforcement.
- Prefer project hooks for team guardrails and local settings hooks for personal automation.

## What to avoid
- Committing personal overrides to the shared project settings file.
- Mixing shared security policy and personal convenience shortcuts in the same layer.
- Treating settings as a substitute for `CLAUDE.md`, rules, or skills.
