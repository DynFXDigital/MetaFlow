# Codex Tool Authority Guide

This guide describes how MetaFlow models callable tools for Codex-compatible
packages without granting runtime authority by static metadata alone.

Tool metadata is intentionally descriptive. It lets package authors and
operators review what a tool would need, which policy grants apply, and which
runtime evidence proves the target harness can use it.

## Canonical Tool Shape

Tool metadata lives in `.metaflow/tools/<tool-id>.json`.

```json
{
  "schemaVersion": "metaflow.tool/v1",
  "id": "github-create-pr",
  "kind": "mcp",
  "mcpServer": "github",
  "mcpTool": "create_pull_request",
  "policyGrants": ["github-pr-write"],
  "targets": ["codex", "github-copilot"],
  "executionProfiles": ["local"],
  "description": "Create a pull request through the configured GitHub MCP server."
}
```

Supported tool kinds are:

| Kind | Required fields | Meaning |
| --- | --- | --- |
| `command` | `command` | A local command tool that requires shell/sandbox review. |
| `mcp` | `mcpServer`, `mcpTool` | A tool exposed by a canonical MCP server. |
| `http` | `endpoint` | An HTTP tool that requires network and credential review. |
| `manual` | none | A manually executed procedure or review step. |

Optional fields include:

- `args`
- `policyGrants`
- `targets`
- `executionProfiles`
- `inputSchema`
- `description`

## Authority Boundary

MetaFlow tool manifests do not make tools callable in Codex. They describe the
tool surface and the authority needed before a harness should use it.

Treat these as separate decisions:

| Decision | Owner |
| --- | --- |
| Tool intent and metadata | Package maintainer |
| Policy grant declaration | Capability or package maintainer |
| Sandbox, network, credential, and approval settings | Operator or target adapter owner |
| MCP server startup, login, and tool listing | Target harness runtime |
| Side-effecting tool call evidence | Runtime validation record |

A package that references a tool can be statically projected, but it is not
operational until the matching Codex runtime has the MCP server, command,
network path, credentials, and approval policy configured.

## Policy Grants

Use `policyGrants` to name the authority required by the tool. Examples:

- `shell-test`
- `github-pr-read`
- `github-pr-write`
- `network-docs-read`
- `external-issue-write`

The grant IDs must match canonical `.metaflow/policies/*.json` entries when
the package defines policy grants. Unknown policy grants remain validation
warnings because operators cannot review or approve unnamed authority.

## Target And Execution Scope

Use `targets` to identify the harnesses where the tool is intended to be
available. Use `executionProfiles` to identify the expected execution surface,
such as local workstation, dev container, CI, or cloud sandbox.

These fields do not configure Codex by themselves. Codex command execution,
MCP configuration, network access, and approvals remain runtime configuration.

## Runtime Validation

Runtime validation is required before advertising that Codex can use a tool in
an environment.

Record tool evidence in the package `runtimeValidation` section when the tool
is part of a package claim. A useful validation record proves:

1. Codex loaded the intended project or package metadata.
2. Codex started or reached the required MCP server, command, or HTTP endpoint.
3. Codex listed or selected the intended tool.
4. The approval behavior matched the policy.
5. At least one safe target call completed in the intended environment.
6. Known limitations are recorded beside the evidence.

Side-effecting tools require stronger evidence than read-only tools. Use a
safe fixture, sandbox, dry-run mode, or explicitly bounded target whenever
possible.

## Review Checklist

Before treating a Codex tool claim as operational:

1. `.metaflow/tools/<tool-id>.json` parses without validation errors.
2. Every referenced policy grant exists and has an authority owner.
3. The target support matrix marks `tools` as partial or supported for the
   claimed target, and the remaining boundary is accepted.
4. The target adapter does not mark authority-sensitive tool output as managed
   without required policy grants.
5. The package runtime validation record points to current adapter evidence.
6. Remote, OAuth, network, credential, and side-effecting behavior has
   harness-native proof.

## Static Projection Limit

Repository projection can describe a tool and can project related MCP or
project configuration where supported. It cannot authenticate accounts, install
connectors, grant credentials, approve tool calls, or prove side effects.

Those outcomes are runtime-owned and must be recorded as validation evidence.
