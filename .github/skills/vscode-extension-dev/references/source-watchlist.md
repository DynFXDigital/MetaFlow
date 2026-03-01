# VS Code Extension Production Watchlist

High-signal sources for development, test, release, and maintenance of open-source VS Code extensions.

## Canonical VS Code docs

- API index: https://code.visualstudio.com/api
- Testing: https://code.visualstudio.com/api/working-with-extensions/testing-extension
- CI: https://code.visualstudio.com/api/working-with-extensions/continuous-integration
- Publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Bundling: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
- UX guidelines: https://code.visualstudio.com/api/ux-guidelines/overview
- Webviews: https://code.visualstudio.com/api/extension-guides/webview
- Telemetry: https://code.visualstudio.com/api/extension-guides/telemetry

## Reference implementations and tooling

- VS Code extension samples: https://github.com/microsoft/vscode-extension-samples
- VS Code test CLI: https://github.com/microsoft/vscode-test-cli
- Open VSX registry and docs: https://open-vsx.org

## OSS maintenance and governance

- GitHub Open Source Guides: https://opensource.guide/best-practices

## Security watch

- Snyk VS Code extension security overview:
  https://snyk.io/blog/modern-vs-code-extension-development-basics
- Trail of Bits VS Code extension escape research:
  https://blog.trailofbits.com/2023/02/21/vscode-extension-escape-vulnerability
- Koi report on malicious AI extensions:
  https://www.koi.ai/blog/maliciouscorgi-the-cute-looking-ai-extensions-leaking-code-from-1-5-million-developers
- TechRadar ecosystem incident reporting:
  https://www.techradar.com/pro/security/malicious-microsoft-vscode-ai-extensions-might-have-hit-over-1-5-million-users
  https://www.techradar.com/pro/security/dangerous-new-malware-targets-macos-devices-via-openvsx-extensions-heres-how-to-stay-safe
  https://www.techradar.com/pro/security/vscode-market-struck-by-huge-influx-of-malicious-whitecobra-extensions-so-be-warned

## Practical baseline

- Bundle and minimize shipped VSIX footprint.
- Run extension host integration tests in CI, not unit-only checks.
- Follow VS Code UX conventions to reduce user friction.
- Harden webviews (CSP, sanitization, restricted resources).
- Treat publish tokens and signing credentials as production secrets.
