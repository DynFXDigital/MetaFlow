# MetaFlow

AI metadata overlay management for GitHub Copilot — deterministic overlay resolution, materialization with provenance, and profile/layer management.

## Features

- **Overlay Resolution**: Combine multiple metadata layers (instructions, prompts, skills, agents) with deterministic later-wins precedence.
- **Materialization with Provenance**: Write files to `.github/` with machine-readable provenance headers for traceability.
- **Profile Management**: Switch between profiles to enable/disable artifact subsets.
- **Layer Management**: Toggle individual layers on/off; multi-repo support.
- **Drift Detection**: Detect locally-edited managed files; protect from overwrite.
- **Settings Injection**: Configure Copilot alternate-path settings for live-referenced artifacts.
- **TreeView UI**: Visual tree views for config summary, profiles, layers, and effective files.

## Installation

Install from VSIX:

```
code --install-extension metaflow-0.1.0.vsix
```

## Configuration

Create `.ai-sync.json` in your workspace root (or run `MetaFlow: Init Config`):

```jsonc
{
  "metadataRepo": {
    "localPath": "../my-ai-metadata"  // path to metadata repo clone
  },
  "layers": [
    "company/core",
    "standards/sdlc"
  ],
  "filters": {
    "include": [],
    "exclude": []
  },
  "profiles": {
    "default": { "enable": ["**/*"], "disable": [] },
    "lean":    { "disable": ["agents/**"] }
  },
  "activeProfile": "default",
  "injection": {
    "instructions": "settings",
    "prompts": "settings",
    "skills": "materialize",
    "agents": "materialize"
  }
}
```

## Commands

| Command | Description | Keybinding |
|---|---|---|
| `MetaFlow: Refresh` | Reload config and re-resolve overlay | `Ctrl+Shift+R` |
| `MetaFlow: Preview` | Show pending changes in output channel | |
| `MetaFlow: Apply` | Materialize files to `.github/` | |
| `MetaFlow: Clean` | Remove managed files | |
| `MetaFlow: Status` | Show current status in output channel | |
| `MetaFlow: Switch Profile` | Select active profile | |
| `MetaFlow: Toggle Layer` | Enable/disable a layer | |
| `MetaFlow: Open Config` | Open `.ai-sync.json` in editor | |
| `MetaFlow: Init Config` | Scaffold new `.ai-sync.json` | |
| `MetaFlow: Promote` | Detect drifted files for upstream promotion | |

## Settings

| Setting | Default | Description |
|---|---|---|
| `metaflow.enabled` | `true` | Enable/disable the extension |
| `metaflow.autoApply` | `false` | Auto-apply on config change |
| `metaflow.logLevel` | `info` | Log verbosity (debug/info/warn/error) |
| `metaflow.hooksEnabled` | `true` | Enable Copilot hooks injection |

## Architecture

The extension uses a pure TypeScript engine (no VS Code imports) for overlay resolution, enabling fast unit testing. The engine modules live in `src/engine/` and handle:

- Layer resolution and file-map building
- Include/exclude filter evaluation
- Profile enable/disable pattern application
- Artifact classification (live-ref vs materialized)
- Provenance header generation and drift detection
- Materialization with managed state tracking

VS Code integration (commands, views, diagnostics) wraps the engine in `src/commands/` and `src/views/`.

## Development

```powershell
cd src
npm install
npm run compile
npm run test:unit    # 111 unit tests
npm test             # 21 integration tests (Extension Host)
npm run lint
```

## License

MIT
