# @metaflow/engine

## 0.4.8

### Patch Changes

- 89bf4bf: Add three-state Agent Plugins v1 disposition, repository-wide conformance reporting, explicit
  migration planning, and standard-first lossless plugin scaffolding while preserving legacy GitHub
  Copilot metadata.
- 1d3e299: Gate repository-wide `.github/copilot-instructions.md` synchronization behind explicit workspace consent, preserve previously managed root files as retained ownership when disabled, and expose migration/retention state through the engine, CLI, and extension.

## 0.4.7

### Patch Changes

- 962404f: Add standards-backed Agent Plugins and Agent Skills authoring guidance, recognize strict Agent Plugins v1 packages, and preserve their format during metadata maintenance. Keep plugin identities distinct from display names and make repository labels and newly initialized repository identities stable.

## 0.4.6

### Patch Changes

- 8be3990: Gate repository-wide `.github/copilot-instructions.md` synchronization behind explicit workspace consent, preserve previously managed root files as retained ownership when disabled, and expose migration/retention state through the engine, CLI, and extension.

## 0.4.5

### Patch Changes

- Canonicalize plugin and marketplace metadata serialization so equivalent manifests produce stable, reviewable JSON output.

## 0.4.4

### Patch Changes

- Exclude marketplace-level README files from MetaFlow capability discovery and metadata loading.

## 0.4.3

### Improved

- Treat plugin manifests as authoritative for capability metadata and support README-backed capability descriptors.
- Improve portable plugin metadata maintenance and capability catalog handling.

## 0.4.2

### Added

- Recognize plugin commands as a first-class artifact type, including provider command paths.

### Fixed

- Preserve nested capability paths during artifact discovery and summary generation.

## 0.4.1

### Fixed

- Normalize the stable changelog after the v0.4.0 promotion.

## 0.4.0

### Patch Changes

- 34bb1fb: Clarify capability-unit documentation requirements and refresh compatible workspace dependencies for beta testing.

### Patch Changes

- 278c58d: Improve prerelease reliability by validating plugin hook script paths, preserving initial empty applies and missing-profile fallbacks, preferring portable relative repository paths, excluding bundled metadata from Git setup prompts, and refreshing dependencies with current security fixes.

### Patch Changes

- 592da89: Apply the configuration and repository-state fixes merged from develop.

### Patch Changes

- 9024dc6: Improve prerelease readiness by keeping capability summaries truthful while loading, preserving disabled repository roots in the Layers view, applying bundled agent-plugin hooks consistently, and clarifying capability authoring documentation structure.

### Patch Changes

- 773f9b9: Improve refresh responsiveness by avoiding redundant Git/network work, coalescing refresh bursts, skipping unchanged synchronization writes, reusing overlay resolution work, and trimming unused extension assets.

### Patch Changes

- 1941a2b: Expose the plugin injection mode for hooks in the user settings schema and make it the default.

### Patch Changes

- Prepare the 0.3.2 prerelease with prerelease branch CI and non-redundant release gating.

### Patch Changes

- Prepare the 0.3.1 prerelease with capability search and plugin metadata maintenance fixes.

### Minor Changes

- 8bbae64: Prepare the 0.3.0 prerelease lane for preview extension publishing.

## 0.1.0

### Minor Changes

- Bump minor versions for engine, CLI, and extension packages.
