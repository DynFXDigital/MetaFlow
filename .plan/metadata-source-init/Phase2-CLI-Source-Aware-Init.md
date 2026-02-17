# Phase 2 – CLI Source-Aware Init

## Objective

Extend CLI `init` to support interactive or flag-driven source selection and generate validated config from discovered/scaffolded inputs.

## CLI UX (MVP)

### Interactive flow (no source flags)

1. Prompt for source mode: `existing`, `url`, `empty`.
2. Collect mode-specific input:
   - existing: local directory path
   - url: repo URL and optional clone path
   - empty: target local directory path
3. Perform source actions (discover / clone+discover / scaffold+discover).
4. Preview resolved `metadataRepo.localPath` and `layers` count.
5. Write `.metaflow.json` (respect `--force`).

### Non-interactive flags

- `--from-dir <path>`
- `--from-url <gitUrl>`
- `--new-dir <path>`
- `--clone-to <path>` (URL mode override)
- `--force` (existing behavior)

Only one of `--from-dir`, `--from-url`, `--new-dir` may be specified.

## Tasks

- [ ] Refactor CLI init command to orchestrate source mode handling.
- [ ] Add argument validation and mutual exclusivity checks.
- [ ] Implement URL clone operation with safe error handling.
- [ ] Integrate shared layer discovery utility from Phase 1.
- [ ] Generate config with existing defaults for filters/profiles/injection.
- [ ] Add CLI tests for each mode and failure path.

## Acceptance Criteria

- CLI initializes from existing dir when layers are discoverable.
- CLI clones URL source to default `.ai/<repoName>` when `--clone-to` not provided.
- CLI scaffold mode creates sample structure and outputs at least one layer.
- Invalid combinations (e.g., two source flags) fail with clear message and non-zero exit.
- Existing `init --force` overwrite behavior remains intact.

## Risks

- Prompting library choice and terminal compatibility (Windows shells) may affect UX quality.
- `git` command failures must preserve partial-state safety (no invalid config written).
