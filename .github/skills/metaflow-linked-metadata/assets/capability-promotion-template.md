# Capability Promotion Template

## Objective

Promote local metadata into a reusable capability in a linked MetaFlow metadata repository.

- Source repo:
- Target linked metadata repo:
- Capability name:
- Request date:
- Owner/agent:

## Source Inventory

| Source File | Type | Decision | Notes |
|---|---|---|---|
| `.github/...` | skill/prompt/agent/instruction | keep-local / promote-as-is / promote-after-generalization | |

## Generalization Plan

### Coupled details found

- Detail:
- Why it is coupled:
- Rewrite strategy:

### Reusable form

- Final generalized wording:
- Parameter/example strategy:

## Destination Layout

- `capabilities/<capability-name>/.github/instructions/...`
- `capabilities/<capability-name>/.github/prompts/...`
- `capabilities/<capability-name>/.github/agents/...`
- `capabilities/<capability-name>/.github/skills/...`

## MetaFlow Wiring Changes

- Local config file: `.metaflow/config.jsonc`
- `layers[]` update:
- `layerSources[]` update:
- Status command output summary:

## Validation Evidence

- Command: `node packages/cli/out/src/cli.js status --workspace .`
- Result summary:

## Final Summary

- Files promoted:
- Files intentionally left local:
- Leak-prevention checks completed:
- Follow-up actions:
