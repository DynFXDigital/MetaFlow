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
| Project configuration | `.codex/config.toml` | Managed project configuration is candidate or gated output unless the target adapter explicitly owns the file. |
| Agents | `.codex/agents/*.toml` | Canonical agent profiles project to Codex custom-agent configuration when the target adapter enables agent materialization. |
| Hooks | `.codex/hooks.json` | Supported command lifecycle hook metadata projects to Codex hook JSON when the target adapter enables hook materialization. |
| Plugins | `.codex-plugin/plugin.json` | Codex plugin manifests stay separate from GitHub Copilot `plugin.json` manifests. |
| Local plugin marketplace | `.agents/plugins/marketplace.json` | Canonical package marketplace entries can export Codex-shaped candidate payloads for operator review. |

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
| Remote or OAuth MCP operation | Codex supports Streamable HTTP and OAuth MCP configuration, but login, callback URLs, reachable endpoints, tool approvals, and remote executor behavior are runtime concerns. | Project supported config fields where managed, and keep login/reachability/tool-call proof as validation evidence. |
| Side-effecting MCP tools | MCP tools can read or change external systems. Static metadata cannot grant authority safely. | Require policy grants, approval posture, and audit evidence before package or adapter claims are treated as operational. |

## Not Technically Achievable By Repository Projection Alone

MetaFlow does not claim the following outcomes from generated repository files:

- Creating or approving ChatGPT workspace connectors.
- Installing Slack, Linear, GitHub, or other Codex-connected apps in a workspace.
- Creating Codex Cloud environments or setting cloud task secrets.
- Authenticating a user's GitHub CLI, Codex account, Slack account, Linear
  account, MCP OAuth session, or marketplace plugin install.
- Granting shell, browser, network, credential, memory, or external-service
  authority merely because a package manifest references those capabilities.
- Proving hosted Codex Cloud, Slack, Linear, GitHub review, or remote MCP
  behavior without a harness-native run.

These are operator-owned or harness-owned runtime states. MetaFlow records the
intent and validation requirements, then leaves the authority transition to the
target harness and the responsible user or administrator.

## Validation Expectations

Static projection support and runtime support use different evidence.

| Claim type | Evidence |
| --- | --- |
| File projection works | Engine, CLI, extension, and synchronizer tests showing the generated files, managed state, drift behavior, and conflict protection. |
| Codex can discover the generated file | Local Codex CLI, IDE extension, or app smoke evidence against the generated workspace. |
| Codex Cloud or channel delegation works | A Codex-hosted task or connector run showing the selected environment, repository, task result, and known limitations. |
| MCP runtime works | Codex MCP startup, login where applicable, tool listing, tool approval behavior, and at least one target tool call in the intended environment. |
| Package marketplace readiness | Reviewable marketplace candidate output plus package policy grants, runtime validation records, and operator acceptance. |

## Source Map

- Codex skills: <https://developers.openai.com/codex/skills>
- Codex project instructions: <https://developers.openai.com/codex/guides/agents-md>
- Codex MCP: <https://developers.openai.com/codex/mcp>
- Codex cloud environments: <https://developers.openai.com/codex/cloud/environments>
- Codex GitHub review: <https://developers.openai.com/codex/integrations/github>
- Codex Slack integration: <https://developers.openai.com/codex/integrations/slack>
- Codex Linear integration: <https://developers.openai.com/codex/integrations/linear>
- Codex plugins: <https://developers.openai.com/codex/plugins>
