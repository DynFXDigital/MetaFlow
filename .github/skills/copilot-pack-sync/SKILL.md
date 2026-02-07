---
name: copilot-pack-sync
description: Use this skill to bootstrap, apply, watch, status-check, and promote the shared Copilot Pack (.ai/ai-metadata <-> .github) using sync-ai-metadata.
---

# Copilot Pack Sync

## Purpose

This skill standardizes the workflow for managing shared Copilot artifacts across repositories.

- Canonical local clone: `.ai/ai-metadata/` (git clone of the shared Common Pack)
- Consumption surface: `.github/` (what Copilot reads)
- Sync is bidirectional locally (Common Pack working tree <-> repo `.github/`)
- Upstream promotion is explicit (branch/commit/PR from `.ai/ai-metadata/`)

## Safety Rules

- Never auto-push or auto-open PRs.
- Never clobber repo-local `.github/*` edits that diverged from last applied state.
- Always record last-applied hashes under `.ai/.sync-state/managed_files.json`.

## Commands

### Bootstrap

Clones (or updates) the Common Pack into `.ai/ai-metadata/`.

- Run: `sync-ai-metadata bootstrap`

### Apply

Materializes `.ai/ai-metadata/.github/**` into `.github/**`.

- Run: `sync-ai-metadata apply`

Expected behavior (composition):

- Creates new files from common even if they’re not ignored.
- Updates/deletes only when safe (matches managed-state), unless the path is ignored by git (explicit opt-in).
- Uses `.ai-sync.json` (repo-local) to select hierarchy layers and `standards` bundles.

### Status

Reports drift between `.ai/ai-metadata/.github/**`, `.github/**`, and the managed-state stamp.

- Run: `sync-ai-metadata status`

### Watch

Starts bidirectional sync between `.ai/ai-metadata/.github/**` and `.github/**`.

- Run: `sync-ai-metadata watch`

Notes:

- Watch is recursive over `.github/**`.
- Watch ignores `.ai/ai-metadata/.git/**` and `.ai/.sync-state/**`.

### Promote

Creates a new branch and commit inside `.ai/ai-metadata/` to prepare a PR upstream.

- Run: `sync-ai-metadata promote -m "<commit message>"`

## Recommended Resolution Playbook (Conflicts)

If `apply` or `watch` reports a protected conflict:

1. If the repo-local file should win, keep it and consider manually merging the common change.
2. If the common version should win, remove the repo-local file and rerun `apply`.
3. If you want common to manage a tracked file automatically, add an explicit `.gitignore` rule for that path (opt-in overwrite/delete).
