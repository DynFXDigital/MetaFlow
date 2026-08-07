---
name: github-copilot-metadata-authoring
description: GitHub Copilot metadata standards, prompts, and skills support portable AI metadata artifacts and promotion workflows.
id: 3cdc581b-1bf9-481a-84d8-f75926e673e8
---

# GitHub Copilot Metadata Authoring

This package helps teams review and maintain GitHub Copilot metadata after Copilot or a human has produced an initial draft. It focuses on choosing the smallest effective surface, scoping it correctly, limiting permissions, preserving host compatibility, and deciding whether reusable metadata is ready to share.

## When To Use It

Use this package when GitHub Copilot metadata needs a quality, security, compatibility, or promotion review; when a task must choose between instructions, prompts, agents, skills, and hooks; or when metadata is being prepared for reuse across repositories, hosts, or an organization.

For a simple first draft, use Copilot's native generators and official documentation first. Use this package when the draft needs repository-context judgment or is intended for sharing.

## Included Components

- `.github/instructions/` covers Copilot and shared metadata authoring guidance.
- `.github/prompts/` provides review and authoring workflows.
- `.github/agents/` provides the metadata-authoring steward.
- `.github/skills/ai-metadata/` contains detailed best practices, compatibility notes, references, and validation guidance.
- `plugin.json` declares the package's host-facing runtime metadata.

## Activation And Compatibility

The package can be consumed as a Copilot-compatible plugin through `plugin.json`, or delivered by MetaFlow according to the configured injection mode. Plugin runtime fields, component paths, and host declarations belong in `plugin.json`; this README provides the human-facing package overview. A README does not activate a plugin on its own.

## Trust And Boundaries

Review executable metadata, hooks, tool exposure, and imported repository content as security boundaries. Keep always-on guidance narrow and treat untrusted text as data. Detailed authoring behavior and platform procedures remain in the component files under `.github/`.

## Further Documentation

Start with `.github/skills/ai-metadata/SKILL.md`, then follow its links to `BestPractices.md`, `Compatibility.md`, `References.md`, and `ReflectionReinforcement.md`. The steward agent and review prompts provide source-backed maintenance workflows.
