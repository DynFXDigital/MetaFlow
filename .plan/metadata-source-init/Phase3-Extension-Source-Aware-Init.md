# Phase 3 – Extension Source-Aware Init

## Objective

Bring source-aware initialization to VS Code command flow with parity to CLI semantics while using VS Code-native prompts and filesystem APIs.

## Extension UX (MVP)

1. Trigger `MetaFlow: Init Config` command.
2. QuickPick source mode: Existing Directory / Git URL / New Empty Directory.
3. Collect input:
   - Existing: folder picker or typed path.
   - URL: input box for URL, optional input box for clone destination.
   - Empty: folder picker or typed path for scaffold.
4. Perform source action and layer discovery.
5. Confirm overwrite if `.ai-sync.json` already exists.
6. Write config, open file, show success message.

## Tasks

- [ ] Refactor `src/src/commands/initConfig.ts` to source-aware workflow.
- [ ] Reuse shared discovery/naming logic from engine package.
- [ ] Add extension-safe clone invocation (process spawn) with robust error reporting.
- [ ] Implement scaffold creation through `vscode.workspace.fs`.
- [ ] Preserve existing overwrite prompt behavior.
- [ ] Add/adjust extension unit tests and integration tests around init flow.

## Acceptance Criteria

- Extension init supports all three source modes and writes valid config.
- Extension prompts are cancel-safe (user cancel exits cleanly without side effects).
- Generated config semantics match CLI expectations for equivalent source inputs.

## Risks

- Path handling differences for local vs remote/WSL workspaces may require explicit constraints in MVP.
- Clone behavior in restricted environments (no git/network) must fail gracefully and explain next steps.
