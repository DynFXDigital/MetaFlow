# Branch Protection Baseline

This repository expects `develop` to stay easy to integrate while `main` and
`release/**` stay release-grade.

## Required Checks

Use these GitHub branch protection or ruleset settings after the workflows are
active.

### `develop`

- Require pull request before merging.
- Require status check: `Lint, build, and unit tests`.
- Treat `GUI tests (vscode-extension-tester)` as advisory on this branch.
- Allow CodeQL and dependency review to run when `ENABLE_GHAS_WORKFLOWS=true`,
  but do not require them unless the repository has GitHub Advanced Security
  enabled.

### `main` and `release/**`

- Require pull request before merging.
- Require status checks:
    - `Lint, build, and unit tests`
    - `GUI tests (vscode-extension-tester)`
    - `Analyze` when `ENABLE_GHAS_WORKFLOWS=true`
    - `dependency-review` when `ENABLE_GHAS_WORKFLOWS=true`
- Require branches to be up to date before merging.
- Require review from code owners when CODEOWNERS coverage is expanded beyond
  the current placeholder.

## Repository Variables

- Set `ENABLE_GHAS_WORKFLOWS=true` only when CodeQL and dependency review should
  execute. Without it, the security workflows intentionally skip their scanner
  steps.

## Release Environments

The manual release workflow expects GitHub Environments named `production` and
`prerelease`. Configure required reviewers on both environments before allowing
marketplace publishing secrets.
