# Capability-Profile Assurance Model - Implementation Plan

## Overview

This plan evolves MetaFlow capability/profile concepts into a formal policy-and-assurance architecture that scales from lightweight engineering rigor to high-assurance and safety-critical workflows. The model keeps capabilities and profiles as reusable units, adds explicit control objectives and evidence contracts, and introduces machine-checkable CI gates and auditable provenance so rigor can escalate without redesign.

## Problem / Goal Statement

MetaFlow currently has a strong capability-first language foundation but needs a deterministic way to bind intent, allowed agent/tool behavior, required evidence, and merge gates across varying rigor levels. The goal is to make rigor composable and enforceable by defining profiles that resolve from repository context (paths, component tags, criticality, maturity) and drive both human guidance and CI enforcement outcomes.

## Scope

### In Scope

1. Normative model for `control objective -> capability -> skill -> evidence contract -> gate`.
2. Dual-axis profile design (`maturity`, `criticality`) with domain overlays.
3. Capability contract definition (intent, applicability, tool policy, evidence, gates, review authority).
4. Profile resolution algorithm from PR diff plus repository metadata.
5. CI enforcement flow for policy closure, evidence validation, and gate evaluation.
6. Provenance and tool trust requirements for MCP-backed tool usage.
7. Safety/high-criticality overlay strategy (stricter controls, independence, traceability depth).

### Out of Scope

1. Full implementation of every CI check in this plan phase.
2. Domain standard certification work products (for example full ISO/IEC package tailoring).
3. Replacing existing MetaFlow engine overlay behavior during the initial schema phase.
4. Vendor-specific lock-in semantics beyond portable adapter guidance.

## Constraints

1. Preserve compatibility with existing MetaFlow capability terminology and documentation.
2. Keep low-friction defaults for low-criticality work; strict controls must be opt-in via profile resolution.
3. Ensure profile closure is deterministic and reproducible in CI.
4. Keep capability definitions portable across Copilot/agent ecosystems and MCP-based toolchains.
5. Separate guidance (instructions/prompts) from enforcement (CI/review gates).

## Dependencies

1. Existing capability terminology foundation:
   - `.plan/capability-first-class/README.md`
   - `doc/concept/CONCEPT.md`
   - `doc/concept/metaflow_reference_architecture.md`
2. Existing docs-traceability capability assets:
   - `.metaflow/capabilities/docs-traceability/`
3. Existing agent guidance surfaces:
   - `.github/copilot-instructions.md`
   - `.github/instructions/**/*.instructions.md`
   - `AGENTS.md`
4. CI infrastructure and policy evaluation execution context.
5. MCP tool integration point and structured logging capture approach.

## Owners and Roles (Proposed)

1. Product/Architecture Owner - model governance and profile taxonomy.
2. Platform Engineering Owner - CI policy closure, enforcement pipeline, artifacts.
3. Security/Safety Owner (as applicable) - high-criticality overlays and trust boundaries.
4. Capability Maintainers - per-capability intent, evidence contract, and gate requirements.

## Conceptual Model

### Model Layers

1. **Control Objective** - normative reason a control exists.
2. **Capability** - outcome-oriented bundle of metadata implementing one or more objectives.
3. **Skill** - reusable noun-based discipline module used by capabilities.
4. **Evidence Contract** - explicit artifact/log proof requirements.
5. **Gate** - machine/human acceptance checks that enforce policy.

### Primary Capability Backbone

1. `planning`
2. `formal-product-definition`
3. `development`
4. `verification`
5. `validation`
6. `configuration-release-management`
7. `security-supply-chain-assurance`
8. `quality-reliability`
9. `operations-readiness`

### Skill Naming Convention

Use noun-based skill IDs (for example `requirements`, `traceability`, `unit-testing`, `functional-testing`, `test-reporting`) and keep actions as behavior inside skill definitions.

## Profile Model

### Axes

1. `maturity`: `M1..M5`
2. `criticality`: `C0..C3`
3. `domain` overlay: optional (`saas`, `medical`, `automotive`, etc.)

### Profile Identity

`P(<Maturity>,<Criticality>,<Domain>)` for example `P(M2,C0,saas)`.

### Resolution Inputs

1. Changed paths/components in PR diff.
2. Component metadata tags (criticality/domain/subsystem).
3. Repository default maturity and override rules.

### Resolution Output

1. Required capabilities and parameters.
2. Required evidence contracts and gates.
3. Required reviewer authorities/approvers for merge.

## Implementation Architecture

### Metadata Surfaces

1. Capability/profile/objective definitions in policy metadata.
2. Agent guidance in `.github/copilot-instructions.md`, `.github/instructions/**`, and `AGENTS.md`.
3. Optional custom agent profiles in `.github/agents/*.agent.md`.

### Enforcement Pipeline (Target)

1. Compute policy closure from PR context.
2. Resolve applicable profile and capabilities.
3. Validate evidence contract completeness.
4. Evaluate gates (tests/scans/reviews/approvals).
5. Publish actionable report and block merge on failed required controls.

### Provenance and Tool Trust

1. Define allowed tool classes per criticality tier.
2. Capture structured invocation logs with run IDs and metadata.
3. Require stronger controls at higher criticality (restricted tools, independent review, explicit approvals).

## Success Criteria

1. Given a PR diff and component metadata, profile resolution is deterministic.
2. CI emits a clear pass/fail report tied to capability objectives and evidence contracts.
3. Low-criticality profiles remain lightweight and minimally disruptive.
4. High-criticality overlays add constraints without changing the base model.
5. Capability/skill definitions are reusable across profiles and domains.

## Deliverables

1. `Context.md` (living execution state).
2. Phase plans for schema/model, enforcement, and high-criticality/provenance overlays.
3. Draft schema and examples for objective/capability/profile/evidence definitions.
4. CI integration blueprint for policy closure and evidence/gate validation.
5. Gap-analysis rubric/checklist for current-state versus target-state assessment.

## Specialized References

- `.plan/capability-profile-assurance/Evaluation-Rubric-And-Gap-Checklist.md` - current-state versus target-state scoring and remediation checklist.
