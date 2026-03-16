---
description: Guidance for authoring MetaFlow configuration files.
applyTo: '.metaflow/**/*.json,.metaflow/**/*.jsonc'
---

# MetaFlow Configuration Files

When editing MetaFlow config files, keep changes stable and workspace-portable.

- Prefer updating `.metaflow/config.jsonc` unless a task explicitly requires another config file.
- Keep JSONC valid: allow comments/trailing commas only where JSONC parsers support them.
- Prefer portable paths and avoid copying user-specific absolute paths into reusable examples or shared metadata.
- If a checked-in repository config intentionally uses an absolute `metadataRepos[*].localPath`, document that expectation with a short comment or setup note instead of pretending the path is portable.
- Prefer the public v1 authoring model: declare sources under `metadataRepos[*]` and enable specific capability paths via `metadataRepos[*].capabilities`.
- Treat each enabled capability path as a narrow, reusable layer to reduce overlap and drift.
- Use `layerSources` or top-level `layers` only when maintaining legacy compatibility; do not introduce them as the default shape for new configs.
- Keep `activeProfile` aligned with a real profile name in the config.
- Preserve stable repo IDs, capability paths, and profile names to avoid accidental behavior shifts.
- Keep per-artifact `injection` settings intentional and aligned with how the repository consumes instructions, prompts, skills, agents, and hooks.
- Document non-obvious toggles with short comments directly in the JSONC file.

Validation checklist:

- Confirm `.metaflow/config.jsonc` parses without errors.
- Verify every path in `metadataRepos[*].localPath` exists or is intentionally provisioned later.
- Verify each enabled `metadataRepos[*].capabilities[*].path` resolves to an intended capability.
- Verify any remaining `layers` or `layerSources` entries are present only for compatibility and not because the new config was authored against a legacy model.
- Re-run MetaFlow status/refresh after edits and check for warnings.
