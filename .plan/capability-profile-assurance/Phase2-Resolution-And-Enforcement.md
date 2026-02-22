# Phase 2 - Profile Resolution and Enforcement

## Objective

Implement deterministic policy closure and machine-enforced capability requirements in CI.

## Work Items

1. Define policy closure algorithm:
   - parse PR diff
   - map to components/tags
   - resolve profile (`M`, `C`, `domain`)
   - expand required capabilities and gates
2. Define evidence validation checks against capability-linked contracts.
3. Define gate evaluation strategy for required checks:
   - test categories
   - security scans
   - review authorities
   - exception handling
4. Define CI reporting format with actionable failure diagnostics.
5. Define baseline adoption mode:
   - warn-only bootstrap
   - required-enforcement progression by profile tier

## Outputs

1. Policy closure design and pseudo-implementation spec.
2. CI check contract for evidence and gate validation.
3. Migration guidance from recommendation-only instructions to enforced gates.

## Acceptance Criteria

1. Same PR + metadata always yields same closure results.
2. Missing or invalid evidence yields explicit, actionable failures.
3. Required capability gates can block merge when configured.
4. Low-criticality profiles can run with minimal gate overhead.

## Risks

1. Ambiguous path/component tagging can cause incorrect profile resolution.
2. Excessive enforcement at low rigor can reduce developer adoption.
