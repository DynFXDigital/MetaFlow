---
description: 'Guidelines for Copilot prompt files (.github/prompts/*.prompt.md): structure, frontmatter, and best practices.'
applyTo: '.github/prompts/**/*.prompt.md'
---

# Copilot Prompt Files

Prompt files define reusable, task-specific prompts you invoke on demand (for example via `/name` in Copilot Chat, depending on IDE support).

## Scope

- Prompt files are for specific tasks (review, explain, scaffold, generate docs).
- Repository-wide behavior belongs in custom instructions, not prompt files.
- Do not add a prompt file when the desired behavior is an always-on optimization or routing cue; use a compact instruction plus a skill instead.
- Keep shared prompt files under `.github/prompts/`; user-profile prompt locations are IDE-local and should not be documented as repository contract.

## Required structure

- A `.prompt.md` file contains YAML frontmatter followed by a Markdown body.
- Common frontmatter keys:
  - `name`: optional slash-command name; otherwise the file name is used
  - `description`: short description shown in UI
  - `agent`: optional; use `ask`, `agent`, `plan`, or a custom-agent name
  - `model`: optional, environment-dependent model selection
  - `argument-hint`: optional hint for required user input
  - `tools`: optional allow-list for prompt execution
- Preferred key order:
  - Prefer `name`, then `description`.
  - When present, put `agent` and `model` next.
  - Put `argument-hint` after `agent` and `model`.
  - Put `tools` after the identity and invocation keys.

Example:

```yaml
---
name: review-code
description: Perform a comprehensive code review
agent: agent
model: GPT-5 (copilot)
argument-hint: '[scope or files to review]'
tools: ["read", "search"]
---
```

- Quote YAML values only when needed (for example to avoid parsing ambiguity).

## Tool priority

- Prompt `tools` overrides referenced agent `tools`, which overrides the selected/default agent tools.

## Inputs

- Prefer explicit inputs using `${input:name:prompt}` to avoid ambiguous assumptions.
- Keep input prompts short and unambiguous.

## Best practices

- Be explicit about output format (headings, bullets, required sections).
- Include acceptance criteria when the task produces artifacts.
- Prefer constraints that reduce rework (file locations, naming, test commands).
- Keep the prompt minimal: remove background text and repetition.

## Interactive Decision Pattern

- If a prompt depends on user input that materially affects scope, validation, routing, or next actions, tell the agent exactly when to use askQuestions rather than only naming the tool.
- Prefer wording that includes all of these behaviors:
  - trigger: required input is missing or materially ambiguous
  - batching: ask for the smallest useful set of high-impact decisions in one call
  - options: provide recommended options or defaults when possible
  - continuation: continue immediately after answers are received
  - fallback: if the tool is unavailable, ask one concise chat question
- In VS Code-oriented prompts, it is acceptable to mention the concrete host tool name `vscode_askQuestions` alongside the conceptual `askQuestions` instruction.

## Notes

- Prompt files are IDE-driven customizations; GitHub.com documentation still treats them as unavailable on the web surface.
- Availability and preview status continue to evolve by IDE, so check the current feature matrix before relying on prompt-only workflows in shared guidance.