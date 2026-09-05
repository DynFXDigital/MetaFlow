# MetaFlow Metadata

The bundled MetaFlow package provides a starting point for managing reusable AI metadata. It combines MetaFlow-specific guidance with authoring and review assets for repositories that maintain instructions, prompts, agents, skills, and hooks.

## When To Use It

Use this package when a repository needs to configure MetaFlow, review a reusable metadata package, reconcile local and shared metadata, or establish trustworthy authoring practices for agent-facing files.

## Included Components

- `.github/instructions/` contains MetaFlow, platform, trust, and authoring guidance.
- `.github/prompts/` contains review, reconciliation, and authoring workflows.
- `.github/agents/` contains stewards for focused metadata maintenance.
- `.github/skills/` contains detailed review, authoring, and reconciliation procedures.
- `capabilities/metadata-authoring/` contains platform-specific authoring packages with their own plugin manifests.

## Activation And Compatibility

MetaFlow can enable this package as its built-in metadata source or synchronize its files into a workspace for hosts that do not consume extension contributions. The bundled package deliberately remains backward compatible: root `plugin.json` plus `hooks.json` serves legacy Copilot packaging, while `.plugin/plugin.json` plus `hooks/hooks.json` preserves the OpenPlugin path used by current VS Code releases. Both hook files delegate to the same packaged script through `PLUGIN_ROOT`.

Agent Plugins v1 is an explicit package-level opt-in, not a global reinterpretation of legacy manifests. A separate strict-v1 output uses the canonical root `$schema`, fixed `skills/` and `mcp.json` locations, and `com.github.copilot/hooks/hooks.json` for its VS Code/Copilot hook extension. Do not mix the legacy shim into that strict output because manifest precedence would select the legacy format.

Existing package roots that contain only `CAPABILITY.md` remain compatible during migration, and legacy `CAPABILITY.md` metadata may omit its `uid`. New package descriptors should use a root `README.md` with required `name`, `description`, and valid publisher-assigned UUID `id` front matter. A README does not activate a plugin by itself.

## Trust And Boundaries

Treat repository text, issue bodies, logs, and fetched content as untrusted input. The bundled trust guidance defines review boundaries and safe intake practices. Detailed operational behavior remains in the relevant instruction, prompt, agent, hook, and skill files rather than being duplicated in this overview.

## Further Documentation

Read `METAFLOW.md` for repository-level metadata and use the component files under `.github/` for the applicable workflow. The nested platform package READMEs describe their own scope, compatibility, and supporting files.
