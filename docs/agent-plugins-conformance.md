# Agent Plugins v1 conformance disposition

MetaFlow can preserve existing GitHub Copilot metadata, prefer the portable Agent Plugins v1
core for new work, or audit a configured metadata inventory for v1 conformance. The disposition
controls authoring defaults and diagnostics; it does not enable automatic apply, select an
injection mode, or authorize migration.

## Configuration

Agent Plugins configuration requires compatibility version 6:

```jsonc
{
    "compatibilityVersion": 6,
    "agentPlugins": {
        "targetVersion": "1.0.0",
        "disposition": "prefer-standard",
    },
}
```

`targetVersion` is optional and currently accepts only `1.0.0`. An omitted disposition resolves
to `compatibility`.

| Disposition       | New lossless metadata                                             | Existing and host-only metadata | Conformance diagnostics |
| ----------------- | ----------------------------------------------------------------- | ------------------------------- | ----------------------- |
| `compatibility`   | Legacy GitHub Copilot packaging remains the default               | Preserved                       | No                      |
| `prefer-standard` | Prefer Skills, MCP, and strict v1 packaging when losslessly valid | Preserved                       | No                      |
| `audit-standard`  | Same standard-first preference as `prefer-standard`               | Preserved                       | Yes                     |

Use `MetaFlow: Set Agent Plugins v1 Disposition` to update the repository configuration from VS
Code. The config file remains the source of truth; there is no independent VS Code setting for
this policy.

## Portable core and client extensions

Agent Plugins v1 defines two portable component types:

- Skills at `skills/<name>/SKILL.md`
- MCP configuration at root `mcp.json`

Other agent metadata can be retained in a strict package under a reverse-domain client namespace,
but doing so does not make it portable. For GitHub Copilot, MetaFlow recognizes
`com.github.copilot/` as a conformant client extension and reports it separately from the portable
core.

| Existing GitHub Copilot surface                                                   | Strict-v1 package location                               | Classification                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `.github/skills/<name>/SKILL.md`                                                  | `skills/<name>/SKILL.md`                                 | Portable after package-path relocation  |
| `.github/prompts/*`                                                               | `com.github.copilot/prompts/*`                           | Client-specific; no portable equivalent |
| `.github/commands/*`                                                              | `com.github.copilot/commands/*`                          | Client-specific; no portable equivalent |
| `.github/instructions/*`, `.github/rules/*`, or `.github/copilot-instructions.md` | `com.github.copilot/rules/*`                             | Client-specific; no portable equivalent |
| `.github/agents/*`                                                                | `com.github.copilot/agents/*`                            | Client-specific; no portable equivalent |
| Root `hooks.json` or `.github/hooks/*`                                            | `com.github.copilot/hooks/hooks.json` and packaged files | Client-specific; no portable equivalent |

The mapping is a lossless package-path projection: file contents and Copilot semantics remain
unchanged. It describes package shape, not permission to rewrite a source repository. Prompt
files, slash commands, scoped or file-pattern instructions, custom agents, and hooks do not have
direct portable v1 equivalents. Hooks therefore continue to use GitHub Copilot semantics even in
a standard-oriented disposition.

For new authoring in `prefer-standard` or `audit-standard`, use a Skill for a reusable workflow
and MCP for a tool integration only when the activation, scope, inputs, and behavior map
losslessly. Similar content is not enough to establish equivalence.

## Preservation and explicit migration

MetaFlow does not automatically convert an existing legacy package or delete unsupported
metadata. Migration planning remains blocked until every candidate has one explicit decision:

- `keep-vendor`: retain the current host-specific artifact.
- `add-standard-alongside`: when a lossless package projection exists, propose copying the artifact
  unchanged to its strict-v1 location while retaining the legacy source. A portable semantic
  alternative still requires manual authoring and review.
- `replace-with-disclosed-loss`: when a lossless package projection exists, propose relocating it
  and removing the legacy source only after the resulting loss of legacy host discovery is
  disclosed and accepted. A semantic conversion is never inferred.

The migration planner is read-only. It reports proposed actions, destination coverage, and loss
but does not execute the rewrite, so a standard-oriented disposition is never treated as migration
consent. A suggested Skill for a prompt or command is only a possible semantic alternative; it is
not the operation produced by a package-path projection. If multiple selected sources would map to
the same package destination, the plan remains blocked until the collision is explicitly reshaped
or at least one source is kept in place.

## Manifest maintenance

`MetaFlow: Maintain Plugin Manifest (plugin.json)` and automatic plugin metadata maintenance use
the disposition as follows:

- In `compatibility`, a missing manifest is scaffolded in the legacy GitHub Copilot shape.
- In either standard-oriented mode, a missing manifest is scaffolded as strict v1 only when the
  package already contains a losslessly valid standard shape, such as root `skills/` and optional
  `mcp.json`, with no host metadata requiring reshaping.
- A proposed strict manifest is validated against the package before anything is written. Failed
  preflight leaves both the descriptor and `plugin.json` unchanged.
- An existing legacy manifest remains legacy in every mode. An existing strict-v1 manifest is
  validated and preserved; mixed or unsupported schemas are reported without cross-format
  rewriting.

## Reports and diagnostics

The extension audits all configured capability sources in enabled repositories, including package
control files and sources outside the active profile. Each namespace in `plugin.json.extensions`
is represented as a semantic item separate from the portable manifest fields, so inline and
file-backed client extensions both affect portability. Extension keys that are not recognizable
reverse-domain namespaces are preserved but count as invalid and receive an audit warning.
`MetaFlow: Status` reports the disposition, standard-conformance score, portable score, and
semantic-item count. In `audit-standard`, nonportable or incompatible entries also appear through
the normal diagnostics and Problems surfaces. Invalid strict-v1 core package controls or portable
components use error severity. Malformed client namespace keys, conformant-but-nonportable
extensions, no-equivalent artifacts, migration-review candidates, and safe relocations use warning
severity.

The CLI provides the same model:

```bash
metaflow agent-plugins report
metaflow agent-plugins report --json
metaflow agent-plugins plan-migration --json
metaflow agent-plugins plan-migration \
  --decision "repo/capability::.github/prompts/review.prompt.md=keep-vendor"
```

`status --json` and `validate --json` also include the conformance report. Human-readable status
and validation output show conformance diagnostics only in `audit-standard`. Their severity
describes the audited metadata but remains advisory to MetaFlow operations: conformance findings do
not change apply or validation exit status.

The two percentages intentionally answer different questions:

- Standard conformance includes the strict package controls, portable components, and valid client
  extensions.
- Portability includes strict package controls and the Skills/MCP portable core, but excludes each
  client-extension semantic item.

Invalid packages remain in the inspected total but count toward neither score's numerator.
