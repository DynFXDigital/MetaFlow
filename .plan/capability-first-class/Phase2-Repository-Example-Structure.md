# Phase 2 - Repository Example Structure

## Objective

Provide a minimal AI metadata repository structure for MetaFlow that demonstrates capability grouping by domain.

## Work Items

1. Define a simple example directory layout for capability-centric organization.
2. Show how artifact types are grouped inside a capability.
3. Show how capabilities are grouped into a pack.
4. Keep examples conceptual and documentation-only (no engine/schema/runtime requirements in this phase).
5. Explicitly document that MetaFlow does not support `CAPABILITY.md` manifests in this phase.

## Example Structure (Draft)

```text
ai-metadata/
  capabilities/
    security-secure-review/
      README.md
      instructions/
      prompts/
      skills/
      agents/
    release-quality-gate/
      README.md
      instructions/
      prompts/
      skills/
      agents/
  packs/
    platform-engineering/
      pack.md
```

## Non-Support Note (Current Phase)

MetaFlow will not parse or require `CAPABILITY.md` in this phase. Capability identity is derived from folder naming and documentation conventions only.

If `CAPABILITY.md` is adopted later, it will be introduced in a separate implementation plan that includes schema, resolver, and backward-compatibility decisions.

## Outputs

1. Concept doc snippet that illustrates the example layout and intent.
2. Naming guidance for capability IDs and domain prefixes.
3. Clear guidance that capability manifests are deferred and out of scope for this phase.

## Acceptance Criteria

1. Example structure is understandable by a new contributor in one read.
2. The structure demonstrates multi-artifact interoperability inside a capability.
3. The structure is explicitly framed as MetaFlow-compatible and future-extensible.
4. The document unambiguously states that `CAPABILITY.md` is not currently supported.

## Risks

1. Overly abstract examples may fail to guide practical adoption.
2. Premature file-format assumptions may constrain future implementation.
