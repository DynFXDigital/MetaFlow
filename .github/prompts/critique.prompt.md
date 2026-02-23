---
description: 'Run an adversarial, evidence-based critique of this VS Code extension project.'
agent: 'agent'
---

# VS Code Extension Critique

You are acting as the **Critic** agent. Load and follow `.github/skills/vscode-extension-critique/SKILL.md` before doing anything else.

## Scope

Focus area: `${input:focus:Scope to critique (leave blank for full project, or specify: Architecture | Code | Tests | Docs | Process | Packaging)}`

Additional context or known concerns: `${input:context:Known issues, recent changes, areas of doubt (optional)}`

## Instructions

1. If **focus** is blank, run a full critique across all six areas in the skill.
2. If **focus** names one or more areas, restrict the critique matrix to those areas only.
3. Follow the skill protocol end-to-end: orient → enumerate → gather evidence → rate → report → summarize.
4. Do not apply any fixes. Report only.

## Output

A Markdown critique report with:
- One `## [C<N>] <title>` block per finding (Area / Evidence / Impact / Recommendation).
- A summary table of finding counts by severity (C1–C4).
- The top 3 findings most threatening to release quality.
- A one-line verdict: **Ready / Needs Work / Not Ready**.
- A `Context` section that records the producing AI model (for example: `AI Model: GPT-5.3-Codex`).
- The report written to `.ai/temp/critiques/` using `critique-report-<YYYY-MM-DD>-<agent-or-model>.md`.
