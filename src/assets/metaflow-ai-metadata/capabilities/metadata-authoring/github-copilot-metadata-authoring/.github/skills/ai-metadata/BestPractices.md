# AI metadata review checklist

Use this checklist after a first draft exists. Current Copilot generators usually provide valid
filenames and frontmatter; this document focuses on the design choices they cannot reliably infer
from syntax alone.

## Choose the smallest surface

| Surface                                  | Use it for                                             | Review question                                        |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `copilot-instructions.md` or `AGENTS.md` | Stable repository-wide rules                           | Does this truly apply to nearly every task?            |
| `.instructions.md`                       | Rules scoped to a path or file type                    | Is `applyTo` narrower than the repository?             |
| `.prompt.md`                             | A repeatable, user-invoked task                        | Does it have clear inputs and acceptance criteria?     |
| `SKILL.md`                               | A specialized workflow with optional resources         | Can the procedure load on demand instead of always?    |
| `.agent.md` or agent profile             | A distinct role, tool boundary, or delegation contract | Is the role narrow and are its tools least-privileged? |
| `.github/hooks/*.json`                   | Deterministic lifecycle automation or enforcement      | Is executable behavior necessary and reviewed?         |
| agent plugin manifest                    | Distributable skills, agents, hooks, MCP, or LSP        | Do format, discovery paths, and root tokens agree?      |

Do not add metadata merely because a format exists. Prefer one authoritative surface over several
copies of the same rule.

## Scope and context

- Treat generated metadata as a draft and verify its purpose, owning surface, and target hosts.
- Use the narrowest repository path, `applyTo` glob, invocation mode, or agent boundary that works.
- Avoid exact global scopes such as `applyTo: "**"` unless the rule is intentionally universal and
  the cost has been considered.
- Put trigger conditions, scope, precedence, and must-follow rules near the top.
- Move examples, edge cases, compatibility notes, and long procedures into linked support files.
- Remove generic advice that Copilot already knows unless it prevents a repository-specific failure.
- Keep duplicated narrative to an intentional enforcement minimum.

## Artifact-specific checks

### Instructions

- Keep repository-wide instructions high-signal and enforceable.
- Use path-specific instructions for language, framework, test, or directory conventions.
- Do not rely on instruction ordering; avoid conflicts because relevant instruction files are combined.
- Prefer file-based instructions over deprecated settings-based generation instructions.

### Prompts

- State the task, expected output, and acceptance criteria.
- Use input variables instead of guessing high-impact values.
- Reference shared instructions or skills instead of copying them into every prompt.
- Use `agent` for prompt routing; treat older `mode` fields as compatibility input to review.

### Agents and subagents

- Keep roles narrow and make the output contract explicit.
- Use `user-invocable: false` for internal workers and `disable-model-invocation: true` when an
  agent must not be selected automatically.
- Prefer an explicit coordinator pool over unrestricted `agents: ["*"]`.
- Expose only the tools and MCP servers the role needs.
- Keep handoffs and `agents` lists explicitly labeled as VS Code-specific behavior.

### Skills

- Keep `SKILL.md` front-loaded with trigger conditions, scope, and the core workflow.
- Use lowercase, hyphenated skill names that match the parent directory.
- Add scripts, examples, and resources only when they materially improve repeatability.
- Keep referenced resources deterministic and relative to the directory containing `SKILL.md`.
- Before invoking file or shell tools, resolve bundled skill resources to absolute paths from that
  skill root; do not interpret them from the consuming repository or current shell directory.

### Hooks

- Treat hooks as executable code with the agent's permissions, not as passive metadata.
- Inspect commands, validate stdin, avoid logging secrets, and set bounded timeouts.
- Distinguish repository hooks under `.github/hooks/*.json` from plugin hooks. A repository-relative
  bundled-script path is unsafe after the capability is registered as an external plugin.
- For plugin delivery, verify the selected manifest's hook discovery path, supported root token,
  emitted script location, and working-directory behavior as one contract.
- Use OS-specific commands only when the command cannot be made cross-platform.
- Test blocking, failure, and output behavior before enabling enforcement.

## Compatibility and promotion

- Check [Compatibility.md](./Compatibility.md) before claiming support across VS Code, GitHub.com,
  or Copilot CLI.
- Label preview-only behavior and distinguish a shared filename from shared semantics.
- Validate frontmatter, paths, referenced files, plugin manifests, and hook JSON before promotion.
- Run a representative task and inspect the resulting behavior when the metadata changes agent
  selection, tool use, file edits, or other user-visible behavior.
- Promote only when the purpose, scope, permissions, supported hosts, validation evidence, and
  maintenance owner are clear.

## Proactive hygiene

When a draft has a concrete issue, offer a focused fix: excessive scope, duplicated rules, stale
frontmatter, unrestricted tools, unsupported host claims, unsafe hooks, or missing validation. Do
not turn stylistic preferences into blocking findings.

## Versioning

- Last reviewed: 2026-07-24
