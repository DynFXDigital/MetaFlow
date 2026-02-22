# Evaluation Rubric and Gap Checklist

## Purpose

Provide a repeatable method to evaluate current MetaFlow capability/profile implementation against the target policy-and-assurance architecture.

## Rubric

### 1. Conceptual Completeness

1. Do capabilities include intent, scope, tool boundary, evidence, and gates?
2. Are profiles axis-based (`maturity`, `criticality`, optional `domain`) instead of ad hoc bundles?
3. Are skill IDs noun-based and reusable across capabilities?

### 2. Determinism and Enforceability

1. Can CI compute required controls from PR diff + metadata alone?
2. Are failures explicit and actionable (which requirement, what evidence missing, where)?
3. Are enforcement and guidance explicitly separated?

### 3. Agent Ecosystem Compatibility

1. Are requirements projected into `.github/copilot-instructions.md` and `.github/instructions/**` where appropriate?
2. Are `AGENTS.md` scopes used for local build/test/validate behavior?
3. Are custom agent profiles aligned with capability constraints where available?

### 4. Tool Trust and Provenance

1. Are allowed tool classes and prohibited actions defined by profile tier?
2. Are tool invocations logged with run identity and structured metadata?
3. Can reviewers reconstruct tool-assisted changes from evidence bundles?

### 5. Scaling Behavior

1. Does higher criticality increase evidence, review independence, and gate strictness?
2. Can low-criticality profiles stay lightweight without bypassing core controls?
3. Can domain overlays be added without redesigning base model?

## Gap Checklist (Current State -> Target State)

- [ ] Control objectives are explicitly defined and linked to capabilities.
- [ ] Capability definitions include normative shall statements.
- [ ] Evidence contracts are first-class metadata, not implicit conventions.
- [ ] Profile schema supports `M` x `C` axes and domain overlays.
- [ ] Profile resolution from PR context is deterministic and documented.
- [ ] CI policy closure step is implemented.
- [ ] CI evidence/gate enforcement is implemented with merge-blocking support.
- [ ] Tool trust policy is defined by profile tier.
- [ ] Provenance logging contract is defined and captured in artifacts.
- [ ] High-criticality overlays define stronger controls and independent approvals.

## Prioritized Remediation Order

1. Define schemas and canonical vocabulary.
2. Implement policy closure resolution.
3. Implement evidence contracts and gate enforcement.
4. Add tool trust/provenance requirements.
5. Add high-criticality and domain overlays.

## Exit Criteria

1. A sample PR can be evaluated end-to-end by policy closure and CI checks.
2. Generated report explains required controls, evidence status, and gate outcomes.
3. At least one low-criticality and one high-criticality profile execute successfully.
