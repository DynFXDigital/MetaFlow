# Codex Support Boundaries

MetaFlow treats Codex as a first-class target adapter. It projects canonical
MetaFlow metadata into Codex-native repository files when the Codex surface is
file-backed, and it reports runtime-only Codex surfaces when repository
metadata cannot create or prove the runtime behavior.

This document records the public support boundary for MetaFlow's Codex adapter.
The source baseline is the OpenAI Codex manual fetched on 2026-07-03.

## Supported File Projections

MetaFlow supports repository metadata projection for Codex surfaces that Codex
loads from files in the workspace.

| MetaFlow concept | Codex surface | MetaFlow behavior |
| --- | --- | --- |
| Skills | `.agents/skills/<skill-id>/SKILL.md` | Canonical `.metaflow/skills/**` entries project to Codex repository skills. |
| Project instructions | `AGENTS.md`, `AGENTS.override.md` | Root and scoped instructions are guarded because unmanaged project guidance has high collision risk. |
| Prompts | `.metaflow/prompts/*.md`, `.metaflow/prompts/*.json` | Canonical prompt metadata is reviewable for Codex, but Codex custom prompts are deprecated local-only slash-command files under the user's Codex home directory. Shared Codex workflows use skills instead of repository prompt projection. |
| Project configuration | `.codex/config.toml` | Managed project configuration is candidate or gated output unless the target adapter explicitly owns the file. |
| Command rules | `.codex/rules/*.rules` | Project-local command rules are guarded policy files with a distinct `commandRules` target-adapter concept. Codex loads them only from trusted project config layers and after startup; rule syntax, shell-wrapper splitting, and admin-enforced requirements require Codex runtime validation. |
| Agents | `.codex/agents/*.toml` | Canonical agent profiles project to Codex custom-agent configuration when the target adapter enables agent materialization. Codex loads these files as subagent configuration layers, but installed Codex CLI 0.142.3 does not expose a non-interactive custom-agent activation flag or debug prompt-input proof for repo-local agent TOML. |
| Hooks | `.codex/hooks.json` | Supported command lifecycle hook metadata projects to Codex hook JSON when the target adapter enables hook materialization. |
| Plugins | `.codex-plugin/plugin.json` | Codex plugin manifests stay separate from GitHub Copilot `plugin.json` manifests. |
| Local plugin marketplace | `.agents/plugins/marketplace.json` | Canonical package marketplace entries can export Codex-shaped candidate payloads for operator review through the CLI or VS Code package marketplace report. |

## Runtime-Only Codex Surfaces

The following Codex capabilities are runtime integrations. MetaFlow can model
intent, policy grants, review notes, validation evidence, and target capability
matrix rows for these surfaces, but repository projection alone does not create
the service connection or prove the behavior.

| Codex surface | Why static projection is insufficient | MetaFlow handling |
| --- | --- | --- |
| Codex Cloud tasks | Cloud tasks depend on ChatGPT/Codex environments, GitHub connection, branch or SHA checkout, setup scripts, cloud secrets, and agent internet-access settings. | Represent execution intent in `.metaflow/execution/*.json`; require harness-native runtime evidence for support claims. |
| Slack delegation | Slack tasks depend on the Codex Slack app, workspace install or admin approval, channel membership, connected GitHub account, and a Codex environment. | Record as runtime-only issue/task operation; do not generate Slack app state. |
| Linear delegation | Linear tasks depend on the Codex Linear integration, account linking, workspace settings, GitHub connection, and environment selection. | Record as runtime-only issue/task operation; do not generate Linear connector state. |
| GitHub-triggered Codex review | GitHub review operation depends on Codex GitHub access and repository/PR context outside the metadata repository. | Record review intent and required policy grants; require GitHub/Codex runtime evidence. |
| PR feedback handling in the Codex app | App PR context depends on the current branch, Git repository state, GitHub access, and authenticated `gh` behavior. | Document as an operator workflow; do not treat projection as proof that PR feedback appears in Codex. |
| Codex GitHub Action | GitHub Action execution depends on workflow triggers, GitHub secrets, runner operating system, job permissions, sandbox inputs, and Codex action version. | Classify the execution intent in `.metaflow/execution/*.json`; do not generate workflows or claim CI execution without a harness-native run. |
| Codex app-server integrations | App-server execution depends on a local process, selected transport, client initialization, experimental capability flags where applicable, and listener authentication for WebSocket use. | Classify the execution intent in `.metaflow/execution/*.json`; require integration-specific runtime validation before treating app-server usage as operational. |
| Codex SDK integrations | SDK-embedded execution depends on application code, API credentials, process sandboxing, trace handling, and deployed environment policy. | Classify the execution intent in `.metaflow/execution/*.json`; require SDK integration evidence before treating the adapter claim as runtime support. |
| Codex Memories | Memories are opt-in runtime state controlled by Codex settings or per-thread controls and stored under the user's Codex home directory. | Record intended boundaries in `.metaflow/memory/*.json`; require enabled memory settings, thread-level control evidence, generated memory artifact review, and recall proof before treating memory behavior as operational. |
| Browser Use and in-app browser | Browser Use depends on the Browser plugin, site approvals, browser state, optional Developer Mode, and the rendered page state available in the running Codex app. | Record browser task intent, target URL, approval scope, and visual validation evidence; do not treat repository metadata as proof of page interaction. |
| Chrome extension browser use | Chrome use depends on the Chrome plugin, extension installation, active Chrome profile, website allowlists, browser history permission, and signed-in account state. | Record Chrome task intent and required authority; require harness-native evidence before treating signed-in browser operation as supported. |
| Computer Use | Computer Use depends on plugin installation, operating system permissions, visible app/window state, app allow decisions, and user approval prompts. | Record desktop automation intent and policy grants; do not treat repository metadata as proof of GUI control, screen access, or app permission. |
| Sites hosting and deployment | Sites depends on the Sites plugin, hosted project provisioning, build compatibility, saved versions, audience settings, hosted secrets, and deployment approval. | Record hosting intent and validation evidence; do not create hosted project state or claim production deployment from repository metadata alone. |
| Remote MCP reachability | Codex supports Streamable HTTP MCP configuration, but reachable endpoints, TLS behavior, hosted-agent network policy, and remote executor behavior are runtime concerns. | Project supported config fields where managed, and keep reachability and tool-call proof as validation evidence. |
| OAuth MCP login | Codex supports OAuth metadata for MCP servers, but login, callback URLs, token handling, and account authorization are runtime concerns. | Project supported OAuth fields where managed, and keep login and callback proof as validation evidence. |
| Side-effecting MCP tools | MCP tools can read or change external systems, and approval behavior depends on runtime tool authority. Static metadata cannot grant authority safely. | Require policy grants, approval posture, bounded tool-call proof, and audit evidence before package or adapter claims are treated as operational. |
| Harness-native evaluation execution | Evaluation runs depend on the selected Codex runtime, repository checkout, model or agent identity, credentials, sandbox and tool policy, network access, scoring harness, and artifact retention. | Record evaluation intent and expected evidence in `.metaflow/evaluation/*.json`; require harness-native benchmark, reviewer-agent, smoke, CI, or hosted task evidence before treating runtime scoring as operational. |

## Not Technically Achievable By Repository Projection Alone

MetaFlow does not claim the following outcomes from generated repository files:

- Creating or approving ChatGPT workspace connectors.
- Installing Slack, Linear, GitHub, or other Codex-connected apps in a workspace.
- Creating Codex Cloud environments or setting cloud task secrets.
- Enabling Codex Memories, generating memory files, authorizing per-thread
  memory use, or proving memory recall behavior.
- Authenticating a user's GitHub CLI, Codex account, Slack account, Linear
  account, MCP OAuth session, or marketplace plugin install.
- Granting shell, browser, network, credential, memory, or external-service
  authority merely because a package manifest references those capabilities.
- Installing or enabling Browser, Chrome, Computer Use, or Sites plugins and
  their app, website, OS, hosting, or workspace permissions.
- Executing harness-native evaluations, benchmark tasks, reviewer-agent
  scoring, hosted traces, or runtime scoring workflows.
- Proving hosted Codex Cloud, Slack, Linear, GitHub review, remote MCP
  reachability, OAuth MCP login, side-effecting MCP behavior, browser
  interaction, Chrome profile operation, desktop automation, Sites deployment,
  or harness-native evaluation execution without a harness-native run.

These are operator-owned or harness-owned runtime states. MetaFlow records the
intent and validation requirements, then leaves the authority transition to the
target harness and the responsible user or administrator.

## Validation Expectations

Static projection support and runtime support use different evidence.

| Claim type | Evidence |
| --- | --- |
| File projection works | Engine, CLI, extension, and synchronizer tests showing the generated files, managed state, drift behavior, and conflict protection. |
| Codex can discover the generated file | Local Codex CLI, IDE extension, or app smoke evidence against the generated workspace. |
| Codex custom-agent activation works | A Codex app or CLI subagent run that explicitly spawns the named agent and shows the generated `.codex/agents/*.toml` instructions in effect. Static TOML projection and `codex debug prompt-input` inspection are not sufficient by themselves. |
| Codex Cloud or channel delegation works | A Codex-hosted task or connector run showing the selected environment, repository, task result, and known limitations. |
| MCP runtime works | Codex MCP startup, remote endpoint reachability, login where applicable, tool listing, tool approval behavior, and at least one target tool call in the intended environment. |
| Package marketplace readiness | Reviewable marketplace candidate output from `metaflow export-package-marketplace` or `MetaFlow: Open Package Marketplace Report`, plus package policy grants, runtime validation records, and operator acceptance. |
| Tool runtime works | Tool manifest review, policy grant approval, target runtime configuration, approval behavior, and at least one bounded tool call in the intended environment. |
| Codex memory runtime works | Enabled Codex memory settings, thread-level memory controls, generated memory artifact review, recall evidence, and known retention or sharing limits. |
| Browser, Chrome, Computer Use, or Sites runtime works | Installed plugin or app state, approval scope, target site, app, or hosted project identity, representative operation, result, and known limitations. |
| Evaluation runtime works | Selected Codex surface, repository checkout, model or agent identity, sandbox and tool policy, validation command, benchmark or scoring result, artifacts, traces where available, cost or data limits, and known limitations. |

For the package maintainer workflow, see
[Codex Package Maintainer Guide](CODEX-PACKAGE-MAINTAINER-GUIDE.md).
For command, MCP, HTTP, and manual tool authority, see
[Codex Tool Authority Guide](CODEX-TOOL-AUTHORITY-GUIDE.md).

## Source Map

- Codex skills: <https://developers.openai.com/codex/skills>
- Codex project instructions: <https://developers.openai.com/codex/guides/agents-md>
- Codex MCP: <https://developers.openai.com/codex/mcp>
- Codex cloud environments: <https://developers.openai.com/codex/cloud/environments>
- Codex GitHub review: <https://developers.openai.com/codex/integrations/github>
- Codex Slack integration: <https://developers.openai.com/codex/integrations/slack>
- Codex Linear integration: <https://developers.openai.com/codex/integrations/linear>
- Codex plugins: <https://developers.openai.com/codex/plugins>
- Codex GitHub Action: <https://developers.openai.com/codex/github-action>
- Codex app-server: <https://developers.openai.com/codex/app-server>
- Codex SDK: <https://developers.openai.com/codex/sdk>
- Codex in-app browser: <https://developers.openai.com/codex/app/browser>
- Codex Chrome extension: <https://developers.openai.com/codex/app/chrome-extension>
- Codex Computer Use: <https://developers.openai.com/codex/app/computer-use>
- Codex Sites: <https://developers.openai.com/codex/sites>
