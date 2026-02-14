---
description: 'Guidelines for AI-created temporary helper artifacts (scripts, scratch tests, data) stored under .ai/temp/.'
applyTo: '.ai/temp/**'
---

# AI Temporary Artifacts (.ai/temp/)

Concise rules for where and how the AI (and contributors using AI assistance) may create short-lived helper assets (scripts, throwaway tests, exploratory data) needed to complete a task without polluting the permanent codebase.

## 1. Purpose
- Provide an isolated, disposable workspace.
- Accelerate experimentation (quick scripts, prototype transforms, coverage probes, parsing helpers, one-off diff analyzers, smoke test harnesses).
- Prevent accidental inclusion of unreviewed or low‑signal artifacts in commits / PRs.

## 2. Directory Layout
All ephemeral items go ONLY under `.ai/temp/` (git‑ignored).
Recommended optional subfolders (create on demand):
```
.ai/temp/
	scripts/        # One-off automation (TypeScript/Node, Bash, awk, etc.)
	tests/          # Scratch / provisional test code (not part of official suites)
	data/           # Small sample inputs (sanitized)
	logs/           # Generated logs / traces from debug runs
	analysis/       # Interim reports, metrics, coverage extracts
```
Do NOT create peer directories directly under `.ai/` unless they are part of the persistent planning system (`tasks/`, `issues/`, `devnotes/`).

## 3. Naming Conventions
Pattern: `<purpose>__<yyyyMMdd-HHmmss>[__tag].<ext>`
Examples:
- `deadband_probe__20250920-143210.ts`
- `mv_edge_case_gen__20250920-151000__v2.cpp`
- `proto_cov_scan__20250920-153322.sh`

## 4. Lifetime & Cleanup
- Treat everything here as disposable. Delete when no longer needed.
- Before opening / finalizing a PR: remove stale artifacts or *promote* useful ones (see §8).
- The AI may self‑clean directories older than ~7 days if safe (heuristic: no recent mtime, not referenced elsewhere).

## 5. Content & Size Limits
- Individual file ≤ 100 KB (soft). Prefer text; compress only if necessary.
- Total directory footprint should stay < 5 MB; prune early.
- No large binaries, media, core dumps, packet captures, or proprietary third‑party blobs.

## 6. Security & Compliance
- Never place secrets, credentials, access tokens, customer / sensitive data.
- Sanitize sample inputs (no real IPs, hostnames, PII).
- No license‑restricted third‑party code unless already approved and destined for promotion.

## 7. Execution Rules
- Scripts here are experimental; they MUST NOT be invoked from production build scripts, CMake, or committed test harnesses.
- If executing, prefer explicit absolute paths (avoid accidental PATH injection): `node .ai/temp/scripts/deadband_probe__...js`.
- Do not rely on these artifacts for deterministic CI outcomes.

## 8. Promotion Checklist (temp → repository)
If an artifact proves valuable:
1. Relocate to an appropriate permanent directory (`build-support/`, `tools/`, `mms-server/src/.../test/`, etc.).
2. Add documentation / inline comments.
3. Add unit / integration tests if applicable.
4. Conform to coding standards & formatting.
5. Remove old temp copy.
6. Reference related task / issue in commit message.

## 9. Test Artifacts
- Scratch tests under `.ai/temp/tests/` MUST NOT share target names with real tests.
- To promote: integrate into the proper test subtree and update `CMakeLists.txt` + coverage goals.

## 10. Logs & Diagnostics
- Keep only high‑signal excerpts (trim long traces).
- Redact IPs, MACs, serial numbers, or proprietary enumerations.

## 11. Tooling Expectations for AI
When AI needs a helper script:
- Create inside `.ai/temp/scripts/` with clear header comment (purpose, author = AI, timestamp).
- Prefer portable Bash / Node.js scripts; avoid adding new dependencies unless justified.
- Delete after use if no longer needed in subsequent steps.

## 12. Git & CI Interaction
- `.ai/temp/` is git‑ignored (see root `.gitignore`). Nothing inside should appear in diffs.
- CI / coverage / static analysis MUST ignore this directory.

## 13. Prohibited Items
- Compiled binaries (except transient locally executed ones not committed).
- Large dataset derivatives.
- Sensitive configs or credential templates.
- Symlinks pointing outside the repo.

## 14. Minimal Header Template
Each created script should start with:
```
# TEMP HELPER (UNCOMMITTED)
# Purpose: <one-line>
# Created: <UTC yyyy-MM-dd HH:mm:ss>
# Related: <task/issue id or n/a>
# Promotion: Remove this header upon promotion and follow §8.
```

## 15. Monitoring
Automations may:
- List files > 7 days old and suggest cleanup.
- Warn if total size > threshold.
- Block promotion if header still contains `TEMP HELPER` marker.

## 16. Rationale (Brief)
Centralizing ephemeral assets reduces review noise and risk while enabling rapid, tool‑assisted problem solving.

## 17. Summary (Enforceable Rules)
- All temp artifacts: `.ai/temp/` only.
- Never commit contents of `.ai/temp/`.
- No secrets / sensitive data / large binaries.
- Promote valuable items promptly using §8.
- Keep directory small and periodically cleaned.
