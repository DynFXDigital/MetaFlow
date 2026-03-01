# Research Notes - Bundled AI Metadata, Tools, and MCP

## Objective

Ground the plan in current MetaFlow implementation and canonical VS Code integration surfaces for metadata, extension tools, and MCP servers.

## Findings (Repository)

1. MetaFlow already injects settings paths for instructions/prompts/agents/skills/hooks via `computeSettingsEntries` in `packages/engine/src/engine/settingsInjector.ts`.
2. Extension refresh/apply lifecycle is centralized in `src/src/commands/commandHandlers.ts` and suitable for adding a bundled baseline source.
3. Extension activation already re-runs refresh on relevant setting changes (`src/src/extension.ts`), which supports a new bundled metadata toggle model.
4. Current settings schema includes artifact injection mode controls (`metaflow.injection.modes`) and hook enablement but no bundled baseline controls.
5. Existing tests already cover significant settings injection behavior (`src/src/test/unit/settingsInjector.test.ts`, `src/src/test/integration/commands.test.ts`).
6. There is no first-class extension implementation for VS Code AI tool contribution or MCP configuration assistance today.

## Findings (Architecture and Docs)

1. Existing concept docs position MetaFlow around instructions/prompts/skills/agents overlay management and settings/materialization realization.
2. Existing SRS/TCS traces include requirements for settings-based injection and materialization fallback; this effort should extend, not replace, these rules.
3. Prior planning patterns in `.plan/*` use phased docs plus a concise `Context.md`; this plan follows that convention.

## Findings (Canonical Product Model)

1. AI metadata, extension tools, and MCP are distinct integration lanes and should be modeled separately in MetaFlow settings/UX.
2. Bundled metadata should be shipped as extension assets but realized to workspace-managed locations for runtime use.
3. Extension-native tools should be explicit opt-in capabilities, version/compatibility-gated.
4. MCP support should assist explicit `mcp.json` setup and validation, while preserving trust prompts and user control.

## Planning Implications

1. Separate phase ownership for metadata baseline vs tools/MCP to reduce coupling and delivery risk.
2. Introduce migration-safe defaults for existing users (no silent behavior changes).
3. Add diagnostics and transparency for precedence/conflict visibility between bundled and repo-local metadata.
4. Expand integration tests before enabling defaults broadly.

## Reference Files

- `src/src/commands/commandHandlers.ts`
- `src/src/extension.ts`
- `src/package.json`
- `packages/engine/src/engine/settingsInjector.ts`
- `src/src/test/unit/settingsInjector.test.ts`
- `src/src/test/integration/commands.test.ts`
- `doc/concept/CONCEPT.md`
- `doc/srs/SRS-metaflow-ext.md`
- `.plan/upstream-change-indicator/README.md`
