# Changelog

All notable repository-level changes are documented here.

This project is currently in `v0.x` preview. Expect iterative changes while public APIs and workflows stabilize.

## [Unreleased]

### Added

- Plugin-based capability delivery for instructions, skills, and agents, so teams can package shared metadata as discoverable Copilot plugins instead of relying only on settings paths or synchronized files.
- Guided capability authoring and plugin manifest maintenance, including commands to scaffold capability metadata, repair plugin manifests, and sweep a metadata repository for packaging issues.
- Governance and diagnostics visibility for required capabilities, profile constraints, missing metadata sources, duplicate effective files, and plugin metadata problems, including a discoverable agent tool for reading the diagnostics snapshot.
- Smoother metadata repository setup, including automatic migration for older preview configs and better support for local git-backed metadata repositories.
- Richer tree exploration with folder branch toggles, browse-only artifact folders and files, native filtering, safer expand-all behavior, and direct opening of raw capability manifests.
- Bundled GitHub Copilot metadata-authoring guidance in the built-in MetaFlow capability.
- Codex operator walkthrough covering preview, adapter readiness, guarded native outputs, package marketplace export, and runtime-validation evidence.
- Codex target support reports in both the CLI and VS Code extension for reviewing target capability support, runtime-only boundaries, unsupported surfaces, and the terminal `codex-support-boundaries` report.
- Codex support boundary reports now link related operator, package maintainer, and tool authority guides in Markdown and JSON output.
- Codex command-rules target support reports for `.codex/rules/*.rules` policy files.
- Codex command-rules files now report the `commandRules` projection concept and honor target-adapter materialization gates separately from `.codex/config.toml`.
- Codex `.worktreeinclude` files now synchronize at the repository root with managed-state-only provenance and report the `worktreeInclude` projection concept.
- Codex operator guidance now spells out guarded native conflict ownership decisions for root/host files and the GitHub Copilot MCP handoff review workflow.
- Codex prompt support now distinguishes canonical MetaFlow prompt metadata from deprecated local-only Codex custom prompts, and directs shared Codex workflows to skills.
- Codex memory runtime support now distinguishes canonical `.metaflow/memory/**` boundary metadata from opt-in Codex Memories runtime state under the Codex home directory.
- Codex model-provider runtime support now distinguishes provider intent from user-global provider config, AWS authentication, regional model availability, and provider routing proof.
- Codex Appshots runtime support now distinguishes context-capture intent from Codex app frontmost-window image/text capture, macOS permission grants, session attachments, thread destination behavior, and runtime proof.
- Codex Record & Replay and Import to Codex runtime support now distinguishes reusable workflow and import-review metadata from Codex app recording, generated skill creation, Computer Use replay, imported setup migration, connector authorization, and runtime proof.
- Codex evaluation runtime support now distinguishes canonical `.metaflow/evaluation/**` evidence metadata from harness-native benchmark, reviewer-agent, CI, hosted trace, and runtime scoring execution evidence.
- Plugin runtime support now distinguishes Codex and GitHub Copilot package/marketplace metadata from installation, enablement, authentication, discovery, and task-time invocation evidence.
- Cloud environment runtime support now distinguishes Codex Cloud and GitHub-hosted environment evidence from repository metadata projection.
- App connector runtime support now distinguishes Slack, Linear, GitHub, ChatGPT workspace, GitHub Copilot, and Agent HQ connector authority from repository metadata projection.
- Agent runtime support now distinguishes Codex subagent workflows and GitHub Copilot or Agent HQ custom-agent routing from static custom-agent metadata projection.
- Automation runtime support now distinguishes Codex app automations and scheduled host-agent workflows from repository metadata projection.
- Authentication runtime support now distinguishes Codex, GitHub Copilot, and Agent HQ sign-in, workspace identity, access tokens, credentials, SSO, RBAC, entitlements, and connected account state from repository metadata projection.
- Permission runtime support now distinguishes Codex, GitHub Copilot, and Agent HQ sandboxing, approval policies, permission profiles, managed requirements, auto-review, network controls, and host tool approvals from repository metadata projection.
- Enterprise policy runtime support now distinguishes Codex managed configuration, cloud-managed `requirements.toml`, feature pins, MCP allowlists, marketplace controls, and GitHub Copilot or Agent HQ governance from repository metadata projection.
- Review runtime support now distinguishes Codex review panes, `/review`, GitHub-triggered `@codex review`, automatic reviews, PR feedback handling, and GitHub Copilot or Agent HQ review routing from repository metadata projection.
- Remote connection runtime support now distinguishes ChatGPT mobile control, connected Codex App hosts, SSH host projects, secure relay access, host-provided tools, and remote approvals from repository metadata projection.
- Chronicle runtime support now distinguishes Codex app opt-in, macOS screen permissions, screen-context memory generation, temporary screen-capture storage, local Chronicle memories, and prompt-injection risk controls from repository metadata projection.
- Codex package maintainer guide covering canonical package metadata, marketplace entries, policy grants, runtime validation records, and not-technically-projectable package claims.
- Codex tool authority guide covering canonical `.metaflow/tools/*.json` metadata, policy grants, execution scope, runtime validation, and the limit between tool description and runtime authority.
- Codex custom-agent activation proof boundary documentation for `.codex/agents/*.toml` projections and the installed CLI 0.142.3 non-interactive activation limit.
- Explicit target capability matrix rows for remote MCP reachability, OAuth MCP login, and side-effecting MCP runtime evidence boundaries.
- Explicit target capability matrix rows for Codex Browser Use, Chrome extension, Computer Use, and Sites runtime evidence boundaries.
- Target-aware CLI lifecycle output for `status`, `validate`, `apply`, and `clean`, including target support summaries and target-labeled mutation rows.
- Target adapter validation now warns when a capability declares multiple enabled adapters for the same target, preventing ambiguous Codex or Copilot projection policy.
- Canonical `.metaflow/capability.json` target declarations can now include support posture, required policy grants, validation evidence, and review notes for Codex and other target adapters.
- Target adapter validation now warns when managed authority-sensitive concepts lack adapter-level policy grant metadata for Codex, Copilot, or generic target review.
- Authority-sensitive target adapter concepts now stay candidate-only until adapter-level policy grants are declared, preventing managed writes from implying unreviewed Codex or Copilot authority.
- Target adapter validation now warns when managed concepts are unsupported or runtime-only in the current target capability matrix.
- Package runtime validation now warns when records omit both a validation command and evidence references.
- Package runtime validation records can link evidence to target capability concepts such as package manifests, remote MCP runtime, OAuth MCP runtime, and side-effecting MCP runtime.
- Adapter readiness output now shows package runtime validation concept links and warns when a runtime validation concept is unsupported for the selected target.
- Canonical execution profiles can now classify issue/PR-native operation and always-on workflow orchestration surfaces.
- Canonical execution profiles can now classify Codex GitHub Action, app-server, and SDK-embedded programmatic execution surfaces.
- Canonical evaluation profiles can now distinguish static projection checks from harness-native runtime evaluations and surface harness, adapter, scenario, evidence, and limitation details in preview and adapter readiness output.
- Target capability support reports now cite evaluation runtime evidence metadata for Codex and GitHub Copilot evaluation support rows.
- Target capability support reports now identify `.metaflow/packages/*.json` as the canonical package metadata surface for Codex and GitHub Copilot package-manifest rows.
- Canonical skills can now include `.metaflow/skills/<skill-id>/skill.json` structured metadata while `SKILL.md` remains the projected Codex and GitHub Copilot skill body.
- Canonical instructions and prompts can now include same-name `.json` structured metadata while Markdown remains the projected Codex and GitHub Copilot content body.

### Changed

- New workspaces start with plugin-first defaults for instructions, skills, and agents, while prompts and hooks continue to use the delivery modes currently supported by the host.
- Initializing MetaFlow now enables the bundled MetaFlow guidance automatically, so a fresh workspace has useful authoring guidance immediately after setup.
- Injection choices can now be set globally, per metadata repository, or per capability, with workspace/user scope choices for settings-backed metadata.
- Synchronized files can keep their original source-relative names when there is no naming conflict.
- Capabilities tree folder rows now report deterministic mixed-branch state: checked means all descendants enabled, while unchecked covers partial and fully disabled branches.
- Capabilities now enable or disable atomically; artifact folders under a capability are browse-only instead of partial activation toggles.
- Capabilities and Effective Files view layouts now persist in `.metaflow/state.json` instead of VS Code settings, with hierarchical Capabilities and flat Effective Files as the defaults.
- Built-in and configured repositories now behave more consistently in hierarchy, checkbox, refresh, and details workflows.

### Fixed

- Tree search and filtering are more reliable in large capability and effective-file trees.
- Plugin maintenance now avoids disturbing unrelated Copilot repository configuration, cleans up stale plugin roots during apply, and lets warning rows open the source file that needs attention.
- Capability discovery and details refreshes are more stable for missing paths, CAPABILITY-only folders, built-in capability ordering, and toggle-driven updates.

## [0.1.0] - 2026-03-03

### Added

- Starter AI metadata scaffolding command in the extension.
- Extension-shipped starter metadata templates under `src/assets/metaflow-ai-metadata/`.
- Additional unit and integration coverage for scaffolding behavior.
- Built-in MetaFlow capability mode persisted in extension workspace state with synthetic source/layer projection.
- `MetaFlow: Remove MetaFlow Capability` command for disabling built-in mode and removing tracked synchronized capability files.
- Capability Details Webview (`metaflow.openCapabilityDetails`): browse capability metadata, artifact inventory, and manifest from the tree view.
- METAFLOW.md repository manifest support for human-readable repository names and descriptions.
- YAML front-matter parser with instruction scope and `applyTo` metadata in FilesTreeView tooltips.
- `.gitignore` management prompts for MetaFlow managed state on activation.
- Git remote promotion: offer to convert local-path sources to git-backed tracking during setup.
- Repository-level copy updated to describe layered AI metadata overlays without positioning repeatability as primary marketing language.
- Settings injection for agents, skills, and hooks artifact types.

### Changed

- Minor version bump across workspace packages.
- Renamed command surface to `MetaFlow: Initialize MetaFlow Capability` with two setup paths: synchronize (overwrite managed files) and built-in settings-only mode.
- Narrowed extension activation scope to `workspaceContains:**/.metaflow/config.jsonc` only.
- Hardened refresh error handling: overlay failures surface user-visible errors, clear stale state, and guard auto-apply.
- Standardized destructive confirmation prompts with explicit action-verb labels.
- Capability discovery now persists found capabilities as disabled until explicitly enabled.

### Fixed

- Repo enable/disable toggle in Config TreeView.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`

## [0.1.0] - 2026-02-07

### Added

- Initial MetaFlow extension release with layered overlay resolution, apply/preview/clean workflows, profile/layer management, and diagnostics.

### Package Changelogs

- Extension: `src/CHANGELOG.md`
- CLI: `packages/cli/CHANGELOG.md`
- Engine: `packages/engine/CHANGELOG.md`
