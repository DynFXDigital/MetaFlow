---
description: "Instructs agents to record lightweight lessons learned (dated + contextual) while working in this repo."
applyTo: ".github/instructions/lessons-learned.instructions.md"
---

# Lessons Learned

Lightweight, append-only operational notes

- Record lessons learned while working (things you would want to remember next time), even if they are not specific to the current task.
- Do not try to categorize or reorganize entries. Append new entries to the bottom in chronological order.
- Include a short context so the note is actionable (area, file, command, config, symptom, etc.).
- Use this format:
  - `(YYYY-MM-DD) Context: Lesson learned.`
- Keep entries concise (aim for 1–3 sentences).
- Prefer durable guidance (repeatable commands, stable paths, non-obvious pitfalls) over transient details.
- Never record secrets, credentials, customer data, private conversation content, or long stack traces/log dumps.

## Maintenance

- If an entry becomes obsolete, append a new entry that supersedes it (do not rewrite history).
- If this section grows beyond ~100 lines, prune by deleting clearly obsolete entries (or collapse multiple entries into one newer entry that preserves the key idea).

## Current Lessons Learned

Append new entries here following the required format.

- (2026-01-06) Example: If a build step requires a specific working directory, record the exact command + cwd so the next run is copy/pasteable.
- (2026-01-06) solaroids-mcp-server IPC client connect: A “timeout” won’t save you if the connection promise never settles (e.g., socket closes during connect). In `solaroids-mcp-server/src/ipc/solaroidsIpcClient.ts`, reject `connect()` on early socket close to avoid indefinite “Working…” hangs.
- (2026-01-06) solaroids-mcp-server harness tools concurrency: Parallel `harness.*` calls can leave Solaroids in deterministic/paused mode even if each call is “correct” in isolation. Serialize all harness-affecting tools with a single async mutex, and define lock ordering (acquire harness mutex before any `screen.snapshot` mutex) to avoid deadlocks.
- (2026-01-06) universal_client Playwright + RN-web modals: If a modal “looks” on top but clicks are intercepted, an underlying modal may still be mounted; hide the underlying modal (or set `pointerEvents="none"`) while the top modal is open.
- (2026-01-06) universal_client Playwright reuse-server runs: When `PLAYWRIGHT_REUSE_SERVER=1`, avoid pre-test port-killers on the same port or you’ll terminate the server you meant to reuse; prefer reusing an already-running server on the configured `PLAYWRIGHT_DEV_SERVER_PORT`.
- (2026-01-06) universal_client UI packaging: If UI fixes in `packages/ui/src` don’t affect the running web app, confirm whether it’s consuming `packages/ui/dist` artifacts; ensure the build/packaging step updates dist before validating with e2e.
- (2026-01-08) universal_client Playwright webServer port mismatch: Keep `apps/web/playwright.config.ts` and `apps/web/scripts/playwright_webserver.mjs` default ports aligned; mismatches can start a 2nd Next dev server and trigger Windows `.next/dev` cleanup failures.
- (2026-01-08) PowerShell scripting: Avoid `$pid` as a loop variable (collides with read-only `$PID`); use `$procId` or similar when iterating process IDs.
- (2026-01-08) universal_client Vitest transform errors: After refactors, watch for orphaned/partial `export ...` lines (e.g., a removed helper leaving `export function ...` without a body). This can surface as “Unexpected export” and break multiple suites until the module parses cleanly.
- (2026-01-08) universal_client project polling: If you need to poll `/api/projects/:id` for UI updates, add a `touch=0` option so polling doesn’t churn `lastOpenedAt` (and write the manifest) every second.
- (2026-01-07) universal_client Docker persistence: Server-side project/plugin data lives under `AI_EDITOR_DATA_DIR` (defaults to `.ai-editor-data`); mount a volume (e.g. `ai_editor_data:/data`) and set `AI_EDITOR_DATA_DIR=/data` to survive container rebuilds.
- (2026-01-07) universal_client server-backed settings: Migrate AppSettings persistence off browser localStorage to `/api/settings` backed by `AI_EDITOR_DATA_DIR/settings.json` so settings survive Docker updates and don’t “reset” when the site origin changes.
- (2026-01-07) Mermaid diagrams in Markdown: Always include the shared `%%{init: ... themeCSS ...}%%` snippet from `.github/instructions/mermaid.instructions.md` or diagrams will be unreadable in dark mode.
- (2026-01-08) universal_client Playwright + Next.js dev tools overlay: CSS injected via `page.addStyleTag` does not persist across full navigations; re-apply it after `page.waitForURL()` (or navigate via asserted `href` + `page.goto`) to avoid clicks getting intercepted.
- (2026-01-10) universal_client agent tools on Windows: Some `grep_search` globs are fully excluded unless `includeIgnoredFiles=true`, and `apply_patch` expects absolute `c:\...` paths.
