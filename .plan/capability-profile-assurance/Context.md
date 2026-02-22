# Capability-Profile Assurance Model - Context

- **Last updated:** 2026-02-21
- **Status:** Kickoff - architecture and phased rollout defined
- **Owner:** TBD (MetaFlow architecture owner)

## Feature Overview

MetaFlow needs a formal, reusable structure for scaling development rigor from low-friction projects to high-assurance systems without changing core abstractions. This plan defines a policy-and-assurance model that keeps `capabilities` and `profiles` as primary units while adding explicit control objectives, evidence contracts, and verification gates so CI enforcement and human auditability are deterministic. Success means a pull request can be evaluated from diff + tags + profile resolution and produce actionable, machine-checkable pass/fail outcomes with traceable evidence.

## Current Focus

1. Define normative model elements and boundaries (`control objective`, `capability`, `skill`, `profile`, `evidence contract`, `gate`).
2. Establish profile composition across maturity and criticality axes.
3. Plan CI policy closure and provenance capture integration points.

## Next Steps

- [ ] Finalize core schema for objectives, capabilities, profiles, and evidence contracts.
- [ ] Define deterministic profile resolution rules from path/component metadata.
- [ ] Define capability contracts including scope, tool policy, evidence, and gate requirements.
- [ ] Specify CI enforcement pipeline (policy closure, evidence validation, gate results).
- [ ] Define safety/regulated overlays for high-criticality and domain-specific requirements.

## References

- `.plan/capability-profile-assurance/README.md` - full plan and architecture.
- `.plan/capability-profile-assurance/Phase1-Model-And-Schema.md` - taxonomy and schema foundations.
- `.plan/capability-profile-assurance/Phase2-Resolution-And-Enforcement.md` - profile closure and CI gates.
- `.plan/capability-profile-assurance/Phase3-Provenance-And-High-Criticality.md` - MCP/tool trust and high-rigor overlays.
- `.plan/capability-profile-assurance/Evaluation-Rubric-And-Gap-Checklist.md` - rubric and implementation gap checklist.
- `doc/concept/metaflow_reference_architecture.md` - capability terminology context.
- `.plan/capability-first-class/README.md` - prior terminology foundation.
- `.github/instructions/plan.instructions.md` - required planning format rules.

## Decision Log

- **2026-02-21** - Keep `capability` and `profile` as core primitives; do not replace with a new top-level abstraction.
- **2026-02-21** - Model `skills` as reusable noun-based disciplines within capabilities, not action verbs.
- **2026-02-21** - Separate `verification` and `validation` as distinct capabilities with different objectives and evidence.
- **2026-02-21** - Adopt dual-axis profile composition (`maturity`, `criticality`) with optional domain overlays.
- **2026-02-21** - Treat agent instructions as guidance and CI/review gates as enforcement boundary.

## Open Questions & Risks

- Should profile metadata live only in `.metaflow/` or include a dedicated `policy/` namespace for portability?
- How should component criticality and domain tags be sourced and versioned to avoid drift?
- What minimum MCP/tool provenance format is required before CI can enforce evidence checks?
- Which high-criticality controls require mandatory independent human approval regardless of automated status?
