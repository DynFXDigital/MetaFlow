# Phase 2 - Repository Example Structure

## Objective

Provide a minimal, implementation-agnostic AI metadata repository structure that demonstrates capability grouping by domain.

## Work Items

1. Define a simple example directory layout for capability-centric organization.
2. Show how artifact types are grouped inside a capability.
3. Show how capabilities are grouped into a pack.
4. Keep examples conceptual (no engine/schema requirements in this phase).

## Example Structure (Draft)

```text
ai-metadata/
  capabilities/
    security-secure-review/
      capability.md
      instructions/
      prompts/
      skills/
      agents/
    release-quality-gate/
      capability.md
      instructions/
      prompts/
      skills/
      agents/
  packs/
    platform-engineering/
      pack.md
```

## Outputs

1. Concept doc snippet that illustrates the example layout and intent.
2. Naming guidance for capability IDs and domain prefixes.

## Acceptance Criteria

1. Example structure is understandable by a new contributor in one read.
2. The structure demonstrates multi-artifact interoperability inside a capability.
3. The structure is explicitly vendor-neutral.

## Risks

1. Overly abstract examples may fail to guide practical adoption.
2. Premature file-format assumptions may constrain future implementation.
