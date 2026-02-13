# AI Metadata Overlay Sync System
## Reference Architecture (CLI‑First)

---

## Purpose

This document defines a **reference architecture** for an AI metadata management and synchronization system designed to support GitHub Copilot and agent-based workflows at scale.

The system enables:

- Centralized AI metadata managed in a **separate canonical repository**
- **Hierarchical overlays** (company → department → team → product → repo)
- **Selective realization** of metadata into `.github/` only when required
- Safe experimentation without permanently polluting repositories
- Governance via **standard git workflows (branches + PRs)**
- Full transparency through deterministic rendering

This artifact is intended to be handed directly to an engineer implementing a **CLI-only version** of the system.

---

## Core Constraints

### GitHub Copilot Discovery Rules

Copilot artifact types differ in their ability to load from alternate locations:

| Artifact Type | Alternate Path Support | Notes |
|---------------|------------------------|------|
| Instructions | Yes | Configurable via VS Code settings |
| Prompts | Yes | Same as above |
| Skills | No | Must reside under `.github/` |
| Custom Agents | No | Must reside under `.github/` |

**Implication:**

The system must support a **hybrid realization model**:

- Live-referenced metadata where supported
- Materialized metadata where required

---

## High-Level Architecture

```
ai-metadata (canonical repo)
│
├─ company/
├─ department/
├─ team/
├─ product/
└─ repo-overrides/
        ↓
  local git clone
        ↓
repo/
├─ .github/        (materialized outputs)
└─ .ai-sync.json    (composition recipe)
```

Key principle:

> The canonical metadata repository is never modified directly.
> All edits occur in a local clone and are promoted via pull requests.

---

## Overlay Model

### Layer Order (low → high specificity)

1. Company
2. Department
3. Team
4. Product
5. Repo override

Later layers override earlier layers.

This mirrors real organizational policy flow and prevents ambiguity.

---

## Separation of Concerns

The system strictly separates three independent concepts.

### 1. Composition

Defines **which layers apply**.

```json
layers: [
  "company/core",
  "department/protection",
  "team/relay",
  "product/central-pcs"
]
```

Composition determines the candidate metadata set.

---

### 2. Filtering

Defines **which elements within those layers are allowed**.

Path-based filtering (initial implementation):

```json
include:
  - "instructions/**"
  - "prompts/**"

exclude:
  - "agents/experimental/**"
```

Rules:

- Higher-specificity layers override lower ones
- Explicit exclude wins unless re-included at higher specificity

Filtering applies before realization.

---

### 3. Activation

Controls **what is currently active**.

Implemented using named profiles.

```json
profiles:
  baseline:
    enable: ["*"]

  lean:
    disable: ["agents/**"]

  experiment-A:
    enable: ["agents/new-*"]

activeProfile: "baseline"
```

Profiles enable reversible experimentation without modifying overlays.

---

## Hybrid Realization Strategy

### Live-Referenced Metadata

Used when Copilot supports alternate locations:

- Instructions
- Prompts

These are referenced directly from the local metadata clone, e.g.:

```
.ai/ai-metadata/<resolved-path>
```

Benefits:

- No duplication
- Immediate iteration
- No drift

---

### Materialized Metadata

Required when Copilot enforces `.github/` locations:

- Skills
- Custom Agents

These are treated as **build artifacts**, not sources of truth.

---

## Rendering Rules

### Render Target

- Render only where Copilot requires `.github/`
- Delete all previously managed files before re-render
- Re-render deterministically from recipe

---

### File Identification

All materialized files use a fixed prefix:

```
_shared_<name>.md
```

Purpose:

- Avoid name collisions
- Enable deterministic cleanup
- Make synced artifacts obvious

Prefixing is mechanical, not semantic.

---

## Provenance and Traceability

Each rendered file must include machine-readable provenance.

Recommended format: HTML comment header.

```text
<!--
synced: true
source-repo: ai-metadata
source-commit: 8f31c2a
scope: company.department.team.product
layers: [company, department, team, product]
profile: baseline
-->
```

Enables:

- Auditing
- Debugging behavior changes
- Drift detection
- Safe promotion workflows

---

## Editing and Promotion Workflow

### Local Editing Detection

If a rendered file is modified locally:

- CLI compares provenance and content hash
- User must explicitly choose an action

Options:

1. Discard and re-render
2. Save as repo override
3. Promote to shared layer

---

### Promotion Model

Promotion is **explicit and scoped**.

Workflow:

1. Write change into appropriate layer directory in local metadata clone
2. Create git branch
3. Commit change
4. Optionally open PR

No automatic upstream mutation is permitted.

---

## Repository Configuration File

A single repo-local file defines the realization recipe.

Example: `.ai-sync.json`

```json
{
  "metadataRepo": {
    "url": "git@github.com:org/ai-metadata.git",
    "commit": "8f31c2a"
  },
  "layers": [
    "company/core",
    "department/protection",
    "team/relay",
    "product/central-pcs"
  ],
  "filters": {
    "include": ["**"],
    "exclude": ["agents/experimental/**"]
  },
  "profiles": {
    "baseline": {},
    "lean": {
      "disable": ["agents/**"]
    }
  },
  "activeProfile": "baseline"
}
```

This file must be sufficient to fully reproduce the effective state.

---

## CLI Responsibilities

### Commands

- `sync preview` — show effective tree and diffs
- `sync apply` — render required artifacts
- `sync clean` — remove managed outputs
- `sync status` — show layers, profile, commit
- `sync profile set <name>`
- `sync promote` — guided promotion workflow

---

### Internal Engine Responsibilities

- Overlay resolution
- Filter evaluation
- Profile activation
- Deterministic rendering
- Provenance injection
- Git operations (branch / commit / PR)

No server-side services are required.

---

## Determinism Guarantees

The system must guarantee:

- Same metadata commit + same config ⇒ identical outputs
- Re-render is always safe
- Managed files are fully regenerable
- No hidden mutable state

These guarantees are essential for trust and adoption.

---

## Future Extensions (Non‑Blocking)

- VS Code extension UI on top of same engine
- Upstream Copilot PRs for alternate skill/agent paths
- Metadata manifests and tagging
- CI policy validation
- Organization-wide enforcement

---

## Summary

This architecture treats AI metadata as **compiled configuration**, not handwritten repo content.

It is:

- Git-native
- Deterministic
- Transparent
- Governable
- Experiment-friendly
- Compatible with current Copilot constraints
- Forward-compatible with future Copilot capabilities

The CLI implementation should focus on correctness and determinism first.
The VS Code extension becomes a UX layer on top of the same engine.

---

**End of Reference Artifact**

