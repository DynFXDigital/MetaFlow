---
name: MetaFlow
description: MetaFlow construct guidance, linked-metadata reconciliation workflows, and capability review assets help repositories govern reusable metadata layers.
license: MIT
---

# Capability: MetaFlow

## Purpose

Provide a small built-in MetaFlow metadata layer that works out of the box in the extension.

## Scope

- Guidance for authoring MetaFlow configuration constructs under `.metaflow/`.
- A review skill for assessing reusable MetaFlow capabilities and promotion readiness.
- A reconciliation workflow for comparing repository-local metadata against linked or candidate shared metadata repositories.
- Guidance for capability composition that prefers optional adjacent workflows over hard dependencies.

## Non-goals

- Repository-specific workflow policy.
- A complete replacement for repository-owned `.github` metadata.
- Automatic retirement or overwrite of local metadata without an explicit review decision.

## Composition Notes

- Prefer soft, optional composition with adjacent capabilities or local workflows when they provide related functionality.
- Do not hard-code one neighboring capability as a mandatory dependency when the same concern could be satisfied by a different compatible workflow.
- Capability behavior should degrade cleanly when the adjacent workflow is absent.
