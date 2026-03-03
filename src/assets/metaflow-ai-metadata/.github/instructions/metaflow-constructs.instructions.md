---
description: Guidance for authoring MetaFlow configuration files.
applyTo: ".metaflow/**/*.json,.metaflow/**/*.jsonc"
---

# MetaFlow Configuration Files

When editing MetaFlow config files, keep changes deterministic and workspace-portable.

- Prefer updating `.metaflow/config.jsonc` unless a task explicitly requires another config file.
- Keep JSONC valid: allow comments/trailing commas only where JSONC parsers support them.
- Use repository-relative paths and avoid user-specific absolute paths.
- Treat `layers` order as precedence: later entries win for overlapping outputs.
- Keep each layer purpose narrow to reduce overlap and drift.
- Enable only required `layerSources`; disable stale or unused sources.
- Keep `activeProfile` aligned with a real profile name in the config.
- Preserve stable IDs/names for layers and profiles to avoid accidental behavior shifts.
- Document non-obvious toggles with short comments directly in the JSONC file.

Validation checklist:

- Confirm `.metaflow/config.jsonc` parses without errors.
- Verify every path in `metadataRepos[*].localPath` exists or is intentionally provisioned later.
- Verify each entry in `layers[]` resolves to an intended source and capability path.
- Re-run MetaFlow status/refresh after edits and check for warnings.
