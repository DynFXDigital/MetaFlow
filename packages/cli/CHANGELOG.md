# @metaflow/cli

## Unreleased

### Added

- `metaflow codex-support-boundaries` command for printing or writing the Codex file-backed, runtime-only, and not-technically-projectable support boundary report from the terminal.
- `metaflow codex-support-boundaries` now includes related operator, package maintainer, and tool authority guide references in Markdown and JSON output.
- `metaflow codex-support-boundaries` now reports release-ready runtime evidence readiness in Markdown and JSON output.
- `metaflow codex-support-boundaries` now includes a runtime evidence action plan in Markdown and JSON output.
- `metaflow codex-support-boundaries` now includes a runtime-complete completion action plan for partial runtime-only evidence, and runtime evidence templates fall back to those completion actions when release-ready has no blockers.
- `metaflow codex-support-boundaries` action plans now include per-concept runtime evidence details for native surfaces, expected proof, authority implications, and matching evidence records.
- `metaflow codex-support-boundaries --runtime-evidence-template` now emits review-only JSON templates for suggested Codex runtime evidence records derived from the current action plan.
- `metaflow codex-support-boundaries --runtime-evidence-template-dir` now writes review-only runtime evidence scaffold records as individual JSON files with overwrite protection.
- `metaflow codex-support-boundaries --runtime-evidence-concept` now limits runtime evidence template and scaffold output to selected runtime-only Codex concepts, including concepts that already have partial or waived evidence.
- `metaflow codex-support-boundaries --runtime-evidence-guide` now emits review-only runtime evidence collection guides for selected runtime-only Codex concepts.
- `metaflow codex-support-boundaries --runtime-evidence-review-queue` now emits focused review-only triage documents for all runtime-only concepts, release-ready blockers, individual runtime evidence gate queues, partial evidence, waived evidence, expired evidence, or stale adapter evidence queues.
- Partial, waived, expired, and stale-adapter runtime evidence review queues now include advisory review items for matching concepts without changing release gate behavior.
- `metaflow codex-support-boundaries --projection-boundary-review` now emits focused repository projection boundary review documents for Codex file-backed, runtime-only, unsupported, and not-achievable surfaces.
- `metaflow codex-support-boundaries --fail-on` now supports a `partial` gate condition plus `release-ready`, `runtime-complete`, and `all` presets for CI and release checks.
- `metaflow target-support` command for inspecting target capability support, runtime-only behavior, and unsupported surfaces without requiring a configured workspace.
- Target-aware lifecycle output for `metaflow status`, `metaflow validate`, `metaflow apply`, and `metaflow clean`, including target support summaries and `[codex]`-style mutation labels from managed projection metadata.
- Operator documentation for `export-copilot-mcp` now covers review-first handoff usage, required secret/policy checks, overwrite handling, and the boundary between GitHub Copilot MCP handoff and Codex MCP projection.
- Codex package maintainer guide documents the package metadata and marketplace export workflow used by `preview`, `target-support`, `codex-support-boundaries`, and `export-package-marketplace`.
- Codex tool authority guide documents the `.metaflow/tools/*.json` metadata reviewed by `preview` and target support reports before any runtime tool claim is treated as operational.
- `metaflow status` now displays capability-level target support posture, policy grants, validation evidence, and review-note counts from `.metaflow/capability.json`.
- `metaflow preview` now reports canonical evaluation profile runtime evidence fields, including evidence kind, harness, adapter version, scenario, evidence references, and limitations.
- `metaflow target-support` now reports evaluation runtime evidence metadata on evaluationSupport rows.
- `metaflow preview` and `metaflow target-support` now report Codex GitHub Action, app-server, and SDK-embedded execution surface classifications.
- `metaflow preview` now reports canonical `.metaflow/skills/<skill-id>/skill.json` metadata and validation warnings.
- `metaflow preview` now reports canonical `.metaflow/instructions/*.json` and `.metaflow/prompts/*.json` metadata and validation warnings.

## 0.3.2

### Patch Changes

- Prepare the 0.3.2 prerelease with prerelease branch CI and non-redundant release gating.

## 0.3.1

### Patch Changes

- Prepare the 0.3.1 prerelease with capability search and plugin metadata maintenance fixes.

## 0.3.0

### Minor Changes

- 8bbae64: Prepare the 0.3.0 prerelease lane for preview extension publishing.

## 0.1.0

### Minor Changes

- Bump minor versions for engine, CLI, and extension packages.
