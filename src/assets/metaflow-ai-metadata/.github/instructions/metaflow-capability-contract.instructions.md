---
description: Guidelines for authoring CAPABILITY.md contracts in MetaFlow metadata repositories.
applyTo: 'CAPABILITY.md'
---

# MetaFlow Capability Contracts

`CAPABILITY.md` defines the contract for a capability under `capabilities/<name>/`.

## Frontmatter guidance

- Keep frontmatter present and valid YAML.
- Include `name`, `description`, and `license` when the repository convention expects them.
- Write `description` as a single declarative sentence about what the capability offers.

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

- Keep the body aligned with the description: mission, scope, non-goals, and ownership boundaries should reinforce the same primary concern.
- Keep the capability orthogonal and avoid claiming adjacent concerns that belong to another capability.
