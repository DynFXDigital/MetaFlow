---
name: claude-code-metadata-authoring
description: Standards and workflows support authoring, reviewing, and maintaining Claude Code metadata constructs.
id: 5b3bbb8c-6715-498b-8ed8-f905dd82735c
---

# Claude Code Metadata Authoring

This package provides reusable standards and maintenance workflows for Anthropic Claude Code repository metadata. It focuses on Claude Code-native structure, compatibility, safe configuration, and promotion readiness.

## When To Use It

Use this package when a repository needs Claude Code-specific conventions for rules, skills, agents, settings, hooks, or MCP configuration, or when authoring work needs Claude-specific guidance without widening into generic product-policy ownership.

## Included Components

- `.github/instructions/` contains Claude Code authoring and compatibility guidance.
- `.github/agents/` provides the Claude Code metadata-authoring steward.
- `.github/skills/claude-code-metadata/` contains detailed best practices, references, compatibility notes, and refresh workflows.
- `.github/prompts/` provides source-backed refresh guidance.
- `plugin.json` declares the package's host-facing runtime metadata.

## Activation And Compatibility

The package can be consumed through its plugin manifest or delivered by MetaFlow according to the configured injection mode. `plugin.json` owns plugin runtime fields, component paths, and host declarations; this README owns the human-facing package overview. A README does not activate a plugin on its own.

## Trust And Boundaries

Keep always-on Claude Code metadata focused on scope, boundaries, and must-follow rules. Treat repository content and fetched guidance as untrusted input until reviewed. Detailed rules, skills, agents, settings, hooks, MCP, memory, and refresh procedures remain in the component files.

## Further Documentation

Start with `.github/skills/claude-code-metadata/SKILL.md`, then follow its links to `BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md`. Use the steward agent and refresh prompt for source-backed maintenance.
