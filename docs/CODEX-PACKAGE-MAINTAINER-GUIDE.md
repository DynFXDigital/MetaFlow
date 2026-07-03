# Codex Package Maintainer Guide

This guide describes how a package maintainer publishes Codex-compatible
metadata from canonical MetaFlow package definitions while keeping runtime
authority and marketplace claims reviewable.

Use this guide with [Codex Support Boundaries](CODEX-SUPPORT.md) and
[Codex Operator Walkthrough](CODEX-OPERATOR-WALKTHROUGH.md). Use
[Codex Tool Authority Guide](CODEX-TOOL-AUTHORITY-GUIDE.md) for package
components that reference command, MCP, HTTP, or manual tools.

## Maintainer Contract

A Codex package claim is publishable when the package has all of the following:

1. Canonical package metadata under `.metaflow/packages/*.json`.
2. Target declarations for each supported harness.
3. Marketplace display intent for each catalog output.
4. Policy grants for authority-sensitive package components.
5. Runtime validation records for every harness behavior that static files do
   not prove.
6. Exported marketplace payloads reviewed by an operator.

Static projection support proves that MetaFlow can generate the files. Runtime
validation proves that Codex or another harness actually used the package in
the claimed environment.

## Canonical Package Shape

Package metadata lives in `.metaflow/packages/<package-id>.json`.

```json
{
  "schemaVersion": "metaflow.package/v1",
  "id": "release-operations",
  "name": "Release Operations",
  "kind": "agent-plugin",
  "description": "Release workflow package.",
  "agents": ["release-steward"],
  "skills": ["release-readiness"],
  "instructions": ["release-policy"],
  "prompts": ["release-prompt"],
  "mcpServers": ["github"],
  "tools": ["create-pr"],
  "hooks": ["release-gate"],
  "policyGrants": ["github-pr-read"],
  "targets": {
    "codex": {
      "pluginName": "release-operations",
      "enabled": true
    },
    "github-copilot": {
      "pluginName": "release-operations",
      "enabled": true
    }
  },
  "marketplaceEntries": [
    {
      "target": "codex",
      "packageName": "release-operations",
      "title": "Release Operations",
      "summary": "Release workflow package.",
      "publisher": "DynFX",
      "categories": ["release"],
      "keywords": ["codex", "release"],
      "url": "https://example.test/release-operations"
    }
  ],
  "validationEvidence": ["RUN-055"],
  "runtimeValidation": [
    {
      "target": "codex",
      "harness": "Codex CLI",
      "adapterVersion": "codex-v0.1",
      "scenario": "Generated package appears in local Codex plugin marketplace.",
      "status": "passed",
      "command": "codex plugin list",
      "concepts": ["packageManifests", "sideEffectMcpRuntime"],
      "evidence": ["RUN-056"],
      "evidenceArtifacts": [
        {
          "kind": "report",
          "ref": "doc/ftr/2026-07-03-run-056-package-runtime-ftr.md",
          "description": "Runtime validation report."
        },
        {
          "kind": "log",
          "ref": "artifacts/codex-plugin-list.json"
        }
      ],
      "limitations": ["Cloud task installation is not represented by static files."]
    }
  ]
}
```

The component arrays reference canonical component IDs from the same
capability. References that point to missing agents, skills, instructions,
prompts, MCP servers, tools, hooks, or policy grants remain validation
warnings.

## Target Declarations

Use `targets.<target>` to declare the harness-specific package name and whether
the package is enabled for that target.

Supported target IDs include:

| Target | Use |
| --- | --- |
| `codex` | Codex plugin manifest and local marketplace candidate output. |
| `github-copilot` | GitHub Copilot plugin and marketplace candidate output. |

Target declarations are package intent. Target adapter manifests still control
which generated files are managed, candidate, report-only, or disabled.

## Marketplace Entries

Use `marketplaceEntries` for display metadata that a host catalog can consume.

Each entry may include:

- `target`
- `packageName`
- `title`
- `summary`
- `publisher`
- `categories`
- `keywords`
- `url`

Export review candidates from the consuming workspace:

```bash
metaflow export-package-marketplace --target codex
metaflow export-package-marketplace --target codex --format codex-marketplace
metaflow export-package-marketplace --target codex --format codex-marketplace --out .agents/plugins/marketplace.json
```

Existing output files are protected unless `--force` is supplied. Use `--force`
only after reviewing the existing marketplace file and accepting the overwrite.

In VS Code, `MetaFlow: Open Package Marketplace Report` opens the same canonical
package entries plus Codex and GitHub Copilot payload candidates as one
review-only JSON document.

For Codex, the marketplace `source.path` points at the capability directory
that contains the package. MetaFlow does not create a separate
`plugins/<name>` bundle for this workflow. A Codex-ready package source root
contains `.codex-plugin/plugin.json` alongside the capability metadata and any
Codex-native assets such as `.agents/skills/**`. Marketplace reports warn when
a Codex entry points at a source root that lacks `.codex-plugin/plugin.json`.

## Runtime Validation Records

Use `runtimeValidation` for claims that depend on a harness run.

Each record includes:

| Field | Meaning |
| --- | --- |
| `target` | Target harness family, such as `codex`. |
| `harness` | Human-readable tested surface, such as `Codex CLI`. |
| `adapterVersion` | Target adapter contract used during validation. |
| `scenario` | Behavior proven by the run. |
| `status` | `passed`, `partial`, `failed`, or `not-run`. |
| `command` | Optional command or procedure used for validation. |
| `concepts` | Target capability matrix concepts validated or bounded by the run. |
| `evidence` | Run IDs, file paths, or external evidence references. |
| `evidenceArtifacts` | Structured evidence artifacts with `kind`, `ref`, and optional `description`. Supported kinds are `log`, `report`, `screenshot`, `trace`, `recording`, `artifact`, `url`, `run`, and `other`. |
| `limitations` | Known gaps that remain after validation. |

Positive support claims need evidence. Records with `passed` or `partial`
status warn when evidence is missing. Every record also needs either `command`
or `evidence` so the claim is reproducible during package review.

Use `evidence` for compact references and `evidenceArtifacts` when package
reviewers need artifact type and description preserved through preview,
adapter readiness, and marketplace reports.

Concept links connect package evidence to target support concepts such as
`packageManifests`, `remoteMcpRuntime`, `oauthMcpRuntime`, and
`sideEffectMcpRuntime`. Unknown concept IDs remain diagnostics so package
reviews use the same vocabulary as `metaflow target-support`. Concept links are
also included in adapter readiness output, and concept links that are unsupported
for the selected target remain package diagnostics.

Positive `passed` or `partial` records that link runtime-only target concepts
such as `issuePrOperation`, `remoteMcpRuntime`, or `oauthMcpRuntime` need
structured `evidenceArtifacts` for package review. Records without structured
artifacts remain compatible, but package readiness and marketplace reports emit
`PACKAGE_RUNTIME_VALIDATION_EVIDENCE_ARTIFACT_RECOMMENDED`.

Runtime validation is required for:

- Codex Cloud tasks.
- Slack or Linear delegation.
- GitHub-triggered Codex review.
- PR feedback handling in the Codex app.
- Remote MCP reachability.
- OAuth MCP login and callback behavior.
- Side-effecting MCP tool calls.

These behaviors are not technically achievable by repository projection alone.
They require harness-native runs and operator or administrator authority.

## Policy Grants

Packages that group MCP servers, tools, hooks, execution profiles, memory
scopes, issue/PR workflows, or channel integrations need policy grants before
their runtime claims are treated as operational.

Execution profiles classify where a package expects work to run, including local
workstations, dev containers, cloud sandboxes, CI runners, long-running VMs,
issue/PR-native workflows, and always-on workflow orchestration. The profile
classification does not create those runtimes or grant their authority.

Package-level `policyGrants` identify the authority required by the package.
Target adapter `requiredPolicyGrants` identify the authority required before
authority-sensitive outputs are managed for a harness.

If a package uses authority-sensitive components without matching policy
metadata, MetaFlow keeps the claim review-visible instead of silently treating
the package as operational.

## Review Checklist

Before publishing a Codex package or marketplace candidate:

1. `metaflow preview` shows the expected package, target adapter, and
   marketplace metadata.
2. `metaflow target-support --target codex` shows no unexpected unsupported or
   runtime-only rows for the package claim.
3. `metaflow codex-support-boundaries` lists any runtime-only claim as an
   accepted limitation or points to runtime validation evidence.
4. `metaflow export-package-marketplace --target codex --format codex-marketplace`
   matches the intended package identity, publisher, source, and component
   scope.
5. Runtime validation records exist for every cloud, channel, review, remote
   MCP, OAuth MCP, or side-effecting tool claim.
6. Policy grants identify the authority owner for every external system,
   credential, network, memory, or write-capable tool path.
7. Known limitations are recorded in `runtimeValidation.limitations`, not only
   in release notes.
