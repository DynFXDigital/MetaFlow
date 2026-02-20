# Phase 1 - Terminology Foundation

## Objective

Define a canonical terminology set so `Capability` is unambiguous and usable as a first-class MetaFlow concept.

## Work Items

1. Define normative terms:
   - `skill`: focused reusable tactic.
   - `capability`: interoperating set of artifacts delivering one outcome.
   - `pack`: distributable bundle containing one or more capabilities.
   - `domain`: classification axis used to group capabilities.
2. Add/align glossary references in concept documentation.
3. Document preferred naming guidance for vendor-neutral usage (`Agent Capability`).
4. Add anti-ambiguity notes for terms that currently overlap (`copilot pack`, `metadata pack`).
5. Document current convention boundary: capability identity is folder/README-based, not `CAPABILITY.md`-based.

## Outputs

1. Updated conceptual definitions in MetaFlow concept docs (starting with `doc/concept/CONCEPT.md` and linked docs as needed).
2. A short terminology mapping table from current terms to target terms.

## Acceptance Criteria

1. All four canonical terms are defined once and referenced consistently.
2. No conflicting definitions across concept docs.
3. Terminology mapping is explicit and reviewable.
4. Terminology guidance explicitly states `CAPABILITY.md` is deferred.

## Risks

1. Terminology churn may confuse readers if transition guidance is not clear.
2. Overloading `pack` and `capability` may persist without strong examples.
