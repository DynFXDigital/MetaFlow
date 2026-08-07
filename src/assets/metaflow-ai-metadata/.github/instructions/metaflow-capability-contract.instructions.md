---
description: Guidelines for authoring README.md package descriptors in MetaFlow metadata repositories.
applyTo: 'README.md,CAPABILITY.md'
---

# MetaFlow Package README Descriptors

`README.md` is the preferred human-facing descriptor at the root of a configured metadata package.
It explains what people can use and trust in the package; component files define agent behavior.

## Front matter guidance

- Keep front matter present and valid YAML.
- Required fields are `name`, `description`, and a valid publisher-assigned UUID `id`.
- Do not add MetaFlow namespaces, lifecycle fields, plugin flags, aliases, host compatibility fields,
  or schema markers to the portable README contract.
- Write `description` as a single declarative sentence about what the package offers.
- Preserve a publisher-assigned `id` when moving or renaming a package; generate a new one only when
  intentionally forking or copying it.

## README body guidance

- Document purpose, when to use the package, included components, activation, trust considerations,
  compatibility, and links to further documentation when those topics are useful.
- Use free-form Markdown. These topics are recommendations, not required headings.
- Keep detailed operational constraints and procedures in the appropriate skills, agents, instructions,
  prompts, hooks, and reference files.
- The README body is documentation, not an instruction-execution surface.
- Keep detailed behavior in component files instead of duplicating it in prose.
- Start with the package's subject matter, workflow, or artifact set rather than meta-framing such as
  `Reusable`, `Shared`, `Bundled`, or `Guidance for`.

## Authority and compatibility

- `README.md` owns human-facing package name, description, required publisher-assigned UUID `id`,
  and documentation body.
- `plugin.json` owns runtime component paths, host declarations, and plugin-specific metadata.
- `marketplace.json` owns marketplace listing metadata.
- `CAPABILITY.md` is a legacy compatibility descriptor only. Use it when README is absent; its
  legacy `uid` may remain omitted during migration. Do not merge the two files or copy legacy-only
  fields into README front matter.
- When both files exist, README is preferred and the duplicate should be diagnosed.

## Legacy CAPABILITY.md guidance

When maintaining a repository that has not migrated yet, preserve its existing legacy fields and body
until a deliberate migration is made. Treat those fields as compatibility data, not as additions to
the README contract. New packages should create README.md instead.
