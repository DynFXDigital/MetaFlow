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
  agents, MCP servers, hooks, execution surfaces, local/cloud handoff, issue/PR
  operation, and evaluation support.
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

Target adapter manifests declare the adapter contract version they were reviewed
against. The declared `adapterVersion` must match the target capability matrix
before an adapter can prove current projection readiness. A missing
`adapterVersion` keeps the adapter loadable, but it remains review-warning
material until the current matrix version is declared.

Target adapters with `staticVerified`, `runtimeVerified`, or `manualWaived`
validation status need validation evidence references. Verification and waiver
claims are review-warning material when they are not tied to a run, review, or
waiver record.

## Export Review Candidates

Some target surfaces intentionally remain operator-reviewed candidates.

```bash
metaflow export-package-marketplace --target codex --format codex-marketplace
metaflow export-package-marketplace --target codex --format codex-marketplace --out .agents/plugins/marketplace.json
```

The package marketplace export converts canonical `marketplaceEntries` metadata
into Codex-shaped candidate payloads. It does not mutate host files unless an
explicit `--out` path is supplied, and existing files require `--force`.

GitHub Copilot MCP handoff is separate from Codex support, but it often appears
in the same package review because canonical MCP metadata can target multiple
harnesses:

```bash
metaflow export-copilot-mcp
metaflow export-copilot-mcp --out .vscode/mcp.json
```

Review secrets, unsupported transports, policy grants, and target warnings
before applying the handoff through the host workflow.

## Record Runtime Validation

Use `.metaflow/packages/*.json` `runtimeValidation` records for claims that
depend on a harness run. Each record identifies the target, harness, adapter
version, scenario, status, validation command, evidence references, and known
limitations.

Records with `passed` or `partial` status need evidence references. A package
can keep draft or planned validation as `not-run`, but a positive support
claim stays review-warning material until it points to concrete run evidence.

Runtime validation adapter versions must match the target capability matrix. When
MetaFlow increments a target adapter version, older evidence remains historical
but no longer proves current adapter readiness until it is rerun or explicitly
accepted as a known limitation.

Runtime validation is required for:

- Codex Cloud task execution.
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
file-backed and runtime-only Codex surfaces.
