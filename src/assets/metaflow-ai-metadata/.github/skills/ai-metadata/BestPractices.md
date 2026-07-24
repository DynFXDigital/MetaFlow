# AI metadata best practices

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
- Resolve referenced resources relative to the directory containing `SKILL.md`.
- Before invoking file or shell tools, resolve bundled skill resources to absolute paths from that
  skill root; do not interpret them from the consuming repository or current shell directory.

## Hooks

Sources: [GitHub about hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks), [GitHub hooks how-to](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks), [GitHub Copilot CLI hooks tutorial](https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks), [GitHub hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)

- Store hook configuration files directly under `.github/hooks/*.json`.
- Distinguish repository hooks from plugin hooks. A repository-relative bundled-script path is
  unsafe after a capability is registered as an external plugin.
- For plugin delivery, verify the selected manifest's hook discovery path, supported root token,
  emitted script location, and working-directory behavior as one contract.
- Treat `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, and `errorOccurred` as the portability baseline.
- Start with logging-first rollouts, then introduce narrow deny rules after observing real usage.
- Keep blocking and lifecycle command hooks fast, deterministic, and under 5 seconds when practical.
  Notification-style hooks may be asynchronous when the target host documents that behavior.
- Redact prompts, commands, and tool arguments before logging.

## Proactive metadata hygiene

- When working with AI metadata files, notice metadata that does not follow current guidance and proactively offer to fix it.
- Examples: deprecated `infer` instead of `user-invocable` + `disable-model-invocation`; `.chatmode.md` instead of `.agent.md`; missing `description` frontmatter; `mode` instead of `agent` in prompt files; unrestricted `agents: ["*"]` on coordinators; hard-coded external metadata paths where a soft capability reference would be more robust.
- Frame the offer as a brief observation and opt-in fix, not a blocking lecture.

## Versioning

- Last reviewed: 2026-07-23
