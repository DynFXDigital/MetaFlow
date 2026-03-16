---
description: 'Guidelines for authoring the METAFLOW.md repository manifest. This file appears at a metadata repo root and provides a human-readable name and description surfaced by MetaFlow in the UI.'
applyTo: 'METAFLOW.md'
---

# METAFLOW.md — Repository Manifest

`METAFLOW.md` is an optional file placed at the root of a MetaFlow metadata repository. MetaFlow reads it to display a human-readable name and description for the repository in the Layers view tooltip and tree row label.

## File Format

```markdown
---
name: <display name>
description: <one-line description of repo contents and scope>
---

# <Title>

<Optional prose body describing the repository.>
```

## Frontmatter Fields

| Field         | Required | Description                                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------------------- |
| `name`        | No       | Short display name shown in the MetaFlow Layers view. Overrides the repo ID or folder name. |
| `description` | No       | One-sentence description of the repository scope. Shown in italic in the tooltip.           |

Both fields are optional. A file with no frontmatter is valid; MetaFlow will simply skip structured metadata extraction.

## Authoring Guidelines

- **`name`**: Use a short, human-readable title (e.g., `Acme Team Metadata`, `My Team Metadata`). Avoid underscores or slugs — prefer spaces and title case.
- **`description`**: Write a single declarative sentence listing the primary artifact categories or domains the repository covers. Focus on what the repo _contains_, not how it integrates with MetaFlow.
- **Body**: Optional. Use it to document the repository structure, ownership, or usage notes for human readers. MetaFlow does not parse the body beyond frontmatter.

## Placement

Place `METAFLOW.md` at the **root** of the metadata repository — the same directory referenced by `localPath` in the MetaFlow config (`.metaflow/config.jsonc`).

```
my-metadata-repo/
├── METAFLOW.md         ← here
├── capabilities/
│   └── my-capability/
│       ├── CAPABILITY.md
│       └── .github/
└── ...
```

## Example

```markdown
---
name: Acme AI Metadata
description: Shared Copilot Pack providing coding conventions, review workflows, planning guidelines, and SDLC traceability for Acme engineering teams.
---

# Acme AI Metadata

This repository provides shared AI coding agent metadata for all Acme project repositories.
```
