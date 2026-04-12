# Contributing to MetaFlow

Thanks for contributing.

## Fast path

From the repository root:

```powershell
npm ci
npm -w @metaflow/engine run build
npm -w @metaflow/cli run build
cd src
npm run compile
npm run test:unit
npm run gate:integration
npm run lint
cd ..
npm -w @metaflow/engine test
npm -w @metaflow/cli test
npm test
```

Use targeted test commands first for narrow changes, then widen to the broader gates when the change is wider or release-sensitive.

## Project map

- `packages/engine/src/` - pure TypeScript overlay engine with no `vscode` imports
- `packages/engine/test/` - engine tests
- `packages/cli/src/` - CLI commands and integration flow
- `packages/cli/test/` - CLI tests
- `src/src/` - VS Code extension commands, views, diagnostics, and entrypoint
- `src/src/test/unit/` - extension unit tests
- `src/src/test/integration/` - extension-host integration tests
- `src/test-workspace/` - shared test fixture workspace

## Development setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm ci
```

3. Build and test before submitting a PR:

```bash
npm run build
npm test
npm run test:integration
```

For extension-only work, `src/package.json` provides `compile`, `test:unit`, `test:integration`, `gate:integration`, `lint`, and `package`.
For workspace-wide gates, the root `package.json` provides `gate:quick`, `gate:integration`, and `gate:full`.

## Development conventions

- Keep engine modules free of `vscode` imports so they remain fast to test in Node.
- Use `jsonc-parser`-compatible patterns for config files that permit comments and trailing commas.
- Track VS Code disposables in `context.subscriptions`.
- Prefer `npm ci` for clean verification and packaging runs; use `npm install` only when intentionally changing dependencies and reviewing lockfile changes.

## Testing expectations

- Run the smallest relevant test set after each change.
- Prefer `npm run test:unit` for fast extension feedback.
- Run `npm run gate:integration` for extension-host coverage when commands, activation, views, or VS Code wiring change.
- Run `npm run gate:quick` for the local CI-equivalent gate.
- Run `npm run gate:full` before release-sensitive changes.

## Pull requests

- Keep PRs focused and minimal.
- Include tests for behavior changes.
- Update docs when user-facing behavior changes.
- Link related issues in the PR description.

## Commit quality

- Use clear commit messages.
- Avoid unrelated refactors in feature/fix PRs.
- In a dirty or shared worktree, stage only files and hunks that belong to the task you are committing.
- Review staged file lists and staged diffs before creating a commit.

## Reporting issues

- Use the issue templates.
- Include a minimal reproduction, expected behavior, and environment details.

## Support channels

- Usage and troubleshooting: `SUPPORT.md`
- Security reports: `.github/SECURITY.md`

## Security hygiene baseline

- No runtime `.env` file is required for normal development, testing, or extension usage.
- Do not commit secrets, private keys, or internal service endpoints.
- Use `npm ci` for clean verification and packaging runs; use `npm install` only when intentionally changing dependencies and reviewing the lockfile diff.
- When a PR changes dependencies, call out new packages, lifecycle scripts, or unusual lockfile drift in the PR description.
- Route vulnerability disclosures through `.github/SECURITY.md` instead of public issues.

## Maintainer operations

- Release process: `RELEASING.md`
- Maintainer runbook: `.github/MAINTAINERS.md`

## Branch and release guardrails

- Default feature and backlog work to `develop`.
- Treat `main` as release-controlled; do not push to it or run release operations there unless explicitly directed.
- Treat tag creation, GitHub Release publication, and marketplace publishing as opt-in maintainer operations.
