---
name: review-metadata-authoring-capability
description: Re-evaluate the GitHub Copilot metadata-authoring capability against current GitHub Copilot and VS Code documentation, then update instructions and skills to match best practices.
agent: agent
argument-hint: '[optional: specific artifact type to focus on, e.g. agents / skills / prompts / hooks]'
tools: ['read', 'search', 'edit', 'web']
---

# Review and Refresh: Metadata Authoring Capability

Use this prompt to evaluate the `capabilities/metadata-authoring/github-copilot-metadata-authoring` capability against current GitHub and VS Code documentation, surface gaps or stale guidance, and apply targeted improvements.

## Scope

Evaluate and update:

- `capabilities/metadata-authoring/github-copilot-metadata-authoring/CAPABILITY.md`
- `capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/instructions/ai-metadata-*.instructions.md`
- `capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/prompts/create-agents-md.prompt.md`
- `capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/prompts/review-metadata-authoring-capability.prompt.md`
- `capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/skills/ai-metadata/` support docs

## Authoritative Sources to Review

The canonical URL list is maintained in `.github/skills/ai-metadata/References.md`. Load that file and use the URLs listed there. Do not fetch URLs not listed in that file unless you are adding a new source (update `References.md` before using it).

## Evaluation Workflow

### Step 1: Build a discrepancy inventory

For each source URL above:

1. Fetch the current page.
2. Compare key claims against the corresponding local file.
3. Record any discrepancy as: `[file path] — [field/claim] — [current doc says X, local says Y]`.

Focus on:

- New or removed frontmatter keys
- Preview → stable transitions
- Deprecated or retired fields with compatibility handling
- Platform differences (GitHub.com vs VS Code vs CLI)
- New artifact types or workflows (for example subagents, agent teams, hooks, personal skills)
- Tool alias changes or new portable aliases

### Step 2: Prioritize findings

Classify each discrepancy:

- `P1 — Incorrect or misleading` (fix immediately)
- `P2 — Missing guidance for new feature` (add before next review)
- `P3 — Stale example or date` (update in batch)
- `Defer — Intentional divergence or not yet stable enough to document`

### Step 3: Apply updates (minimal diff)

For each P1 and P2 finding:

1. Edit only the narrowest file that owns the guidance.
2. Follow existing formatting conventions in the file.
3. Update `Last reviewed` date at the bottom of each changed file when that convention already exists.
4. Do not reformulate correct sections or add unsolicited commentary.

For P3 (dates and examples):

- Update `Last reviewed` lines.
- Refresh YAML examples to match canonical key ordering per `ai-metadata-*.instructions.md`.

### Step 4: Validation

After all edits:

1. Check that no instruction file contradicts another at the same or different scope.
2. Confirm every new frontmatter key documented in instructions appears in at least one YAML example.
3. Confirm compatibility notes match what the GitHub and VS Code docs state.
4. Run any available lint or validation checks.

## Output Contract

Produce a brief review report with:

```
## Review summary — [date]

### Sources checked
- [list of URLs and fetch status]

### Findings
| File | Finding | Priority | Action |
|---|---|---|---|
| ... | ... | P1/P2/P3/Defer | Fixed / Added / Deferred |

### Changes made
- [file]: [description of change]

### Deferred items
- [item]: [reason deferred]
```

## Guard Rails

- Do NOT rewrite correct guidance; only correct what the docs contradict.
- Do NOT add guidance for features still in private preview or with no public documentation.
- Do NOT remove deprecated-field compatibility guidance; keep it clearly labeled as compatibility handling.
- Do NOT rewrite vendor-specific capability packs as part of this prompt unless the user explicitly broadens the scope.---
  name: review-metadata-authoring-capability
  description: Re-evaluate the GitHub Copilot metadata-authoring capability against current GitHub Copilot and VS Code documentation, then update instructions and skills to match best practices.
  agent: agent
  argument-hint: '[optional: specific artifact type to focus on, e.g. agents / skills / prompts / hooks]'
  tools: ["read", "search", "edit", "web"]

---

# Review and Refresh: Metadata Authoring Capability

Use this prompt to evaluate the current GitHub Copilot metadata-authoring capability in this repository against current GitHub and VS Code documentation, surface gaps or stale guidance, and apply targeted improvements.

## Scope

Evaluate and update:

- `CAPABILITY.md`
- `.github/instructions/ai-metadata-*.instructions.md`
- `.github/prompts/create-agents-md.prompt.md`
- `.github/prompts/review-metadata-authoring-capability.prompt.md`
- `.github/skills/ai-metadata/` support docs

## Authoritative Sources to Review

The canonical URL list is maintained in `.github/skills/ai-metadata/References.md`. Load that file and use the URLs listed there. Do not fetch URLs not listed in that file unless you are adding a new source (update `References.md` before using it).

## Evaluation Workflow

### Step 1: Build a discrepancy inventory

For each source URL above:

1. Fetch the current page.
2. Compare key claims against the corresponding local file.
3. Record any discrepancy as: `[file path] — [field/claim] — [current doc says X, local says Y]`.

Focus on:

- New or removed frontmatter keys
- Preview → stable transitions
- Deprecated or retired fields with compatibility handling
- Platform differences (GitHub.com vs VS Code vs CLI)
- New artifact types or workflows (for example subagents, agent teams, hooks, personal skills)
- Tool alias changes or new portable aliases

### Step 2: Prioritize findings

Classify each discrepancy:

- `P1 — Incorrect or misleading` (fix immediately)
- `P2 — Missing guidance for new feature` (add before next review)
- `P3 — Stale example or date` (update in batch)
- `Defer — Intentional divergence or not yet stable enough to document`

### Step 3: Apply updates (minimal diff)

For each P1 and P2 finding:

1. Edit only the narrowest file that owns the guidance.
2. Follow existing formatting conventions in the file.
3. Update `Last reviewed` date at the bottom of each changed file when that convention already exists.
4. Do not reformulate correct sections or add unsolicited commentary.

For P3 (dates and examples):

- Update `Last reviewed` lines.
- Refresh YAML examples to match canonical key ordering per `ai-metadata-*.instructions.md`.

### Step 4: Validation

After all edits:

1. Check that no instruction file contradicts another at the same or different scope.
2. Confirm every new frontmatter key documented in instructions appears in at least one YAML example.
3. Confirm compatibility notes match what the GitHub and VS Code docs state.
4. Run any available lint or validation checks.

## Output Contract

Produce a brief review report with:

```
## Review summary — [date]

### Sources checked
- [list of URLs and fetch status]

### Findings
| File | Finding | Priority | Action |
|---|---|---|---|
| ... | ... | P1/P2/P3/Defer | Fixed / Added / Deferred |

### Changes made
- [file]: [description of change]

### Deferred items
- [item]: [reason deferred]
```

## Guard Rails

- Do NOT rewrite correct guidance; only correct what the docs contradict.
- Do NOT add guidance for features still in private preview or with no public documentation.
- Do NOT remove deprecated-field compatibility guidance; keep it clearly labeled as compatibility handling.
- Do NOT rewrite vendor-specific capability packs as part of this prompt unless the user explicitly broadens the scope.
