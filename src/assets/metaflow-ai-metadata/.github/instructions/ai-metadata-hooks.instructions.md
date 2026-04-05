---
description: 'Guidelines for GitHub Copilot hooks configuration files stored in .github/hooks.'
applyTo: '.github/hooks/*.json'
---

# Copilot Hooks

Hooks let GitHub Copilot CLI, Copilot coding agent, and VS Code agent mode run custom shell commands at key points during agent execution.

## Sources and versioning
- Last reviewed: 2026-03-26
- Sources:
  - https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks
  - https://docs.github.com/en/copilot/how-tos/copilot-cli/use-hooks
  - https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks
  - https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks
  - https://docs.github.com/en/copilot/reference/hooks-configuration
  - https://code.visualstudio.com/docs/copilot/customization/hooks

## Scope
- Hook configuration files belong directly under `.github/hooks/*.json`.
- Supporting scripts and assets can live in subdirectories such as `.github/hooks/scripts/` and `.github/hooks/logs/`.
- Copilot coding agent uses hooks from the repository default branch; Copilot CLI loads hooks from the current working directory.

## Required structure
- The config must be valid JSON and include `version: 1` (required for Copilot CLI and Copilot coding agent; not required for VS Code).
- The portability baseline CLI/coding-agent format:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [],
    "sessionEnd": [],
    "userPromptSubmitted": [],
    "preToolUse": [],
    "postToolUse": [],
    "errorOccurred": []
  }
}
```

- VS Code uses PascalCase event names and supports eight events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`. VS Code parses the CLI camelCase format automatically, converting event names and mapping `bash` → `linux`/`osx`, `powershell` → `windows`. Use native PascalCase and `command`/`windows`/`linux`/`osx` properties for cross-environment hook files.
- GitHub's hooks concepts documentation also describes `agentStop` and `subagentStop` lifecycle hooks. Use them only after confirming support in the target runtime; current how-to and reference templates still emphasize the six-event baseline above.

- Each hook entry is an object with:
  - `type`: `command`
  - `command`: default cross-platform command
  - `bash` and/or `powershell`: shell command
  - `windows`, `linux`, `osx`: OS-specific command overrides
  - `cwd`: working directory (optional)
  - `env`: environment variables (optional)
  - `timeout`: timeout in seconds (VS Code; default is 30)
  - `timeoutSec`: timeout in seconds (Copilot CLI format; default is 30)

## Hook behavior
- Hooks receive JSON input on stdin.
- Hooks run synchronously and block agent execution; keep them fast and deterministic, and aim to stay under 5 seconds when practical.
- Copilot CLI / coding agent: `preToolUse` is the only hook that can block execution. Return `{"permissionDecision":"deny","permissionDecisionReason":"<reason>"}`. Only `deny` is processed; `allow` and `ask` are not.
- VS Code `PreToolUse`: supports `allow`, `deny`, and `ask` via `hookSpecificOutput`. Exit code 2 blocks processing on any event; other non-zero exit codes show a non-blocking warning.
- VS Code richer output: `Stop` and `SubagentStop` can return `{"decision":"block","reason":"..."}` to prevent the agent from stopping. `SessionStart`, `SubagentStart`, and `PostToolUse` can inject `additionalContext` via `hookSpecificOutput`.
- Copilot CLI / coding agent: hooks other than `preToolUse` ignore output. Do not rely on modifying prompts or tool results in the CLI context.

## Script guidance
- Ensure scripts are executable and have a valid shebang when using Bash.
- Output JSON must be on a single line; use `jq -c` or `ConvertTo-Json -Compress`.
- Parse `toolArgs` as JSON (it is a JSON string).
- Validate and sanitize untrusted input before acting on it.
- Redact secrets and sensitive prompt/tool data before logging.
- Prefer local ignored logs or controlled observability sinks; do not commit local audit logs.
- Avoid external network calls unless they are necessary and failure-tolerant.
- Increase `timeoutSec` only when necessary; keep hooks fast and deterministic.

## Rollout guidance
- Start with logging-only hooks before adding deny rules.
- Keep deny rules narrow, documented, and aligned with stakeholder-approved policies.
- When different teams need different guardrails, prefer separate repository hook configs over ad-hoc local bypasses.

## Testing and troubleshooting
- Validate JSON with `jq .` (or `ConvertFrom-Json`) before committing.
- Test scripts by piping representative JSON input into them and validating their output.
- Debug locally by piping sample input into the script and validating output JSON.
- If hooks do not run, confirm the file is in `.github/hooks/`, has `version: 1`, and is on the default branch for coding agent runs or in the current working directory for CLI runs.