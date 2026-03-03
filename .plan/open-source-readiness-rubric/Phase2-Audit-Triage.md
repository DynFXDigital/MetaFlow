# Phase 2 Audit Triage (2026-03-03)

## Baseline Command Evidence

- `npm ci`: Passed. Installed 595 packages. Reported `12 vulnerabilities` (1 low, 2 moderate, 9 high).
- `npm run build`: Passed across `@metaflow/engine`, `@metaflow/cli`, and extension compile.
- `npm run test:unit`: Passed with `241 passing`.

## Audit Artifact

- Full report: `.plan/open-source-readiness-rubric/npm-audit-2026-03-03.json`

## Advisory Classification

| Package | Severity | Exploitability Context | Ownership | Disposition |
|---|---|---|---|---|
| `minimatch` | High | ReDoS risk in glob parsing; surfaced through test/lint/tooling dependency chains | Tooling/dev dependency chain | `track` |
| `@typescript-eslint/*` (`eslint-plugin`, `parser`, `typescript-estree`, `utils`, `type-utils`) | High | Tooling-path dependency exposure; not shipped in runtime extension bundle | Extension dev tooling (`src`) | `track` |
| `mocha` + `serialize-javascript` | High | Test-runner path only; advisory fix guidance includes semver-major tradeoff | Workspace test tooling | `accepted risk` (short-term), `track` for planned upgrade review |
| `underscore` | High | Dependency in extension-side tooling graph; not direct runtime usage in extension activation path | Extension tooling/transitive | `track` |
| `ajv` | Moderate | ReDoS under `$data` patterns; appears in lint/tooling graph | Extension tooling/transitive | `track` |
| `markdown-it` | Moderate | ReDoS risk in markdown parser dependency used by tooling packages | Extension tooling/transitive | `track` |
| `qs` | Low | Low-severity DoS vector in parsing edge case; transitive dependency | Extension tooling/transitive | `accepted risk` |

## Remediation List

1. Open dependency hygiene issue to evaluate safe upgrade path for `@typescript-eslint/*` and inherited `minimatch` ranges.
2. Evaluate `mocha` upgrade strategy with compatibility matrix in a dedicated branch before any forced audit fix.
3. Refresh extension tooling dependencies in `src/package.json` to reduce transitive `underscore`/`ajv`/`markdown-it` exposure where upstream versions permit.
4. Re-run `npm audit --json` after dependency refresh and update this triage table with deltas.

## Security Hygiene Checks

- Secret pattern scan on tracked files: no matches found.
- Internal endpoint URL scan on tracked files: no matches found.
- Env-var scan (`.env.example`, `dotenv`, `process.env`) across docs and source: no runtime env requirement detected.

## Documentation Updates Applied

- Added explicit env-var expectation in `README.md`.
- Added security hygiene baseline in `.github/CONTRIBUTING.md`.
