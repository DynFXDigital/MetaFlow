---
name: vscode-extension-dev
description: Use this skill for production-grade VS Code extension development and release workflows, including API design, testing, CI gates, VSIX packaging, Marketplace/Open VSX publishing, security hardening, and OSS maintenance.
argument-hint: "Describe your stage and target: dev, test, release, hotfix, or maintenance"
---

# VS Code Extension Dev and Release

## Outcome

Ship and maintain a secure, tested, and supportable VS Code extension release with clear quality gates and rollback options.

## When To Use

- Building a new extension feature with release intent
- Preparing a version bump and changelog
- Running pre-release validation in CI
- Publishing to Marketplace and/or Open VSX
- Performing post-release triage and maintenance

## Inputs

- Target version (for example `1.4.0`)
- Distribution target: `marketplace`, `open-vsx`, or `both`
- Release type: `feature`, `fix`, or `hotfix`
- Whether webviews are used
- Whether telemetry is used

## Procedure

### 1. Scope and Risk Triage

1. Identify changed areas: commands, views, language features, webviews, auth, filesystem, telemetry.
2. Classify risk:
- `High`: activation, webview, auth/secrets, workspace file writes, dependency upgrades.
- `Medium`: command behavior, diagnostics, tree views.
- `Low`: docs or copy-only changes.
3. Decide testing depth from risk:
- `High`: unit + integration + package smoke.
- `Medium`: targeted unit + targeted integration.
- `Low`: targeted unit or static checks.

Completion check:
- Risk class documented in PR/release notes.

### 2. Implement With API and UX Discipline

1. Confirm API usage against official docs and extension samples.
2. Keep pure logic separated from VS Code host integration where possible.
3. Follow VS Code UX guidelines for commands, menus, status bar, and notifications.
4. If webviews exist, apply strict CSP and minimize allowed resource roots.
5. If telemetry exists, ensure opt-in/out behavior and clear documentation.

References:
- [Source Watchlist](./references/source-watchlist.md)

Completion checks:
- No unsupported API assumptions.
- UX patterns match VS Code conventions.
- Webview security requirements explicitly validated when applicable.

### 3. Build and Local Validation

1. Install dependencies and build all workspaces/packages.
2. Run lint and type-check.
3. Run the smallest relevant test set first, then broader suites if risk is medium/high.
4. Package VSIX and run a local install smoke test.

Suggested command pattern:
```bash
npm install
npm run build
npm run test:unit
```

If this repo provides gate commands, prefer them (example: quick gate, integration gate, full gate).

Completion checks:
- Build succeeds.
- Targeted tests pass.
- Gate command for risk level passes.
- VSIX produced and installable.

### 4. CI and Supply-Chain Controls

1. Ensure CI runs extension host integration tests, not unit-only coverage.
2. Verify lockfile integrity and dependency updates for suspicious deltas.
3. Confirm no secrets/tokens are logged, committed, or embedded.
4. Review extension manifest contributions for stale/unused declarations.

Completion checks:
- CI status green on required jobs.
- No unresolved security findings.
- Manifest consistency checked.

### 5. Release Packaging and Publishing

1. Update version and changelog with user-visible entries.
2. Build and package final VSIX from clean state.
3. Publish to target registry:
- Marketplace: `vsce publish` (or CI equivalent).
- Open VSX: `ovsx publish` (or CI equivalent).
4. Keep publishing credentials in secret storage only.

Completion checks:
- Published artifact version matches changelog and tag.
- Extension installs from each target registry.
- Release notes map to shipped behavior.

### 6. Post-Release Maintenance

1. Monitor issues and crash/error signals.
2. Triage regressions by severity and affected contribution point.
3. For hotfixes, run condensed but mandatory gate:
- targeted repro test
- unit/integration coverage for fix
- package smoke
4. Feed recurring incidents into tests and docs.

Completion checks:
- Regressions tracked with owner and ETA.
- Hotfix criteria met before republish.
- Docs/tests updated for learned failure modes.

## Branching Logic

- If `webviews == true`: add explicit CSP verification and sanitization checks.
- If `distribution == both`: publish and validate Marketplace plus Open VSX.
- If `releaseType == hotfix`: allow scoped validation, but never skip packaging smoke.
- If `risk == High`: require integration tests in CI before publish.

## Definition of Done

- Feature behavior validated for intended scenarios and key failure modes.
- CI required checks pass.
- VSIX built and smoke-tested.
- Registry publish verified (target-specific).
- Changelog and support docs updated.
- Follow-up tasks captured for non-blocking debt.

## Quick Prompts

- `/vscode-extension-dev prepare release 1.5.0 for both marketplaces with webview checks`
- `/vscode-extension-dev run a hotfix workflow for a failing activation path`
- `/vscode-extension-dev create a risk-based test plan for a new command and tree view`
