# AI metadata compatibility notes

Use this file to check host differences before claiming that metadata is portable. Matching
filenames do not guarantee matching behavior.

Last reviewed: 2026-07-23

## Custom instructions

Sources: [GitHub custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

- GitHub.com Copilot Chat uses repository-wide instructions; Copilot cloud agent and code review also support path-specific instructions, with agent instructions applying to agent workflows.
- VS Code supports repository-wide, path-specific, and `AGENTS.md` instructions. It combines relevant instruction files without guaranteeing their order.
- Copilot CLI supports repository-wide, path-specific, and `AGENTS.md` instructions.
- VS Code instructions do not affect inline suggestions, and parent-repository discovery depends on the relevant setting.
- Treat organization-level instructions and nested `AGENTS.md` discovery as host- or setting-dependent behavior.

## Prompt files

Sources: [GitHub prompt files](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

- Prompt files remain IDE-driven. VS Code supports them; GitHub.com and Copilot CLI do not provide the same prompt-file surface.
- VS Code prompt frontmatter supports `name`, `description`, `argument-hint`, `agent`, `model`, and `tools`.
- Prompt tool availability follows priority: prompt `tools` > referenced agent `tools` > selected/default agent tools.
- Do not make a workflow depend on a prompt file when it must run on GitHub.com or Copilot CLI.

## Custom agents

Sources: [GitHub custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)

- Custom agents are available across VS Code, GitHub cloud agent, and Copilot CLI, but frontmatter fields and filename conventions differ by host.
- Keep the cross-host contract to the fields supported by every target; treat `target`, `model`, `mcp-servers`, invocation controls, and hooks as host-specific until verified.
- `agents:` and `handoffs:` are VS Code orchestration features and do not make a GitHub.com agent team.
- Use `user-invocable` and `disable-model-invocation` for new VS Code agents; retain deprecated `infer` only as compatibility guidance for existing files.
- VS Code custom agents use `.agent.md` and can be discovered through configured `chat.agentFilesLocations`.

## Subagents and agent teams

Sources: [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents), [VS Code planning with agents](https://code.visualstudio.com/docs/copilot/agents/planning)

- VS Code and Copilot CLI support subagent delegation; GitHub.com coding agent does not provide the same subagent or team model.
- In VS Code, `agents: [...]` and `handoffs:` are host-specific, and nested invocation requires `chat.subagents.allowInvocationsFromSubagents`.
- Do not describe a VS Code coordinator/worker workflow as portable to GitHub.com without a separate implementation.

## Agent skills

Sources: [GitHub about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)

- Agent Skills are the most portable workflow surface across Copilot coding agent, Copilot CLI, and VS Code agent mode.
- Skills load progressively; keep the discovery description useful and move large procedures into referenced resources.
- Project locations include `.github/skills/`, `.claude/skills/`, and `.agents/skills/`; personal locations are host-specific.
- In VS Code, the `name` field must match the parent directory and must use lowercase letters, numbers, and hyphens. Plugin packaging supplies namespaces; do not add them manually.

## Agent plugins

Sources: [VS Code agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins), [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)

- VS Code checks `.plugin/plugin.json`, root `plugin.json`, `.github/plugin/plugin.json`, then
  `.claude-plugin/plugin.json`; the first match selects the format and its path semantics.
- OpenPlugin supplies `${PLUGIN_ROOT}`, Claude format supplies `${CLAUDE_PLUGIN_ROOT}`, and VS Code
  supplies no plugin-root token for root Copilot format.
- OpenPlugin and Claude default to `hooks/hooks.json`; root Copilot format uses root `hooks.json`.
  Honor an explicit `hooks` manifest field when present.
- Copilot CLI's exported plugin-root environment variables are runtime and shell-specific. Do not
  infer cross-host hook interpolation from `${PLUGIN_ROOT}` support in Copilot LSP fields.
- Hook commands run from session/repository working directories unless `cwd` says otherwise.
  Resolve bundled plugin scripts from the selected format's root contract and validate the emitted
  package tree.

## Hooks

Sources: [GitHub about hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks), [GitHub hooks how-to](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), [GitHub hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference), [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks)

- Repository hook files under `.github/hooks/*.json` are the shared baseline for Copilot cloud agent and Copilot CLI.
- VS Code also reads `.github/hooks/*.json`, but its hook support is currently in preview and uses PascalCase event names such as `PreToolUse` and `PostToolUse`.
- Copilot cloud agent runs in Linux; do not rely on `powershell` commands there. Use a cross-platform `command` or a supported shell-specific alternative.
- Hook payloads, output fields, available events, and blocking behavior differ by host. Validate the exact target before sharing a hook.
- Treat hooks as executable code. Validate input, redact secrets, bound execution time, and test failure and blocking behavior.
