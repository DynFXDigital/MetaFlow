# Docs Traceability Capability

This capability provides reusable AI metadata for authoring and maintaining traceable documentation artifacts in `doc/`.

## Included

- Instructions for SRS, SDD, TCS, FTD, FTR, use-cases, and validation equivalents.
- Reusable templates for SRS/SDD/TCS/FTD/FTR under `instructions/resources/`.
- `traceability-docs` skill for trace-model workflows.
- Doc-focused prompts and agent profile.

## Compatibility Policy

This package intentionally includes both:

- `test-tcs.instructions.md`
- `ft-tcs.instructions.md`

Both are kept for compatibility across consumers that still reference either convention.

## Notes

- Prompts in this package use YAML frontmatter format.
- This capability is content-only and does not modify `.metaflow/config.jsonc`.
