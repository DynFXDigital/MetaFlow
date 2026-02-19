# Phase 2: UI Integration

## Goals

Surface the repository rescan capability in the Config tree view and wire it to the existing `metaflow.refresh` workflow, respecting the `metaflow.autoApply` setting.

## Tasks

### 1. Update Config Tree View

**File:** `src/src/views/configTreeView.ts`

Modify `RepoSourceItem` to support manual refresh action:

```typescript
class RepoSourceItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string | undefined,
        enabled: boolean,
        description: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        // Change context value to indicate rescannable repos
        this.contextValue = repoId && repoId !== 'primary' 
            ? 'configRepoSourceRescannable' 
            : 'configRepoSourceReadonly';
        // ... existing code ...
    }
}
```

**File:** `src/package.json` (view menus contribution)

Add refresh icon to repository items:

```json
"menus": {
  "view/item/context": [
    {
      "command": "metaflow.rescanRepository",
      "when": "view == metaflow.config && viewItem == configRepoSourceRescannable",
      "group": "inline"
    }
  ]
}
```

**Icon:** Use `$(refresh)` codicon for consistency with VS Code conventions.

### 2. Implement Rescan Command

**File:** `src/src/commands/commandHandlers.ts`

Add new command handler:

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand(
        'metaflow.rescanRepository',
        async (treeItem?: RepoSourceItem) => {
            if (!treeItem || !treeItem.repoId) {
                logWarn('Rescan repository: no repository selected.');
                return;
            }

            const ws = getWorkspace();
            if (!ws || !state.config) {
                vscode.window.showWarningMessage(
                    'MetaFlow: No config loaded. Cannot rescan repository.'
                );
                return;
            }

            logInfo(`Rescanning repository: ${treeItem.repoId}`);
            
            // Trigger full refresh (which will re-run discovery)
            await vscode.commands.executeCommand('metaflow.refresh');
            
            vscode.window.showInformationMessage(
                `MetaFlow: Rescanned repository "${treeItem.repoId}".`
            );
        }
    )
);
```

**Rationale:** Reuse existing `metaflow.refresh` command rather than duplicating resolution logic. Discovery runs automatically during refresh when `discover.enabled: true`.

### 3. Command Registration

**File:** `src/package.json` (commands contribution)

Add command definition:

```json
{
  "command": "metaflow.rescanRepository",
  "title": "Rescan Repository for Changes",
  "category": "MetaFlow",
  "icon": "$(refresh)"
}
```

### 4. Integration with AutoApply

**File:** `src/src/commands/commandHandlers.ts`

Ensure manual rescan respects `autoApply` setting (already handled by existing refresh logic):

```typescript
// In metaflow.refresh handler (existing code):
if (!refreshOptions.skipAutoApply) {
    const autoApply = vscode.workspace
        .getConfiguration('metaflow', ws.uri)
        .get<boolean>('autoApply', true);
    if (autoApply) {
        logInfo('Auto-apply enabled; applying overlay after refresh.');
        await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });
    }
}
```

**Behavior:**
- Manual rescan → triggers refresh → if `autoApply: true`, automatically applies changes
- If `autoApply: false`, user sees updated layers in tree views but must manually run Apply

### 5. Integration Tests

**File:** `src/src/test/integration/rescan.test.ts` (new file)

Test cases (IT-RSC-01 through IT-RSC-03):

- **IT-RSC-01**: Manual rescan command updates layer list when new directory added
- **IT-RSC-02**: Rescan with `autoApply: true` triggers automatic apply
- **IT-RSC-03**: Rescan with `autoApply: false` updates views but does not apply

**Test setup:**
1. Create fixture with multi-repo config and `discover.enabled: true`
2. Start with initial layer set
3. Programmatically add new artifact directory to source repo
4. Execute `metaflow.rescanRepository` command
5. Assert new layer appears in `state.effectiveFiles`
6. Verify apply behavior based on `autoApply` setting

## Acceptance Criteria

- [ ] Refresh icon appears on multi-repo entries in Config view (single-repo excluded)
- [ ] Clicking refresh icon triggers `metaflow.rescanRepository` command
- [ ] Command logs rescan action to output channel
- [ ] New/removed layers detected and reflected in Layers tree view
- [ ] Rescan respects `autoApply` setting for downstream apply behavior
- [ ] All IT-RSC-* integration tests pass
- [ ] Manual testing confirms UI workflow feels natural

## Dependencies

- Phase 1 completion (discovery engine functional)
- `RepoSourceItem` tree item from `configTreeView.ts`
- VS Code TreeView contrib point and command registration

## Estimated Effort

1-2 days (UI wiring + integration tests)
