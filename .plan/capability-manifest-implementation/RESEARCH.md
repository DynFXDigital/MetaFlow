# External Research Notes

## Purpose

Capture external references used to define a practical, forward-compatible validation rule set for `CAPABILITY.md`.

## Sources

1. GitHub Docs: Adding repository custom instructions for GitHub Copilot  
   URL: `https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions`
2. GitHub Docs: Support for different types of custom instructions  
   URL: `https://docs.github.com/en/copilot/reference/custom-instructions-support`
3. SPDX License List  
   URL: `https://spdx.org/licenses/`
4. AGENTS.md reference repository (format context)  
   URL: `https://github.com/agentsmd/agents.md`

## Key Findings

1. GitHub currently standardizes frontmatter strongly for path-specific instructions (`applyTo`, optional `excludeAgent`), but there is no published standard for capability manifests.
2. GitHub support matrices confirm instruction/agent files are recognized artifacts, while capability metadata files are not yet first-class in Copilot platform behavior.
3. SPDX provides the canonical identifier set and tracks deprecated identifiers; this is suitable as validation source for `license` in a manifest schema.
4. AGENTS.md model reinforces the value of predictable file names and lightweight, human-readable metadata contracts.

## Implications for MetaFlow

1. Define `CAPABILITY.md` as a MetaFlow-native convention now, independent of current Copilot file-type support.
2. Keep schema minimal and stable (`name`, `description`, optional `license`) to avoid lock-in before ecosystem convergence.
3. Validate `license` against SPDX data with warning-level diagnostics for invalid/deprecated values.
4. Preserve forward compatibility by warning (not failing) on unknown fields.

## Proposed Validation Baseline

1. Required: `name`, `description`.
2. Optional: `license`.
3. `license` accepted forms:
   - SPDX identifier (preferred), e.g. `MIT`, `Apache-2.0`.
   - SPDX expression (optional support), e.g. `MIT OR Apache-2.0`.
   - Fallback token: `SEE-LICENSE-IN-REPO`.
4. Malformed frontmatter and invalid values produce warnings.
