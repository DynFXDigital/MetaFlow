# Capability as First-Class Term - Context

- **Last updated:** 2026-02-19
- **Status:** Planning complete - ready to execute Phase 1
- **Owner:** TBD

## Feature Overview

MetaFlow currently treats instructions, prompts, skills, and agents as artifact categories but does not yet formalize a larger cross-artifact concept. This plan introduces `Capability` as a first-class, outcome-oriented term in MetaFlow language and documentation, starting with terminology alignment and a minimal example structure in AI metadata repositories. Success means teams can describe, organize, and discuss interoperating artifact sets using a consistent vendor-neutral model without requiring immediate engine/runtime changes.

## Current Focus

1. Define canonical terminology and hierarchy (`skill -> capability -> pack`, plus `domain` classification).
2. Provide a small, concrete repository example structure that demonstrates capability grouping.
3. Align docs and naming guidance to avoid Copilot-only framing and support future multi-ecosystem expansion.

## Next Steps

- [ ] Finalize terminology glossary and normative definitions in concept docs.
- [ ] Add a minimal AI metadata repository example showing capability-centric layout.
- [ ] Add migration notes mapping current MetaFlow terms to capability-first terminology.
- [ ] Validate wording consistency across README, concept docs, and plan docs.
- [ ] Identify follow-up implementation plan for config/schema/runtime adoption.

## References

- `doc/concept/agent_capability_standard.md` - capability standard concept draft.
- `doc/concept/CONCEPT.md` - MetaFlow extension concept baseline.
- `doc/concept/metaflow_reference_architecture.md` - reference architecture context.
- `.github/instructions/plan.instructions.md` - required plan/document rules.
- `.github/prompts/plan.prompt.md` - plan creation prompt used for this plan.

## Decision Log

- **2026-02-19** - Introduce `Capability` as the first-class conceptual unit above `Skill`.
- **2026-02-19** - Keep initial scope documentation-first; defer engine/config changes to follow-up plan.
- **2026-02-19** - Use vendor-neutral naming (`Agent Capability`) for portability beyond GitHub Copilot.

## Open Questions & Risks

- Should `Pack` remain the canonical distributable term in MetaFlow CLI/UX, or be renamed in parallel with capability adoption?
- Existing docs may use overlapping terms (`metadata pack`, `copilot pack`) and create transition ambiguity.
- Without a normative adapter model, capability wording may drift across ecosystems.