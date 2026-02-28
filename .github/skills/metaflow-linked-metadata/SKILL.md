---
name: metaflow-linked-metadata
description: Use this skill when working with MetaFlow-based metadata, linked metadata repositories, and promotion of local AI metadata into reusable capabilities without leaking project-specific details.
---

# MetaFlow Linked Metadata

## Purpose

Use this skill to help an agent safely work with MetaFlow metadata in repositories that consume one or more linked metadata repos.

Primary goals:
- Understand the active MetaFlow config and linked metadata repo topology.
- Move or promote local metadata into capability layers in linked repos.
- Generalize promoted content so it is reusable across projects.
- Prevent accidental leakage of local project details into shared metadata.

## When To Use

Use this skill when tasks include:
- "Promote `.github/*` metadata into linked MetaFlow repo capabilities"
- "Create or refactor capability layers in linked metadata repositories"
- "Convert local agent/instruction/prompt/skill content into reusable shared metadata"
- "Add or enable new layer sources in `.metaflow/config.jsonc`"

## Core Workflow

### 1. Discover MetaFlow topology

1. Read `.metaflow/config.jsonc` in the working repo.
2. Identify:
- `metadataRepos[*].localPath`
- enabled `layerSources[*]`
- ordered `layers[]`
3. Confirm which linked repo should receive the promoted capability.

If the global `metaflow` command is unavailable, use the workspace CLI entry:
- `node packages/cli/out/src/cli.js status --workspace .`

### 2. Inventory candidate local metadata

Collect local files to evaluate for promotion:
- `.github/instructions/**/*.instructions.md`
- `.github/prompts/**/*.prompt.md`
- `.github/agents/**/*.agent.md`
- `.github/skills/**/SKILL.md` and skill assets

For each candidate, classify:
- `keep-local`: tied to this repository only
- `promote-as-is`: already generic
- `promote-after-generalization`: useful but contains local coupling

### 3. Generalize before promotion

Before promoting, remove repository-coupled details:
- Hard-coded absolute local paths
- Project-only branch names, folder names, issue IDs, private URLs
- Product-specific assumptions that should be parameters
- Environment specifics that do not apply to most consumers

Generalization patterns:
- Replace concrete names with placeholders and examples.
- Move policy to principles; keep project specifics as optional examples.
- Keep file paths repo-relative and portable.
- Prefer capability-scoped language over single-repo language.

Use `assets/promotion-readiness-checklist.md` as a hard gate.

### 4. Create or update capability in linked repo

In the linked metadata repository:
1. Create capability folder: `capabilities/<capability-name>/.github/`
2. Add appropriate subfolders (`instructions`, `prompts`, `agents`, `skills`).
3. Copy generalized metadata into capability structure.
4. Ensure every skill has valid frontmatter:
- `name`: kebab-case, matches folder intent
- `description`: explicit "Use this skill when ..." trigger language

Use `assets/capability-promotion-template.md` for planning and review notes.

### 5. Wire consumption in local repo

Update local `.metaflow/config.jsonc`:
- Add capability path to `layers[]` in intended order.
- Add `layerSources[]` entry for linked repo with `enabled: true`.

Then validate with status/apply:
- `node packages/cli/out/src/cli.js status --workspace .`
- `node packages/cli/out/src/cli.js apply --workspace .` (only when requested)

### 6. Verify and report

Report outcomes with:
- Files promoted and their new capability paths
- Generalization changes made
- Any intentionally retained local specifics and why
- MetaFlow status evidence after wiring

## Safety Rules

- Do not auto-push or auto-open PRs unless explicitly requested.
- Do not overwrite drifted local files silently.
- Do not promote secrets, internal hostnames, credentials, or user-specific paths.
- Do not assume local metadata should be copied verbatim; generalize first.

## Promotion Quality Bar

Promotion is complete only when all are true:
1. Capability content is reusable by unrelated repositories.
2. No unnecessary local details leaked.
3. Linked layer is enabled and visible in MetaFlow status.
4. Structure matches metadata conventions for instructions/prompts/agents/skills.
5. A clear summary maps source files to promoted destination files.
