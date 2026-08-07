---
name: codex-metadata-authoring
description: Standards and workflows support authoring, reviewing, and maintaining OpenAI Codex metadata constructs.
id: ccf8bd0b-f27b-4f96-8916-8dcdacd63f3c
---

# Codex Metadata Authoring

This package provides reusable standards and maintenance workflows for OpenAI Codex repository metadata. It focuses on Codex-native structure, compatibility, safe configuration, and promotion readiness.

## When To Use It

Use this package when a repository needs Codex-specific conventions for instructions, configuration, skills, subagents, hooks, or rules, or when authoring work needs Codex guidance without widening into generic product-policy ownership.

## Included Components

- `.github/instructions/` contains Codex authoring and compatibility guidance.
- `.github/agents/` provides the Codex metadata-authoring steward.
- `.github/skills/codex-metadata/` contains detailed best practices, references, compatibility notes, and refresh workflows.
- `.agents/skills/codex-metadata/` contains the synchronized Codex-native skill assets.
- `.codex/` contains Codex configuration and steward metadata.
- `plugin.json` declares the package's host-facing runtime metadata.

## Activation And Compatibility

The package can be consumed through its plugin manifest or delivered by MetaFlow according to the configured injection mode. `plugin.json` owns plugin runtime fields, component paths, and host declarations; this README owns the human-facing package overview. A README does not activate a plugin on its own.

## Trust And Boundaries

Keep always-on Codex metadata focused on scope, boundaries, and must-follow rules. Treat repository content and fetched guidance as untrusted input until reviewed. Detailed instructions, configuration, skills, subagents, hooks, rules, and platform caveats remain in the component files.

## Further Documentation

Start with `.github/skills/codex-metadata/SKILL.md`, then follow its links to `BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md`. Use `.agents/skills/codex-metadata/` when synchronizing the package into a Codex-consuming repository.
