# Phase 3 - Provenance, Tool Trust, and High-Criticality Overlays

## Objective

Add tool trust boundaries, provenance evidence, and high-criticality overlay controls without changing base capability architecture.

## Work Items

1. Define tool trust policy model by criticality tier:
   - allowed tool classes
   - restricted operations
   - independent review requirements
2. Define MCP/tool provenance contract:
   - run identity
   - tool invocation metadata
   - structured logging requirements
   - retention and auditability requirements
3. Define high-criticality overlay controls:
   - stricter traceability depth and completeness
   - mandatory independent approvers
   - stronger gate thresholds
4. Define deviation and residual-risk documentation requirements.
5. Define domain overlay hooks (medical/automotive/aerospace/etc.).

## Outputs

1. High-criticality overlay policy package.
2. Provenance evidence specification for tool-assisted workflows.
3. Review authority model for separation of duties.

## Acceptance Criteria

1. High-criticality profiles enforce stricter controls than base profiles.
2. Provenance evidence supports audit reconstruction of tool-assisted changes.
3. Separation-of-duties requirements are enforceable via gate/review rules.
4. Base capability model remains unchanged; only overlays/parameters vary.

## Risks

1. Provenance volume and retention costs may increase rapidly.
2. Tool policy constraints may require significant adapter/proxy implementation.
3. Domain-specific overlays may diverge if not governed centrally.
