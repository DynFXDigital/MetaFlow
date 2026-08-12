---
description: Guidelines for authoring README.md package descriptors in MetaFlow metadata repositories.
applyTo: 'README.md,CAPABILITY.md'
---

# MetaFlow Package README Descriptors

`README.md` is the preferred human-facing descriptor at the root of a configured metadata package.
It explains what people can use and trust in the package; component files define agent behavior.

## Front matter guidance

- Keep front matter present and valid YAML.
- README front matter is optional and should normally be omitted for agent-plugin packages.
- Put plugin identity and runtime metadata in `plugin.json`, including `name`, `description`,
  `version`, hosts, license, and component paths.
- Keep README as ordinary human-facing Markdown; do not add GUID/UUID identity fields.

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

- `README.md` owns human-facing documentation body.
- `plugin.json` owns package name, description, runtime component paths, host declarations, and
  plugin-specific metadata.
- `marketplace.json` owns marketplace listing metadata.
- `CAPABILITY.md` is a legacy compatibility descriptor only. Use it when README is absent; its
  legacy `uid` may remain omitted during migration. Do not merge the two files or copy legacy-only
  fields into README front matter.
- When both files exist, README is preferred and the duplicate should be diagnosed.

## Legacy CAPABILITY.md guidance

When maintaining a repository that has not migrated yet, preserve its existing legacy fields and body
until a deliberate migration is made. Treat those fields as compatibility data, not as additions to
the README contract. New packages should create README.md instead.
