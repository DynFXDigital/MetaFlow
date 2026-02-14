# Contributing to MetaFlow

Thanks for contributing.

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

## Pull requests

- Keep PRs focused and minimal.
- Include tests for behavior changes.
- Update docs when user-facing behavior changes.
- Link related issues in the PR description.

## Commit quality

- Use clear commit messages.
- Avoid unrelated refactors in feature/fix PRs.

## Reporting issues

- Use the issue templates.
- Include a minimal reproduction, expected behavior, and environment details.

## Support channels

- Usage and troubleshooting: `SUPPORT.md`
- Security reports: `.github/SECURITY.md`

## Maintainer operations

- Release process: `RELEASING.md`
- Maintainer runbook: `.github/MAINTAINERS.md`
