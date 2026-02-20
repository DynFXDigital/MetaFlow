# Capability as First-Class Term - Context

- **Last updated:** 2026-02-20
- **Status:** Phases 1-3 completed - follow-up implementation backlog documented
- **Owner:** TBD

## Feature Overview

MetaFlow currently treats instructions, prompts, skills, and agents as artifact categories but does not yet formalize a larger cross-artifact concept. This plan introduces `Capability` as a first-class, outcome-oriented term in MetaFlow language and documentation, starting with terminology alignment and a minimal example structure in AI metadata repositories used by MetaFlow. Success means teams can describe, organize, and discuss interoperating artifact sets consistently within MetaFlow without requiring immediate engine/runtime changes.

## Current Focus

1. Keep capability-first terminology stable across new documentation updates.
2. Prepare follow-up implementation planning for optional schema/engine/CLI adoption.
3. Preserve backward-compatible language in user-facing docs during migration.

## Next Steps

- [x] Finalize terminology glossary and normative definitions in concept docs.
- [x] Add a minimal AI metadata repository example showing capability-centric layout.
- [x] Add migration notes mapping current MetaFlow terms to capability-first terminology.
- [x] Validate wording consistency across README, concept docs, and plan docs.
- [x] Identify follow-up implementation plan for config/schema/runtime adoption.

## References

- `doc/concept/CONCEPT.md` - MetaFlow extension concept baseline.
- `doc/concept/metaflow_reference_architecture.md` - reference architecture context.
- `.plan/capability-first-class/Followup-Implementation-Backlog.md` - staged implementation backlog.
- `.github/instructions/plan.instructions.md` - required plan/document rules.
- `.github/prompts/plan.prompt.md` - plan creation prompt used for this plan.

## Decision Log

- **2026-02-19** - Introduce `Capability` as the first-class conceptual unit above `Skill`.
- **2026-02-19** - Keep initial scope documentation-first; defer engine/config changes to follow-up plan.
- **2026-02-19** - Use vendor-neutral naming (`Agent Capability`) for portability beyond GitHub Copilot.
- **2026-02-19** - Phase 2 adopts folder + `README.md` convention for capabilities; `CAPABILITY.md` support is explicitly deferred.
- **2026-02-20** - Added transition mapping tables to concept/reference docs to preserve backward-compatible terminology.
- **2026-02-20** - Created follow-up backlog for optional capability-aware schema/engine/CLI evolution.

## Open Questions & Risks

- Should `Pack` remain the canonical distributable term in MetaFlow CLI/UX, or be renamed in parallel with capability adoption?
- Existing docs may use overlapping terms (`metadata pack`, `copilot pack`) and create transition ambiguity.
- If capability definitions are spread across multiple docs, wording may drift without a single MetaFlow glossary source.