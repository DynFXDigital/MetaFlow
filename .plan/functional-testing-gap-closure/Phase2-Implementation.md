# Phase 2: Test Implementation and Contract Hardening

## Objective

Implement or strengthen automated functional tests so high-risk behaviors are verified by robust, deterministic assertions.

## Tasks

1. Replace no-throw assertions with concrete behavior assertions in integration tests.
2. Add new integration scenarios for watcher refresh and cross-repo precedence.
3. Add settings injection edge-case scenarios and hooks toggle behavior coverage.
4. Add safety-focused test cases in unit and/or integration suites.
5. Run targeted tests first, then broader verification scope.

## Execution Commands (expected)

- `npm run test:unit` (from `src/`)
- `npm run test` (from `src/`)

## Exit Criteria

1. New/updated tests compile and execute.
2. High-risk test changes include deterministic assertions and stable fixtures.
3. Failing tests are linked to issues if not resolved in-phase.
