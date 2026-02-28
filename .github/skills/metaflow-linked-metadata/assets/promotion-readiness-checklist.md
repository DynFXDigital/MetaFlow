# Promotion Readiness Checklist

Use this checklist before promoting local metadata into a shared MetaFlow capability.

## Reuse and Scope

- [ ] The promoted content solves a reusable problem, not a one-off project issue.
- [ ] Repository-specific assumptions are removed or made optional.
- [ ] Language is capability-level, not tied to one codebase.

## Local Detail Leak Prevention

- [ ] No absolute local paths (for example `C:\\Users\\...`).
- [ ] No private/internal URLs, hostnames, or environment names.
- [ ] No credentials, tokens, or secret-like values.
- [ ] No local issue IDs or branch names unless intentionally generic.
- [ ] Product-specific identifiers are parameterized or moved to examples.

## Metadata Quality

- [ ] File names and locations match metadata conventions.
- [ ] Frontmatter is valid YAML and includes required keys.
- [ ] Skill descriptions include explicit trigger wording ("Use this skill when ...").
- [ ] Prompt inputs are explicit where variability is expected.

## MetaFlow Wiring

- [ ] New capability path exists in linked metadata repo under `capabilities/<name>/.github/`.
- [ ] Local `.metaflow/config.jsonc` includes the capability in `layers[]`.
- [ ] Local `.metaflow/config.jsonc` has enabled `layerSources[]` entry.
- [ ] `node packages/cli/out/src/cli.js status --workspace .` shows expected layer.

## Promotion Notes

- [ ] Source-to-destination mapping is documented.
- [ ] Generalization edits are documented.
- [ ] Any deliberate local coupling is explicitly justified.
