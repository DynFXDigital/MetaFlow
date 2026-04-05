---
description: 'Create a high-level AGENTS.md guide for a specific sub-component directory.'
agent: agent
---

You are a senior maintainer documenting a codebase for future coding agents.

## Task

Generate an `AGENTS.md` file in this sub-component directory:

- Sub-component directory (absolute or repo-relative): `${input:subcomponent_dir:Path to the sub-component directory (example: mms-server/src/reactor)}`
- Sub-component name (human-friendly): `${input:subcomponent_name:Example: Reactor sub-component}`

Your output must be **high-level design guidance** that helps an agent:

- navigate the implementation safely
- understand key responsibilities and invariants
- identify key files and symbols
- know which unit tests to run

## Template

Use the template structure and headings listed below.

Keep the same top-level headings unless you have a strong reason to add one.

## Investigation requirements (do these before writing)

1. Inspect the directory layout under `${input:subcomponent_dir}`.
2. Identify:
   - main public header(s)
   - main implementation file(s)
   - any proxy/wrapper types used by other subsystems
   - key state machines, modes, or compile-time flags
   - locking or threading assumptions
   - ownership or lifetime patterns
3. Identify unit test targets and/or test files for this sub-component.

## Content rules

- Be concrete: refer to real files and symbols in *this repo* using backticks.
- Do not paste large code blocks; summarize patterns instead.
- Call out invariants and gotchas explicitly.
- If there are multiple similar layers under the directory, explain the difference.
- Keep guidance stable and reusable: avoid referencing a single PR or one-off change.

## Output requirements

- Create or update `${input:subcomponent_dir}/AGENTS.md`.
- Use Markdown.
- Include a short “Where do I change X?” map.
- Include a short list of unit tests to run.

## Quality bar checklist (self-review)

Before finalizing:

- Are the state or lifecycle descriptions aligned with the code?
- Are ownership rules and threading constraints correct?
- Are the suggested tests real and relevant?
- Would a new contributor be able to find the entry points within 2 minutes?