---
name: agent-skills
description: Author, review, and validate portable Agent Skills directories and SKILL.md files. Use when a task involves skill frontmatter, progressive disclosure, scripts, references, assets, or host skill locations.
---

# Agent Skills authoring

Follow the [Agent Skills specification](https://agentskills.io/specification). Read [references/SOURCES.md](references/SOURCES.md) and the bundled snapshot at `references/raw/specification.mdx` when exact normative details are needed.

## Required format

1. Make a skill directory containing a file named exactly `SKILL.md`.
2. Begin `SKILL.md` with YAML frontmatter and then Markdown instructions. `name` and `description` are required. `name` must be 1–64 characters, lowercase letters/numbers/hyphens only, with no leading/trailing hyphen or consecutive hyphens, and must match the parent directory. `description` must be non-empty and no longer than 1024 characters; say what the skill does and when to use it.
3. Use optional `license`, `compatibility`, `metadata` (string-to-string map), and experimental `allowed-tools` only when appropriate and valid. Keep the body actionable, scoped, and free of host-specific assumptions unless compatibility requires them.

## Progressive disclosure and resources

Keep frontmatter discoverable and the activated `SKILL.md` concise (under 500 lines; under 5000 tokens is recommended). Put detailed, focused material in optional `references/`, executable helpers in `scripts/`, and templates or static files in `assets/`. Load resources only when the task needs them. Link to resources with relative paths from the skill root and keep reference chains one level deep.

## Host location is not format

`.github/skills/<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`, and other host-supported locations are discovery locations. They do not create different skill syntaxes or turn a Copilot-specific package into an Agent Skills package. Preserve the official `SKILL.md` contract while adapting only the host wrapper or discovery path that the selected host requires. When a request is ambiguous between a host plugin and a portable skill, ask which format is intended.

## Validate before handoff

Run the official reference validator where available:

```text
skills-ref validate ./path/to/skill
```

Also check that the directory name and frontmatter `name` match, required frontmatter parses, links resolve within the skill, resources are present, and instructions do not claim unsupported host behavior. A host may add stricter checks, but it must not be treated as changing the portable format.
