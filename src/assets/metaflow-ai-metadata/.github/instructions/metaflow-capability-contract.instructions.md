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

## Non-Goals guidance

- Treat `Non-Goals` as a boundary-setting section inside the capability's natural problem space, not as a generic disclaimer list.
- Keep `Non-Goals` focused on plausible adjacent responsibilities a reasonable user might expect this capability to cover.
- Prefer boundaries within the same tool, workflow family, or problem area.
- Do not pad the section with unrelated exclusions or points that are already obvious from the capability name.
- Keep the list short: usually 2 to 4 bullets.
- Use plain language.
- If you name another capability, workflow, or local policy, do it only when users might realistically confuse the ownership boundary.

Ask before finalizing the section:

1. What would a reasonable user assume this capability might include?
2. Which of those plausible expectations are intentionally out of scope?
3. Does each bullet clarify a real boundary instead of stating the obvious?

Good pattern:

> Someone might reasonably expect this capability to do this, but it intentionally does not.

Bad pattern:

> This capability does not do random unrelated things.
