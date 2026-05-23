# AI metadata compatibility notes

For metadata key ordering conventions, follow the artifact-specific rules in `.github/instructions/ai-metadata-*.instructions.md`.

Last reviewed: 2026-05-22

## Custom instructions

Sources: [GitHub custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

- GitHub.com supports repo-wide `.github/copilot-instructions.md`, path-specific `.github/instructions/*.instructions.md`, and agent-specific instruction files such as `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- GitHub.com path-specific instructions are supported only for Copilot coding agent and Copilot code review.
- VS Code supports `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` with `applyTo`, and `AGENTS.md`.
- VS Code `.instructions.md` files can include `name` and `description`, and `applyTo` is optional when files are manually attached.
- VS Code supports CLAUDE-compatible instruction locations, including `.claude/rules` with `paths`.
- Custom instructions do not affect inline suggestions in VS Code.
- VS Code `chat.useCustomizationsInParentRepositories` can discover customizations from the parent repository root when a subfolder is opened as the workspace.

## Prompt files

Sources: [GitHub prompt files](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

- Prompt files remain IDE-driven and are still unavailable on the GitHub web surface.
- GitHub documents prompt files as public preview and available in VS Code, Visual Studio, and JetBrains IDEs.
- VS Code prompt frontmatter supports `name`, `description`, `argument-hint`, `agent`, `model`, and `tools`.
- Prompt tool availability follows priority: prompt `tools` > referenced agent `tools` > selected/default agent tools.

## Custom agents

Sources: [GitHub custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)

- GitHub.com custom agents support shared fields such as `name`, `description`, `target`, `tools`, `model`, `user-invocable`, and `disable-model-invocation`.
- GitHub.com ignores VS Code-only fields such as `argument-hint`, `handoffs`, and `agents`.
- Use `disable-model-invocation` and `user-invocable` in new agent files. GitHub.com treats deprecated `infer: false` as equivalent to `disable-model-invocation: true`.
- `mcp-servers` in agent frontmatter is GitHub.com coding-agent specific and not used in VS Code.
- Agent profile filenames are used for deduplication across levels.
- VS Code custom agents use `.agent.md` and additional settings such as `chat.agentFilesLocations`.

## Subagents and agent teams

Sources: [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents), [VS Code planning with agents](https://code.visualstudio.com/docs/copilot/agents/planning)

- `agents:` and `handoffs:` are VS Code-only.
- Listing an agent in `agents: [...]` overrides that agent’s `disable-model-invocation: true` for the coordinator.
- Nested subagent invocations require the VS Code setting `chat.subagents.allowInvocationsFromSubagents`; maximum nesting depth is 5.
- GitHub.com coding agent has no equivalent to subagents, agent teams, or handoffs.

## Agent skills

Sources: [GitHub about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)

- Skills work with Copilot coding agent, Copilot CLI, and VS Code agent mode.
- Skills are loaded progressively.
- VS Code supports `argument-hint`, `user-invocable`, and `disable-model-invocation` in `SKILL.md` frontmatter.
- Project skill locations include `.github/skills/`, `.claude/skills/`, and `.agents/skills/`; personal locations are user-profile scoped.
- In VS Code, the `name` field must match the parent skill directory name; invalid names or manual namespace prefixes can cause the skill to fail to load.

## Hooks

Sources: [GitHub about hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks), [GitHub hooks how-to](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), [GitHub hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration), [VS Code hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)

- Repository hook files under `.github/hooks/*.json` remain the safest shared portability baseline.
- Copilot CLI can also load inline `hooks` blocks from repository or user `.github/copilot/settings.json` files, user hook folders, and enabled plugins; Copilot cloud agent only loads `.github/hooks/*.json` from the cloned repository.
- GitHub Copilot hook support now spans more than the original baseline events; current docs include events such as `permissionRequest`, `notification`, `preCompact`, `agentStop`, `subagentStart`, and `subagentStop` in addition to `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred`.
- GitHub Copilot hook configuration supports `command`, `http`, and `prompt` hook entries, but prompt hooks are limited to `sessionStart` and are CLI-oriented.
- VS Code uses PascalCase event names and a VS Code-compatible snake_case payload shape; it also supports agent-scoped hooks in `.agent.md` frontmatter when `chat.useCustomAgentHooks` is enabled.
- On GitHub.com cloud agent, only `bash` and cross-platform `command` hook entries are honored; `powershell` is ignored in the Linux sandbox.
- In Copilot CLI, `permissionRequest` and `preToolUse` can deny or allow execution programmatically; in cloud agent, `ask` falls back to deny because no interactive user is present.
- VS Code supports richer hook outputs such as `permissionDecision`, `updatedInput`, `additionalContext`, and stop-hook continuation control.# AI metadata compatibility notes

For metadata key ordering conventions, follow the artifact-specific rules in `.github/instructions/ai-metadata-*.instructions.md`.

## Custom instructions

Sources: [GitHub custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

- GitHub.com supports repo-wide `.github/copilot-instructions.md`, path-specific `.github/instructions/*.instructions.md`, and agent-specific instruction files such as `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- GitHub.com path-specific instructions are supported only for Copilot coding agent and Copilot code review.
- VS Code supports `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` with `applyTo`, and `AGENTS.md`.
- VS Code `.instructions.md` files can include `name` and `description`, and `applyTo` is optional when files are manually attached.
- VS Code supports CLAUDE-compatible instruction locations, including `.claude/rules` with `paths`.
- Custom instructions do not affect inline suggestions in VS Code.
- VS Code `chat.useCustomizationsInParentRepositories` can discover customizations from the parent repository root when a subfolder is opened as the workspace.

## Prompt files

Sources: [GitHub prompt files](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

- Prompt files remain IDE-driven and are still unavailable on the GitHub web surface.
- VS Code prompt frontmatter supports `name`, `description`, `argument-hint`, `agent`, `model`, and `tools`.
- Prompt tool availability follows priority: prompt `tools` > referenced agent `tools` > selected/default agent tools.

## Custom agents

Sources: [GitHub custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)

- GitHub.com coding agent ignores VS Code-only fields such as `model`, `argument-hint`, `handoffs`, `agents`, `user-invocable`, and `disable-model-invocation`.
- Use `disable-model-invocation` and `user-invocable` in new agent files. GitHub.com coding agent maps `infer: false` found in older files to `disable-model-invocation: true`.
- `mcp-servers` in agent frontmatter is GitHub.com coding-agent specific and not used in VS Code.
- Agent profile filenames are used for deduplication across levels.
- VS Code custom agents use `.agent.md` and additional settings such as `chat.agentFilesLocations`.

## Subagents and agent teams

Sources: [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents), [VS Code planning with agents](https://code.visualstudio.com/docs/copilot/agents/planning)

- `agents:` and `handoffs:` are VS Code-only.
- Listing an agent in `agents: [...]` overrides that agent’s `disable-model-invocation: true` for the coordinator.
- Nested subagent invocations require the VS Code setting `chat.subagents.allowInvocationsFromSubagents`; maximum nesting depth is 5.
- GitHub.com coding agent has no equivalent to subagents, agent teams, or handoffs.

## Agent skills

Sources: [GitHub about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)

- Skills work with Copilot coding agent, Copilot CLI, and VS Code agent mode.
- Skills are loaded progressively.
- VS Code supports `argument-hint`, `user-invocable`, and `disable-model-invocation` in `SKILL.md` frontmatter.
- Project skill locations include `.github/skills/`, `.claude/skills/`, and `.agents/skills/`; personal locations are user-profile scoped.

## Hooks

Sources: [GitHub about hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks), [GitHub hooks how-to](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), [GitHub hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration), [VS Code hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)

- Hooks are repository-scoped JSON configuration files under `.github/hooks/*.json`.
- Copilot coding agent reads hooks from the default branch; Copilot CLI reads hooks from the current working directory.
- The stable cross-doc baseline hook events for Copilot CLI and coding agent are `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred`.
- VS Code uses PascalCase event names and supports additional events such as `PreCompact`, `SubagentStart`, `SubagentStop`, and `Stop`.
- `preToolUse` is the only CLI or coding-agent hook that can deny execution.
- VS Code supports richer hook outputs such as `allow`, `deny`, `ask`, and `additionalContext`.

## Versioning

- Last reviewed: 2026-03-26
