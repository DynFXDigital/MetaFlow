---
description: 'Guidelines for GitHub Copilot hooks configuration files stored in .github/hooks.'
applyTo: '.github/hooks/*.json'
---

# Copilot Hooks

Hooks let GitHub Copilot CLI, Copilot coding agent, and VS Code agent mode run custom shell commands at key points during agent execution.

## Sources and versioning

- Last reviewed: 2026-07-24
- Sources:
    - https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks
    - https://docs.github.com/en/copilot/how-tos/copilot-cli/use-hooks
    - https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks
    - https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks
    - https://docs.github.com/en/copilot/reference/hooks-reference
    - https://code.visualstudio.com/docs/agent-customization/hooks

## Scope

- Hook configuration files belong directly under `.github/hooks/*.json`.
- Supporting scripts and assets can live in subdirectories such as `.github/hooks/scripts/` and `.github/hooks/logs/`.
- Copilot coding agent uses hooks from the repository default branch; Copilot CLI loads hooks from the current working directory.
- These are repository-hook paths. Do not copy them unchanged into an agent plugin: MetaFlow
  plugin injection registers the capability outside the consuming workspace, so a command such as
  `./.github/hooks/scripts/guard.ps1` resolves from the wrong working directory.
- For plugin-delivered hooks, follow
  [ai-metadata-plugins.instructions.md](./ai-metadata-plugins.instructions.md): select the
  manifest format first, use its discoverable hook location or explicit `hooks` field, and locate
  bundled scripts from that format's plugin-root contract.

## Required structure

- The config must be valid JSON and include `version: 1` (required for Copilot CLI and Copilot coding agent; not required for VS Code).
- A minimal CLI/coding-agent starting structure:

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

- The GitHub hooks reference supports additional CLI/cloud events such as `agentStop`,
  `subagentStart`, `subagentStop`, `postToolUseFailure`, and `preCompact`. Add only events supported
  by every target host; event names and payload fields differ between camelCase CLI form and
  PascalCase VS Code-compatible form.
- VS Code uses PascalCase event names such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`. VS Code parses the CLI
  camelCase format automatically, converting event names and mapping `bash` → `linux`/`osx`,
  `powershell` → `windows`.

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
- Most lifecycle command hooks run synchronously and block agent execution; keep them fast and
  deterministic, and aim to stay under 5 seconds when practical. `notification` and other
  host-specific events can be asynchronous or fire-and-forget, so verify the selected event.
- Copilot CLI/cloud `preToolUse` accepts `allow`, `deny`, or `ask` plus optional `modifiedArgs`;
  cloud treats `ask` as `deny` because no user is present.
- `agentStop` and `subagentStop` can return `{"decision":"block","reason":"..."}` to force a
  continuation, subject to the runtime's runaway guard.
- `postToolUse` can return `modifiedResult` and/or `additionalContext`; `sessionStart`,
  `subagentStart`, failure, notification, and permission events have their own documented output
  contracts. Do not assume that non-`preToolUse` output is ignored.
- VS Code-compatible PascalCase payloads and outputs use different field names from camelCase
  CLI payloads. Validate the exact event form used by each target.

## Script guidance

- Ensure scripts are executable and have a valid shebang when using Bash.
- Repository hooks MAY use repository-root-relative script paths only when the script is also
  present in the consuming repository. Plugin hooks MUST resolve bundled scripts from the selected
  plugin root or set an explicit plugin-root `cwd`; they MUST NOT assume the hook starts in the
  plugin directory.
- Emit exactly one final JSON value. CLI progress messages must each be single-line JSON; the final
  result may span lines but compact JSON is easier to validate.
- In camelCase CLI payloads, `toolArgs` is already a parsed JSON value. PascalCase
  VS Code-compatible payloads use `tool_input`. Do not parse either again unless a specific tool
  field is itself documented as a JSON string.
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
