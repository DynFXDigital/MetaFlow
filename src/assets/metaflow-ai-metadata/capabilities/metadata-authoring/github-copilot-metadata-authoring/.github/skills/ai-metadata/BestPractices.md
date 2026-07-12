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
- Keep referenced resources deterministic and relative to the skill directory.

### Hooks

- Treat hooks as executable code with the agent's permissions, not as passive metadata.
- Inspect commands, validate stdin, avoid logging secrets, and set bounded timeouts.
- Prefer the shared `.github/hooks/*.json` location when portability matters.
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

- Last reviewed: 2026-07-11

## Metadata layout conventions

- Keep metadata/frontmatter keys in the canonical order defined by the corresponding instruction file for that artifact type.
- Put identity+intent keys first (for example, `name` then `description`, then execution keys like `agent` and `model`, then tool constraints).
- Keep primary metadata declarative: describe the current authoritative contract, and place migration/history notes only in dedicated compatibility or historical artifacts.
- If you include a `Last reviewed` marker, place it at the bottom of the file under a dedicated maintenance or versioning heading.

## Template, sample, and example naming

- Use `*.template.md` for canonical copy-start artifacts that define the preferred structure for future files.
- Use `*.sample.md` or `*.example.md` only for illustrative artifacts that are meant to be read, compared, or adapted loosely rather than copied as the primary starting point.
- Do not mix `template`, `sample`, and `example` naming for artifacts that serve the same role inside one capability family.
- When the artifact represents a canonical document or tracker type, prefer an uppercase basename before the suffix, for example `PLAN.template.md`, `CONTEXT.template.md`, or `BUG.template.md`.
- Keep one stable naming convention per capability family and update prompt, instruction, and skill references together when the convention changes.

## Progressive discovery and context efficiency

- Keep hot-path metadata thin: the main instruction, agent, prompt, or `SKILL.md` should carry trigger conditions, scope, and must-follow rules first.
- Treat always-on instruction files as routing and constraint layers, not as the full operating manual.
- Move long examples, edge cases, compatibility notes, and extended workflows into support docs such as `Workflow.md`, `BestPractices.md`, `Compatibility.md`, or `References.md`.
- Prefer short delegation cues such as "load the skill" or "see Compatibility.md" instead of restating the same material across multiple files.
- If a file applies automatically on most tasks, keep it especially lean and push step-by-step procedures into progressively loaded artifacts.
- When referring to optional, shared, or linked metadata capabilities, prefer soft capability-oriented wording over hard-coded external repository paths or exact skill filenames.
- Use explicit relative paths for metadata references only when the target file is part of the current repository or capability contract and is expected to exist.
- Put the highest-signal content at the top because discovery is progressive and some surfaces impose practical length limits.
- Treat repeated narrative across instructions, agents, skills, and prompts as a maintenance smell unless the duplication is intentionally part of the enforcement layer.

## Custom instructions

Sources: [GitHub custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [VS Code custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)

- Use `.github/copilot-instructions.md` for repo-wide defaults and keep it high-signal.
- Use `.github/instructions/*.instructions.md` for scoped guidance with `applyTo` globs.
- Keep instructions short and imperative; avoid contradictions between layers.
- Keep the instruction file focused on enforceable defaults and delegation cues; move deep workflow detail to a nearby skill or support doc.
- Prioritize critical constraints at the top for Copilot code review length limits.
- Prefer stable local paths and exact commands to reduce trial-and-error when the target is guaranteed to exist in the current repo.
- Prefer soft references for optional/shared metadata dependencies whose exact capability path or skill name may vary by consumer.
- In VS Code, instruction files are combined and order is not guaranteed.
- Prefer file-based instructions over settings-based instructions.

## Prompt files

Sources: [GitHub prompt files](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files), [VS Code prompt files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

- Treat prompt files as task-shaped, on-demand workflows.
- Include clear output expectations and acceptance criteria.
- Use input variables (`${input:...}`) to avoid assumptions.
- Reference instruction files instead of duplicating standards.
- Keep the prompt body lean and rely on referenced instructions, agents, or skills for reusable background detail.
- Specify tools only when necessary; remember tool priority (prompt > agent > default).
- Use `agent` metadata for prompt files. When updating an existing prompt that still uses `mode`, replace it with `agent`.

## Custom agents

Sources: [GitHub about custom agents](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-custom-agents), [GitHub custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [VS Code custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)

- Keep agent scope narrow and role-specific; avoid overlapping responsibilities.
- Use portable tool aliases where possible.
- Prefer `user-invocable` + `disable-model-invocation` to control selection behavior. Use `infer` only when documenting compatibility behavior.
- Default to hidden agents: use `user-invocable: false` unless the agent is a deliberate top-level entry point for humans.
- Keep the user-visible picker small and curated. Prefer a few coordinator agents or prompt entry points over many specialist agents.
- Capability-pack stewards, workers, and niche review agents should usually be system-only and omitted from the picker.
- Document environment caveats.
- Keep prompts under 30,000 characters and avoid cross-layer conflicts.
- Keep the agent body focused on role, delegation boundary, and output contract; move long procedures and examples into skills or nearby support docs.
- Use `.agent.md` for custom agent files. When maintaining an existing `.chatmode.md` file, rename it to `.agent.md`.
- `metadata` is an optional annotation object; not consumed by VS Code or IDE agents.

## Agent teams

Sources: [VS Code subagents](https://code.visualstudio.com/docs/copilot/agents/subagents), [VS Code planning with agents](https://code.visualstudio.com/docs/copilot/agents/planning)

- Structure multi-agent capabilities as coordinator-worker teams.
- Restrict the coordinator's subagent pool with `agents: ["Worker1", "Worker2"]`. Avoid `agents: ["*"]`.
- Use protected workers (`user-invocable: false` + `disable-model-invocation: true`) for agents that should only be invoked by their coordinator.
- When a workflow needs human entry points, expose the coordinator and hide the workers.
- Define an explicit output contract between coordinator and workers.
- Use handoff chains (`handoffs:` frontmatter) for sequential user-guided workflows. Note: handoffs are VS Code-only.
- Prefer artifact-based communication over ephemeral chat for inter-agent coordination.
- Keep agent prompt bodies thin and delegate detailed workflows to skill files.

## Agent skills

Sources: [GitHub about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)

- Use skills for specialized, repeatable workflows; keep instructions for broad defaults.
- Keep skill names lowercase and hyphenated; ensure descriptions are specific and action-oriented.
- Keep `SKILL.md` front-loaded with trigger conditions, scope, and the core workflow.
- Include scripts or examples only when needed and keep them deterministic.
- Use `user-invocable` and `disable-model-invocation` in skill frontmatter when you need explicit slash-command visibility or auto-load control.

## Hooks

Sources: [GitHub about hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks), [GitHub hooks how-to](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), [GitHub Copilot CLI hooks tutorial](https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks), [GitHub hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration)

- Store hook configuration files directly under `.github/hooks/*.json`.
- Treat `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred` as the portability baseline.
- Start with logging-first rollouts, then introduce narrow deny rules after observing real usage.
- Keep hooks synchronous, deterministic, and under 5 seconds when practical.
- Redact prompts, commands, and tool arguments before logging.

## Proactive metadata hygiene

- When working with AI metadata files, notice metadata that does not follow current guidance and proactively offer to fix it.
- Examples: deprecated `infer` instead of `user-invocable` + `disable-model-invocation`; `.chatmode.md` instead of `.agent.md`; missing `description` frontmatter; `mode` instead of `agent` in prompt files; unrestricted `agents: ["*"]` on coordinators; hard-coded external metadata paths where a soft capability reference would be more robust.
- Frame the offer as a brief observation and opt-in fix, not a blocking lecture.

## Versioning

- Last reviewed: 2026-03-26
