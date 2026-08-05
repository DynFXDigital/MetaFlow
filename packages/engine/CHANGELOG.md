# @metaflow/engine

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
