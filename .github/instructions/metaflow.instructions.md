---
description: Operational guidance for running MetaFlow commands, builds, and tests.
applyTo: "**/*"
---

# MetaFlow Instructions

## Running the Program

You can run MetaFlow from the workspace root with:

```bash
metaflow
```

Or invoke the built CLI entry directly:

```bash
node packages/cli/out/src/cli.js
```

(Run `npm -w @metaflow/cli run build` first if `out/` is missing.)

You can also specify options, for example:

```bash
metaflow status --workspace path/to/workspace
```

## Running Tests

To run the unit tests for this project, use the following commands from the project root:

## Run All Tests (Recommended)

```bash
npm run test:unit
```

- The `-v` (verbose) flag shows each test and its result for better visibility.

## Run a Specific Test File

```bash
npm -w @metaflow/cli test
```

## Debugging Test Failures

To stop after a few failures and reduce output noise, use:

```bash
npm -w @metaflow/cli test -- --grep promote
```

- `--grep <pattern>`: Run only matching CLI integration tests.

## Install Test Dependencies

If you haven't already, install the test dependencies:

```bash
npm install
```

## Notes

- Tests run in Node.js with npm workspaces.
- Extension tests live under `src/src/test/`; package tests live under `packages/*/test/`.

## Building Artifacts

To build all TypeScript packages in this workspace:

1. Install dependencies (if not already installed):

    ```bash
    npm install
    ```

2. Build all workspace packages:

    ```bash
    npm run build
    ```

3. Optionally build only the CLI package:

```bash
npm -w @metaflow/cli run build
```

- CLI output is generated under `packages/cli/out/`.
