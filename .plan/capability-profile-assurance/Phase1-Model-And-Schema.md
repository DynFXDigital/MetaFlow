# Phase 1 - Model and Schema Foundation

## Objective

Define a precise, implementation-ready taxonomy and schema set for control objectives, capabilities, skills, evidence contracts, and profiles.

## Work Items

1. Define canonical terms and non-overlap rules:
   - `control objective`
   - `capability`
   - `skill`
   - `evidence contract`
   - `gate`
   - `profile`
2. Define capability contract structure:
   - intent (normative shall statements)
   - scope/applicability rules
   - agent behavior bindings
   - allowed tools/trust boundaries
   - evidence contract references
   - gate/review requirements
3. Define profile schema with dual-axis composition (`maturity`, `criticality`, optional `domain`).
4. Define evidence contract schema:
   - required artifacts
   - required trace links
   - required logs/results
   - exception/deviation model
5. Define schema validation approach and sample metadata examples.

## Outputs

1. Draft schema definitions and examples for objective/capability/profile/evidence.
2. Canonical vocabulary table for docs and implementation.
3. Initial capability inventory aligned to proposed backbone.

## Acceptance Criteria

1. All model terms are unambiguous and non-overlapping.
2. A reviewer can validate capability/profile metadata against schema.
3. Example profile composition resolves required capabilities deterministically.
4. Skill naming guidance is noun-based and reusable.

## Risks

1. Taxonomy overlap may cause ambiguous ownership boundaries.
2. Overly rigid schemas may slow low-criticality adoption.
