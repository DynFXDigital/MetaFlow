# Capability as First-Class Term - Implementation Plan

## Overview

This plan integrates `Capability` as a first-class MetaFlow concept by starting small: standardizing terminology and publishing an example AI metadata repository structure for MetaFlow. The initial effort is documentation-first and non-breaking. It establishes a stable conceptual model that can later drive schema, CLI, and engine evolution.

## Problem / Goal Statement

MetaFlow needs a concept larger than `skill` that can describe interoperating instructions, prompts, skills, and agents as one outcome-oriented unit. The goal is to adopt `Capability` consistently across project language and examples while avoiding immediate runtime complexity.

## Scope

### In Scope

1. Define and standardize terminology (`skill`, `capability`, `pack`, `domain`).
2. Add minimal repository structure examples for capability grouping.
3. Document migration terminology from existing pack-centric/copilot-centric language.
4. Align MetaFlow concept documentation to capability-first wording.

### Out of Scope

1. Engine behavior changes in `packages/engine`.
2. Config schema/runtime changes in `.metaflow` parsing.
3. CLI command surface changes.
4. VS Code extension UI/command behavior changes.

## Constraints

1. Maintain compatibility with current MetaFlow behavior and terminology in code paths.
2. Keep this phase documentation-only and non-breaking.
3. Keep terminology extensible for future ecosystem support while limiting this plan to MetaFlow docs and examples.
4. Prefer linking to existing architecture docs instead of duplicating design details.

## Dependencies

1. Existing concept docs in `doc/concept/`.
2. Existing plan/documentation standards in `.github/instructions/plan.instructions.md`.
3. Agreement on canonical MetaFlow terms before implementation work starts.

## Deliverables

1. `Context.md` (living status document).
2. Phase plans for terminology, example structure, and adoption guidance.
3. Updated concept references that define capability-first language.
4. Follow-up implementation backlog for schema/engine/CLI work.

## Phases

| Phase | Name | Focus | Status |
|---|---|---|---|
| 1 | Terminology Foundation | Canonical definitions and glossary alignment | Completed |
| 2 | Repository Example Structure | Minimal capability-based AI metadata layout | Completed |
| 3 | Adoption and Transition Guidance | Migration language and follow-up implementation backlog | Completed |

## Success Criteria

1. `Capability` is clearly defined and consistently used in concept/planning docs.
2. Teams can copy a minimal capability-oriented metadata repository structure.
3. Readers can map current terms to the new model without ambiguity.
4. A clear handoff exists for future schema/engine/CLI implementation planning.
