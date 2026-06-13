---
description: Guidelines for authoring CAPABILITY.md contracts in MetaFlow metadata repositories.
applyTo: 'CAPABILITY.md'
---

# MetaFlow Capability Contracts

`CAPABILITY.md` defines the contract for a capability under `capabilities/<name>/`.

## Frontmatter guidance

- Keep frontmatter present and valid YAML.
- Include `uid` as a generated immutable UUID for the logical capability identity. Preserve it when moving or renaming a capability; generate a new `uid` only when intentionally forking or copying into a new logical capability.
- Use `previousIds` or `previousPaths` when a published capability id or repo-relative path changes and existing MetaFlow configs need a migration hint.
- Include `name`, `description`, and `license` when the repository convention expects them.
- Write `description` as a single declarative sentence about what the capability offers.
- Use the frontmatter `name` as the user-facing capability title throughout the file.

## Description rules

- Start with the subject matter, workflow, or artifact set the capability contributes.
- Describe the offered guidance, assets, or outcomes directly.
- Keep portability or sharing context in later sections such as `Reuse and Portability`, not in the description.
- Avoid meta-framing prefixes such as `Reusable`, `Shared`, `Bundled`, `This capability`, or `Guidance for`.
- Avoid describing how MetaFlow consumes the capability; describe the capability content itself.

Examples:

- `Planning standards, prompts, and skills support structured execution plans and project issue organization.`
- `GitHub operation defaults and repository ownership guidance keep agent workflows consistent and safe.`

## Contract body guidance

- Set the first heading to `# Capability: <Frontmatter Name>` and keep it identical to the user-facing `name` value instead of falling back to the directory slug.
- Keep the body aligned with the description: mission, scope, non-goals, and ownership boundaries should reinforce the same primary concern.
- Keep the capability orthogonal and avoid claiming adjacent concerns that belong to another capability.
