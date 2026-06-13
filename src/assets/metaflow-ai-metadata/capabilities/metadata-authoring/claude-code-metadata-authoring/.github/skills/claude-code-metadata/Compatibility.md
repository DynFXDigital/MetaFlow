# Claude Code metadata compatibility notes

Last reviewed: 2026-05-22

## Instruction files

Source: https://code.claude.com/docs/en/memory.md

- Claude Code loads project and parent-directory `CLAUDE.md` files at session start and loads nested subdirectory `CLAUDE.md` files on demand.
- Project instruction files may live at `CLAUDE.md` or `.claude/CLAUDE.md`.
- `@path/to/file` imports are supported up to 5 levels deep.
- Block-level HTML comments are stripped before injection.
- Claude Code does not read `AGENTS.md` directly; import it from `CLAUDE.md` when a repository wants one shared instruction source across tools.
- Managed policy `CLAUDE.md` cannot be excluded via `claudeMdExcludes`.

## Rules

Source: https://code.claude.com/docs/en/memory.md

- Rules in `.claude/rules/` without `paths` frontmatter load unconditionally.
- Rules with `paths:` frontmatter load on demand for matching files.
- User-level rules under `~/.claude/rules/` apply before project rules.

## Skills

Source: https://code.claude.com/docs/en/skills.md

- Project skills live under `.claude/skills/`.
- Skills can be auto-invoked from descriptions or explicitly invoked as slash commands.
- Claude Code skills support `when_to_use`, `arguments`, `allowed-tools`, `model`, `effort`, `context: fork`, `agent`, `hooks`, `paths:`, and shell preprocessing.
- Custom commands in `.claude/commands/` still work, but current docs position skills as the preferred authoring surface.

## Agents

Source: https://code.claude.com/docs/en/sub-agents.md

- Claude Code custom agents are Markdown files with YAML frontmatter in `.claude/agents/`.
- Agents support tool allowlists and denylists, permission modes, skill preloading, MCP scoping, persistent memory, and worktree isolation.
- Plugin-provided agents ignore `hooks`, `mcpServers`, and `permissionMode` frontmatter fields.
- Built-in Explore and Plan agents skip `CLAUDE.md` and git-status startup context that other agents receive.

## Settings and hooks

Sources: https://code.claude.com/docs/en/settings.md, https://code.claude.com/docs/en/hooks.md, https://code.claude.com/docs/en/hooks-guide.md

- Claude Code settings merge across managed, project, local, and user scopes.
- Arrays merge, objects deep-merge, and deny rules always win.
- Hooks can live in settings files, plugin hook files, or skill and agent frontmatter.
- Claude Code hook coverage now includes events such as `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `PostToolBatch`, `TaskCreated`, and `TaskCompleted` in addition to the older session, prompt, tool, and stop events.
- Prompt and agent hook types are documented, but agent hooks remain experimental and command hooks are still the safer default for production policy.

## MCP and auto memory

Sources: https://code.claude.com/docs/en/mcp.md, https://code.claude.com/docs/en/memory.md

- Shared project MCP configuration lives in `.mcp.json`.
- Agent frontmatter can further scope MCP servers.
- Claude Code now documents HTTP as the preferred remote MCP transport and SSE as deprecated.
- Auto memory is machine-local under `~/.claude/projects/<project-id>/memory/` and is not a shareable repository artifact.
- Auto memory is on by default, and Claude Code loads the first 200 lines or 25KB of `MEMORY.md` at startup.# Claude Code metadata compatibility notes

Last reviewed: 2026-03-28

## Instruction files

Source: https://code.claude.com/docs/en/memory.md

- Claude Code loads project and parent-directory `CLAUDE.md` files at session start and loads nested subdirectory `CLAUDE.md` files on demand.
- Project instruction files may live at `CLAUDE.md` or `.claude/CLAUDE.md`.
- `@path/to/file` imports are supported up to 5 levels deep.
- Block-level HTML comments are stripped before injection.
- Managed policy `CLAUDE.md` cannot be excluded via `claudeMdExcludes`.

## Rules

Source: https://code.claude.com/docs/en/memory.md

- Rules in `.claude/rules/` without `paths` frontmatter load unconditionally.
- Rules with `paths:` frontmatter load on demand for matching files.
- User-level rules under `~/.claude/rules/` apply before project rules.

## Skills

Source: https://code.claude.com/docs/en/skills.md

- Project skills live under `.claude/skills/`.
- Skills can be auto-invoked from descriptions or explicitly invoked as slash commands.
- Claude Code skills support `paths:` activation and shell preprocessing, unlike the currently documented Codex skill model.

## Agents

Source: https://code.claude.com/docs/en/sub-agents.md

- Claude Code custom agents are Markdown files with YAML frontmatter in `.claude/agents/`.
- Agents support tool allowlists and denylists, permission modes, skill preloading, MCP scoping, persistent memory, and worktree isolation.

## Settings and hooks

Sources: https://code.claude.com/docs/en/settings.md, https://code.claude.com/docs/en/hooks.md, https://code.claude.com/docs/en/hooks-guide.md

- Claude Code settings merge across managed, project, local, and user scopes.
- Arrays merge, objects deep-merge, and deny rules always win.
- Hooks are inline settings metadata and are production-ready on Windows, macOS, and Linux.
- Hooks can also be scoped through skill and agent frontmatter.

## MCP and auto memory

Sources: https://code.claude.com/docs/en/mcp.md, https://code.claude.com/docs/en/memory.md

- Shared project MCP configuration lives in `.mcp.json`.
- Agent frontmatter can further scope MCP servers.
- Auto memory is machine-local under `~/.claude/projects/<project-id>/memory/` and is not a shareable repository artifact.
- Claude Code loads the first 200 lines or 25KB of `MEMORY.md` at startup.
