---
description: "Permits AI agents to maintain a concise sticky-notes scratchpad for recurring operational hints."
applyTo: "**/*"
---

# Sticky Notes

Scratchpad Guidance

- Log lightweight, high-signal reminders directly in THIS instructions file (section: Current Sticky Notes). Do not create additional scratch files.
- Capture actionable repo guidance (e.g., required working directories, env toggles, known traps) that prevents repeated mistakes.
- Format each note as `- (YYYY-MM-DD) <topic>: <hint>`; keep hints under ~150 characters and omit sensitive data.
- Before appending, skim existing bullets to avoid duplicates; update or strike through stale guidance instead of deleting it.
- Never record secrets, customer information, stack traces, or anything traceable to private conversations.
- Keep the file lightweight—prefer summary bullets, and prune obsolete entries when better documentation exists elsewhere.

## Maintenance

- When a note becomes obsolete, either remove it (if clearly superseded) or append "(retired YYYY-MM-DD)" to preserve historical context briefly.
- If the section grows beyond ~50 lines, prune or consolidate.

## Current Sticky Notes

Append new bullets here following the required format.

- (2025-09-25) CTest location: Run ctest inside `build-component/` or pass `--test-dir build-component` when elsewhere.
- (2025-09-25) Bullseye error2: remove `build-component/bullseye-coverage.cov`, clean + rebuild with coverage, then re-run tests for matching fileId.
- (2025-11-23) CSharpVersion: Solaroids FNA projects compile with max C# 7.3—avoid ??=, switch expressions, and other newer syntax.
- (2025-12-03) PS Redirection: Prefer `| Out-String -Width 4096 | Select-Object -Last 100` or `| Tee-Object build.log` over `2>&1` to avoid agent stalls and truncation.
- (2025-12-08) Playwright port: universal_client uses port 3002 to avoid conflicts with Open WebUI on 3000.
- (2026-01-05) Web dev port: if 3002 is held by wslrelay, use 3004 (updated tasks + restart script default).
- (2025-12-08) Playwright modes: `--headed` shows browser (~12s), headless is faster (~9s). Use `--project=chromium` to skip Firefox/WebKit.
- (2025-12-14) pnpm args: Prefer dedicated scripts (e.g. `dev:3002`) over passing flags via `pnpm ... -- -p` in tasks; pnpm can treat flags as dirs.
- (2025-12-14) Dev port cleanup: VS Code task uses `scripts/free_port.ps1` to free 3002 safely; avoids brittle inline `-Command` quoting and `$PID` collisions.
- (2025-12-14) Web restart: Use `Start/Restart Universal Web (Background)` for normal dev; use `Start/Restart Universal Web` to watch logs.
