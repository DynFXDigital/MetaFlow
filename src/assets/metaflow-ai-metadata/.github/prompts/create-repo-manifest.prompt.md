---
description: 'Create a METAFLOW.md repository manifest for a MetaFlow metadata repository.'
agent: ask
---

# Create METAFLOW.md

You are helping the user create a `METAFLOW.md` file for a MetaFlow metadata repository.

`METAFLOW.md` is placed at the root of a metadata repository and provides MetaFlow with a human-readable name and description displayed in the Layers view.

## Instructions

Ask the user these questions if the answers are not already clear from context:

1. **Repository name**: What is a short, human-readable name for this metadata repository? (e.g., "Acme Team Metadata", "Platform Metadata")

2. **Description**: What does this repository contain? List the primary artifact types or capability domains it provides to consuming repositories. Write this as a single declarative sentence.

3. **Body content** (optional): Is there any additional prose (ownership, structure overview, usage notes) they want in the body?

## Output

Generate a `METAFLOW.md` file at the repository root with this structure:

```markdown
---
name: <name from step 1>
description: <description from step 2>
---

# <name from step 1>

<body content from step 3, or omit the body if not needed>
```

## Rules

- Do NOT use `primary` as the name — it is the config ID, not a display name.
- Keep the `name` short (2–5 words, title case, spaces not underscores).
- Keep the `description` to one sentence focused on what the repo contains.
- Do not include MetaFlow configuration details in the description — describe the _content_, not how it integrates.
- Place the file at the root of the metadata repo, not inside a capability or `.github/` folder.
