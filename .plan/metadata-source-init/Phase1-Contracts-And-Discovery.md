# Phase 1 – Contracts and Layer Discovery

## Objective

Define and implement shared contracts/utilities for source normalization and layer discovery so both CLI and extension can reuse identical behavior.

## Deliverables

- New shared utility module(s) in engine package for:
  - Source mode typing (`existing`, `url`, `empty`)
  - URL-to-repo-name normalization
  - Deterministic `.github`-based layer discovery
  - Optional scaffold template generation data model
- Unit tests for utility behavior and edge cases.
- Short design note in this phase doc documenting discovery rules.

## Discovery Rules (MVP)

1. Input root is the local metadata directory.
2. Traverse recursively for directories named `.github`.
3. For each `.github` found, define layer path as parent directory path relative to metadata root.
4. Normalize separators to POSIX-style for config (`a/b/c`).
5. Sort by:
   1. depth ascending (root-level first), then
   2. lexicographic path ascending.
6. Exclude hidden git internals (`.git/**`) and known transient folders if encountered.
7. If zero layers found:
   - existing/url modes: return actionable warning + fail init unless `--allow-empty-layers` (optional future flag),
   - empty mode: scaffold ensures at least one layer exists.

## Tasks

- [ ] Add shared type definitions for source-aware initialization.
- [ ] Implement `discoverLayersFromGithubDirs(rootPath)` utility.
- [ ] Implement `deriveRepoNameFromUrl(url)` utility.
- [ ] Add helper for default clone location resolution (`.ai/<repoName>`).
- [ ] Add unit tests for Windows path normalization and sorting determinism.

## Acceptance Criteria

- Given a metadata tree with multiple nested `.github` folders, utility returns expected ordered list of layer paths.
- Given common Git URL formats (HTTPS/SSH), repo name derivation is stable.
- Utility functions are pure where possible and do not import `vscode`.

## Risks

- Deep directory trees can cause expensive traversal; consider bounded walk safeguards if needed.
- Ambiguous layer quality (e.g., accidental `.github` folders) may require future include/exclude controls.
