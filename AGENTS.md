# MetaFlow Public Repository

## Scope

- This repository contains the public MetaFlow product code: engine packages, CLI, VS Code extension, bundled metadata assets, and user-facing docs.
- Private planning, internal SDLC evidence, and release-process material belong in the parent private repository, not here.
- Keep public implementation changes on the active feature or preview branch. Do not push, merge, tag, publish releases, or rewrite `main` unless explicitly instructed.

## Common Commands

- Build all workspaces: `npm run build`
- Run the quick public gate: `npm run gate:quick`
- Run engine tests: `npm -C packages/engine test`
- Run CLI tests: `npm -C packages/cli test`
- Run extension unit tests: `npm -C src run test:unit`
- Run extension compile/lint checks: `npm -C src run compile` and `npm -C src run lint`

## Engineering Rules

- Preserve current Copilot behavior when adding support for other agent targets.
- Keep engine code free of VS Code APIs; extension code should consume engine behavior through exported package APIs.
- Treat generated/synchronized metadata as user-visible files. Protect existing unmanaged files from accidental overwrite.
- Keep path handling cross-platform by normalizing Windows paths at engine boundaries.
- Prefer focused tests in the owning package for behavior changes, then run the nearest broader gate that covers the touched surface.
