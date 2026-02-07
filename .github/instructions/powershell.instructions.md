---
description: Guidance for running long-lived commands safely in PowerShell within VS Code agent shells.
applyTo: '**/*'
---

# PowerShell Execution Guidance

Agent shells can stall when legacy stream redirection (e.g., `2>&1`) is combined with non-interactive pipelines. Use the patterns below to avoid deadlocks and truncated output.

## Safe Patterns
- Stream + log: prefer `Tee-Object`
  - Example: `pnpm run build *>&1 | Tee-Object build.log`
- Stream to console without merging:
  - Example: `pnpm run build 2>&1 | Out-Host`
- Bounded output (avoid UI floods):
  - Example: `pnpm run build | Out-String -Width 4096 | Select-Object -Last 200`
- CI buffering hint:
  - Example: `$env:CI = "true"; pnpm run build`
- Bypass PowerShell parsing entirely (last resort):
  - Example: `cmd /c "pnpm run build 2>&1"`
  - Example: `pwsh -c "pnpm run build 2>&1"`

## Notes
- Use `*>` to normalize all streams when teeing to a file.
- Prefer pipelines over raw `2>&1` merges for long-running builds.
- For `pnpm`, consider `--silent`, `--stream`, or workspace `scriptShell` / `shellEmulator` to reduce shell quirks.

## Practical Examples
- Full log + stream:
  - `pnpm run build *>&1 | Tee-Object build.log`
  - `pnpm test *>&1 | Tee-Object test.log`
- Stream-only, no file:
  - `pnpm run build 2>&1 | Out-Host`
- Bounded console output:
  - `pnpm run build | Out-String -Width 4096 | Select-Object -Last 200`

Maintain concise logs and avoid agent stalls by favoring `Tee-Object` and `Out-Host` over legacy redirection during long builds/tests. Avoid `Select-Object -Last N` on merged streams; prefer `Tee-Object` plus manual tailing of the log when needed.