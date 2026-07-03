# Codex Operator Walkthrough

This walkthrough describes the operator path for reviewing and applying
MetaFlow metadata that targets Codex. It complements the support-boundary
reference by showing the commands and review decisions used in a repository.

## Review The Workspace

Start from the consuming workspace root, where `.metaflow/config.jsonc` lives.

```bash
metaflow status
metaflow status --json
```

Use status output to confirm the configured metadata repositories, enabled
capabilities, active profile, capability warnings, and resolved canonical
metadata before any files are written.

Inspect Codex support boundaries directly when reviewing a target adapter,
package, or marketplace candidate.

```bash
metaflow codex-support-boundaries
metaflow codex-support-boundaries --out reports/codex-support-boundaries.md
metaflow target-support --target codex
metaflow target-support --target codex --support runtime-only
metaflow target-support --json --target codex --concept mcpServers
```

Use the boundary report to distinguish file-backed Codex projections from
runtime-only and not-technically-projectable behavior before relying on
generated repository files. Use `target-support` when a review needs filtered
matrix rows or JSON inspection for a specific canonical concept.

## Preview Codex Adapter Output

Run preview before apply.

```bash
metaflow preview
metaflow preview --json
```

Review these sections in the preview output:

- Effective files: generated files such as `.agents/skills/**`,
  `AGENTS.md`, `.codex/config.toml`, `.codex/hooks.json`, and
  `.codex/agents/*.toml`.
- Target capability matrix: support posture for Codex concepts such as skills,
  agents, MCP servers, hooks, execution surfaces, cloud environment runtime,
  automation runtime, app connector runtime, local/cloud handoff, issue/PR operation, and
  evaluation support.
- Adapter readiness reports: action items for policy review, runtime
  configuration, package validation, and target compatibility.
- Boundary rows: runtime-only Codex behavior that repository projection cannot
  make operational by itself.
- Guarded native conflicts: unmanaged root files or native host files that
  block apply until the operator resolves ownership.

The JSON preview includes the same information for automation. Use it when a
CI job or release checklist needs to assert that a package has no unresolved
adapter warnings or support-boundary surprises.

## Review Managed Codex Files

MetaFlow writes Codex-native files only when the capability metadata and target
adapter configuration make the output managed. Candidate and report-only
outputs stay visible in preview without being written.

Typical managed Codex file surfaces are:

| Surface | Output |
| --- | --- |
| Repository skills | `.agents/skills/<skill-id>/SKILL.md` |
| Project instructions | `AGENTS.md`, `AGENTS.override.md` |
| Project config | `.codex/config.toml` |
| Custom agents | `.codex/agents/*.toml` |
| Hooks | `.codex/hooks.json` |
| Plugin manifest | `.codex-plugin/plugin.json` |
| Local plugin marketplace | `.agents/plugins/marketplace.json` |

Existing unmanaged root files block apply. Resolve ownership before forcing
any overwrite: keep the unmanaged file, move the source metadata, or explicitly
decide that MetaFlow owns the destination.

Guarded native conflicts use stronger review language than ordinary generated
file conflicts because the destination is a host-owned or root-owned file such
as `AGENTS.md`, `.codex/config.toml`, `.codex/hooks.json`,
`.agents/skills/**`, or `.github/agents/*.agent.md`. Treat each guarded
conflict as an ownership decision:

1. Keep the existing native file and leave the MetaFlow output as candidate or
   skipped output.
2. Move or narrow the source metadata so it no longer projects to the guarded
   destination.
3. Convert the destination to MetaFlow ownership only after reviewing the
   generated content, provenance, policy grants, and target adapter mode.

Do not use `--force` as a substitute for that review. Force is appropriate only
after the operator has decided that the generated file is authoritative for the
guarded destination.

Codex project config review is stricter than ordinary file projection review.
MetaFlow rejects forbidden provider, profile, notification, and telemetry keys
in canonical `.metaflow/project-config/*.json` metadata. Valid settings that
expand runtime authority remain projectable, but they produce warning-level
diagnostics and adapter-readiness action items. Review these warnings before
accepting `.codex/config.toml` output:

- `approvalPolicy=never`
- `sandboxMode=danger-full-access`
- `webSearch=live`
- `sandboxWorkspaceWrite.networkAccess=true`
- `shellEnvironmentPolicy.inherit=all`
- `shellEnvironmentPolicy.ignoreDefaultExcludes=true`

## Apply And Validate

After preview is clean for the intended changes:

```bash
metaflow apply
metaflow validate
```

`apply` writes managed files and records provenance in MetaFlow managed state.
`validate` verifies that managed files still match the expected overlay state.
Use `metaflow apply --force` only after reviewing drifted files and deciding
that the generated metadata is authoritative.

For local Codex discovery evidence, run the generated workspace through the
Codex surface being claimed. Examples include checking that generated
repository skills are visible to Codex or that Codex accepts generated MCP
configuration in the trusted project.

Prompt metadata has a narrower Codex boundary than skill metadata. Codex custom
prompts are deprecated, explicitly invoked slash-command files under the local
Codex home directory, so they are not a repository-shared projection target.
Use canonical skills for shared Codex workflows, and keep canonical prompts as
reviewable metadata unless another target consumes projected prompt files.

Custom-agent projection has a narrower proof boundary. MetaFlow can write
`.codex/agents/*.toml`, and Codex documents project-scoped custom agents as
subagent configuration layers. Installed Codex CLI 0.142.3 does not expose a
non-interactive custom-agent activation flag, and `codex debug prompt-input`
does not show repo-local custom-agent TOML as active prompt input. Treat custom
agents as projected configuration until a Codex app or CLI subagent run
explicitly spawns the named agent and demonstrates the generated instructions
in effect.

Subagent workflows have a separate runtime boundary. Codex decides and manages
spawned agent threads at runtime, including `/agent` thread state, inherited
sandbox and approval posture, live overrides, tool activity, token use, and
consolidated results. Treat those as runtime evidence, not static projection
evidence.

Codex automations have the same runtime boundary. MetaFlow can record the
intended scheduled workflow, skill usage, policy grants, and evidence
expectations, but the Codex app or host runtime owns the schedule, local versus
worktree execution mode, Triage run state, archive state, sandbox defaults,
approval behavior, and proof that the scheduled run occurred.

Target adapter manifests declare the adapter contract version they were reviewed
against. The declared `adapterVersion` must match the target capability matrix
before an adapter can prove current projection readiness. A missing
`adapterVersion` keeps the adapter loadable, but it remains review-warning
material until the current matrix version is declared.

Target adapters with `staticVerified`, `runtimeVerified`, or `manualWaived`
validation status need validation evidence references. Verification and waiver
claims are review-warning material when they are not tied to a run, review, or
waiver record.

Target adapters that mark authority-sensitive concepts as `managed` need
adapter-level `requiredPolicyGrants`. Without those grants, preview keeps the
affected files as candidate output and apply skips them.

Target adapters also compare managed concepts with the target capability matrix.
Unsupported or runtime-only concepts remain review warnings; repository
projection does not make those surfaces operational.

Memory metadata follows the same split. Canonical `.metaflow/memory/*.json`
records the intended memory boundary, retention, sharing, and policy posture.
Codex Memories are opt-in runtime state controlled by Codex settings and
per-thread controls, so a memory claim needs enabled settings, generated memory
artifact review, recall evidence, and known retention or sharing limits before
operators treat it as operational.

Evaluation metadata follows the same split. Canonical
`.metaflow/evaluation/*.json` records expected checks, evidence, limitations,
and target posture. Codex evaluation execution is a runtime activity: benchmark
tasks, reviewer-agent scoring, hosted traces, CI or cloud runs, model or agent
identity, sandbox and tool policy, artifacts, and cost or data limits require
evidence from the target harness.

## Review Migration Candidates

Use migration suggestions when a metadata repository still contains legacy or
host-native files and the operator wants a canonical `.metaflow/` migration
inventory:

```bash
metaflow migration-suggestions
metaflow migration-suggestions --json
metaflow migration-suggestions --out reports/migration-suggestions.md
metaflow migration-suggestions --json --out reports/migration-suggestions.json
```

The command is review-only. It suggests canonical paths for files such as
`CAPABILITY.md`, `AGENTS.md`, `.github/instructions/**`,
`.agents/skills/**`, `.github/skills/**`, `.codex/config.toml`, and
`.codex/hooks.json`, and it flags duplicate native and canonical copies for
operator review. It does not write canonical files, translate Codex TOML or
hook JSON automatically, or remove the original host-native files. `--out`
writes the migration inventory report only.

In VS Code, use `MetaFlow: Open Migration Suggestions Report` to open the same
inventory as an unsaved JSON document.

## Export Review Candidates

Some target surfaces intentionally remain operator-reviewed candidates.

```bash
metaflow export-package-marketplace --target codex --format codex-marketplace
metaflow export-package-marketplace --target codex --format codex-marketplace --out .agents/plugins/marketplace.json
```

The package marketplace export converts canonical `marketplaceEntries` metadata
into Codex-shaped candidate payloads. It does not mutate host files unless an
explicit `--out` path is supplied, and existing files require `--force`.

In VS Code, use `MetaFlow: Open Package Marketplace Report` to open the same
canonical package marketplace entries, Codex payload candidates, and GitHub
Copilot payload candidates as one unsaved JSON review document. This command is
review-only and does not write `.agents/plugins/marketplace.json` or
`.github/plugin/marketplace.json`.

Package and marketplace files are not plugin runtime proof. For Codex plugin
runtime evidence, record the installed plugin identity and version, enabled
state, marketplace source, app or MCP authentication state, restart or discovery
evidence, representative invocation, result, and known limitations.

GitHub Copilot MCP handoff is separate from Codex support, but it often appears
in the same package review because canonical MCP metadata can target multiple
harnesses:

```bash
metaflow export-copilot-mcp
metaflow export-copilot-mcp --out .vscode/mcp.json
metaflow export-copilot-mcp --out .vscode/mcp.json --force
```

The handoff candidate is review-first. MetaFlow reports the supported MCP
servers, required secrets, policy grants, unsupported transports, and warnings;
it does not configure GitHub Copilot or grant MCP runtime authority by itself.

Use the handoff in this order:

1. Inspect stdout or the VS Code `MetaFlow: Export GitHub Copilot MCP Handoff`
   review document.
2. Confirm every required secret and policy grant has an owner.
3. Save to `.vscode/mcp.json` only when the repository intentionally carries a
   Copilot MCP workspace setting.
4. Use `--force` only after reviewing the existing file and accepting the
   overwrite.
5. Validate in GitHub Copilot or VS Code that the MCP server starts and exposes
   the intended tools.

This handoff is not a Codex MCP projection. Codex MCP configuration remains in
`.codex/config.toml` when a Codex target adapter manages MCP output.

## Record Runtime Validation

Use `.metaflow/evaluation/*.json` evaluation profiles to describe capability
checks that apply beyond a single package. Evaluation profiles distinguish
`staticProjection` evidence from `harnessRuntime` evidence and can record the
tested harness, adapter version, scenario, validation command, evidence
references, and known limitations. `metaflow preview` and adapter readiness
reports surface those fields without executing the evaluation.

Use `.metaflow/packages/*.json` `runtimeValidation` records for claims that
depend on a harness run. Each record identifies the target, harness, adapter
version, scenario, status, validation command, target capability concepts,
evidence references, and known limitations.

Records with `passed` or `partial` status need evidence references. A package
can keep draft or planned validation as `not-run`, but a positive support
claim stays review-warning material until it points to concrete run evidence.
Every runtime validation record also needs a validation command or evidence
reference so the claim is reproducible during package review.

Runtime validation adapter versions must match the target capability matrix. When
MetaFlow increments a target adapter version, older evidence remains historical
but no longer proves current adapter readiness until it is rerun or explicitly
accepted as a known limitation.

Runtime validation concept links identify the target-support rows proven or
bounded by the evidence. Use them to review package claims against concepts such
as `packageManifests`, `remoteMcpRuntime`, `oauthMcpRuntime`, and
`sideEffectMcpRuntime`. Cloud execution claims also map to
`cloudEnvironmentRuntime` when they depend on a hosted environment, setup
script, secrets, dependency state, internet-access policy, or hosted sandbox.
Adapter readiness action items include the concept links beside the runtime
validation scenario so package evidence and target-support boundaries can be
reviewed together.

Runtime validation is required for:

- Codex Cloud task execution.
- Codex Cloud environment provisioning, setup, secrets, and internet access.
- Scheduled automation creation, local or worktree execution, Triage state,
  archive state, and run proof.
- Slack, Linear, GitHub, ChatGPT workspace, GitHub Copilot, or Agent HQ app connector installation, approval, account linking, posting policy, and task routing.
- Slack or Linear delegation.
- GitHub-triggered Codex review.
- PR feedback handling in the Codex app.
- Remote MCP server reachability.
- OAuth MCP login and callback behavior.
- Side-effecting MCP tool calls.

Static projection evidence proves generated files and guarded ownership.
Runtime validation proves that the target harness used the generated or
referenced configuration in the intended environment.

## Release Checklist

Before publishing or advertising Codex support for a package:

1. `metaflow preview` shows the expected Codex files and no unexpected guarded
   native conflicts.
2. Adapter readiness reports have no unresolved policy, package, or target
   compatibility action items for the claimed target.
3. Boundary rows are accepted as runtime-owned behavior or are backed by
   harness-native runtime validation.
4. `metaflow apply` and `metaflow validate` pass for managed file projections.
5. `export-package-marketplace` output matches the intended Codex package
   identity and source path.
6. Package `runtimeValidation` records exist for every runtime support claim.
7. The known limitations are recorded beside the validation evidence, not
   hidden in release notes.

See [Codex Support Boundaries](CODEX-SUPPORT.md) for the complete list of
file-backed and runtime-only Codex surfaces. See
[Codex Package Maintainer Guide](CODEX-PACKAGE-MAINTAINER-GUIDE.md) for the
canonical package authoring and marketplace-review contract. See
[Codex Tool Authority Guide](CODEX-TOOL-AUTHORITY-GUIDE.md) for reviewing
command, MCP, HTTP, and manual tool authority.
