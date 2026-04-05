---
description: Guidance for GitHub Copilot custom agent profiles stored in .github/agents.
applyTo: '.github/agents/**/*.agent.md'
---

# Custom Agents (.github/agents)

This repository defines GitHub Copilot custom agents in `.github/agents/`.

## File layout
- Agent profile files must live under `.github/agents/`.
- File naming: `kebab-case.agent.md` (for example: `release-manager.agent.md`).

## Required YAML frontmatter
- Files must begin with YAML frontmatter (first line is `---`).
- `description` is required.

## Recommended YAML frontmatter
- `name`: use a human-friendly display name (Title Case, spaces allowed) that matches the role.
- Preferred order: `name`, `description`, then user-facing invocation keys when present (`argument-hint`, `model`), then `target` (if used), then execution/control keys (`tools`, `user-invocable`, `disable-model-invocation`, `mcp-servers`, etc.).
- Keep the filename `kebab-case.agent.md` for consistency and deduplication.
- Prefer `user-invocable` and `disable-model-invocation`. Use `infer` only when documenting compatibility behavior for an existing agent surface.
- Default to `user-invocable: false`; only a small curated set of coordinator or entry-point agents should be visible in the picker.
- `target` is optional and should only be set when the agent is intentionally restricted to `vscode` or `github-copilot`.
- `mcp-servers` is supported for GitHub.com custom agents and ignored by VS Code; only use it when GitHub coding-agent behavior needs repo-local MCP configuration.
- VS Code-only keys such as `model`, `argument-hint`, `agents`, and `handoffs` should be used only when the agent intentionally depends on IDE behavior.
- For prompt-only agents, prefer hiding picker visibility and disabling model invocation.
- `tools`: prefer GitHub-supported tool aliases for portability.
- `metadata`: optional key-value annotation object; not used in VS Code or IDE agents.
- Quote values only when needed for YAML parsing clarity.

Example:

---
name: Release Manager
description: Prepares releases with semver, changelog, announcements, and rollback notes
model: GPT-5 (copilot)
tools: ["read", "search", "edit", "github/*"]
user-invocable: true
disable-model-invocation: false
---

## Tools guidance
- Prefer these portable tool aliases: `read`, `search`, `edit`, `execute`, `web`, `todo`, `agent`, and `github/*`.
- Use `tools: ["*"]` only when the role genuinely needs full tool access; otherwise keep the allow-list narrow.
- Unrecognized tool names are ignored by Copilot, but avoid relying on product-specific names unless needed.
- If the agent should not change code, explicitly say so in the prompt and omit `edit`/`execute`.

## Prompt content guidance
- Keep scope tight and role-specific.
- Prefer declarative sections such as `Role`, `Workflow`, and `Output contract`.
- Favor imperative workflow steps over conversational phrasing.
- Keep the hot path lean: leave role, delegation boundaries, and output contract in the agent file, then move extended procedures and examples into skills or support docs.
- Use repository-relative paths (for example `.ai/docs/...`, `doc/...`, `.ai/issues/...`).
- Avoid contradicting `.github/copilot-instructions.md` and any path-scoped instruction files.
- Keep the prompt under 30,000 characters.

## User decision guidance

- If an agent owns user-facing clarifications, approvals, routing, checkpoint choices, or destructive-decision escalation, define when it should use askQuestions instead of assuming ordinary chat follow-ups.
- Prefer wording that says the agent should use askQuestions only when missing or ambiguous input would materially change scope, validation, routing, or next actions.
- Tell the agent to batch the smallest useful set of high-impact questions, provide recommended options when possible, and continue immediately after answers arrive.
- If the agent is intended for VS Code use, it is acceptable to reference `vscode_askQuestions` explicitly.
- Include a one-question chat fallback when the tool is unavailable rather than leaving fallback behavior implicit.

## Agent teams (coordinator-worker pattern)

When a capability defines multiple agents that work together, structure them as a coordinator-worker team.

### Coordinator agent
- Give the coordinator the `agent` tool and an explicit `agents: [...]` array listing its workers by name.
- Avoid `agents: ["*"]` — it allows the coordinator to invoke any visible agent in the workspace, including agents from unrelated capability packs.
- The coordinator's prompt should define: when to delegate, which worker handles which concern, expected output format from workers, and quality gates before synthesis.
- Coordinators typically need `tools: ["read", "search", "edit", "agent"]`; add `execute` only when the coordinator itself must run commands.

### Worker agents
- Set `user-invocable: false` so workers are hidden from the agent dropdown.
- For workers that should only be accessible to their coordinator (not auto-selected by other agents), also set `disable-model-invocation: true`. The coordinator's `agents: [...]` list overrides this for its own workers.
- For capability-pack stewards and niche specialists, prefer hidden-by-default even when they are not part of a formal team; expose them only if they are intended as regular human entry points.
- Scope each worker's tools to the minimum needed for its role (for example, read-only for reviewers, `execute` only for testers).
- Workers can specify a `model` for cost/speed optimization on narrow tasks.

### Visibility matrix

| Role | `user-invocable` | `disable-model-invocation` | Who can invoke |
| --- | --- | --- | --- |
| User entry point | `true` | `true` | User only |
| Coordinator (visible) | `true` | `false` | User or AI |
| Coordinator (hidden) | `false` | `false` | AI auto-select or explicit `agents:` |
| Worker (standard) | `false` | `false` | Any agent can auto-select |
| Worker (protected) | `false` | `true` | Only via explicit `agents:` list |

### Handoffs (VS Code only)
- Use `handoffs:` for sequential user-guided workflows (for example Plan → Implement → Review).
- Each handoff specifies `agent`, `label`, and `prompt`; set `send: true` for auto-submit.
- Optionally add `model` to each handoff entry to override the model when the handoff fires.
- Handoffs are ignored on GitHub.com coding agent; do not rely on them for cross-platform workflows.

### Artifact-based communication
- Prefer durable file artifacts (plans, reports, issues) over ephemeral chat for inter-agent communication.
- Define artifact locations in the coordinator's prompt.
- Workers write artifacts; the coordinator reads and synthesizes them.

### Thin-agent architecture
- Keep agent prompt bodies concise (~200–500 chars) and delegate detailed workflow guidance to skill files.
- When a skill would become too large, keep its trigger and core workflow in `SKILL.md` and move deeper detail into sibling docs such as `Workflow.md`, `BestPractices.md`, or `references/INDEX.md`.
- This keeps agents composable and DRY but requires skill loading to work correctly in the runtime.
- Document this design choice in the capability so contributors don't duplicate skill content in agent prompts.