# Phase 3 – UI: Effective Files Checkboxes

## Objective

Surface per-artifact toggles as checkboxes on `FolderItem` and `FileItem` nodes in
the Effective Files tree view, wired to the `ConfigWriter` via a new VS Code command.

---

## 3.1  `FilesTreeViewProvider` changes

**File:** `src/src/views/filesTreeView.ts`

### 3.1.1  Checkbox state on `FolderItem` and `FileItem`

Both node types need `checkboxState` set at construction time.

The checked state reflects whether the item (or any of its children) is suppressed
by an entry in `filters.disabled`.

```ts
// Helper — returns true if the relPath is covered by any disabled glob
function isDisabledByConfig(relPath: string, disabled: string[]): boolean {
    return disabled.length > 0 && matchesAnyGlob(relPath, disabled);
}
```

For a `FolderItem`, the folder is considered "disabled" when *all* of its effective
files are matched by disabled globs (or the folder prefix itself matches).  A simpler
first-pass heuristic: check if the folder's representative glob pattern is listed in
`disabled`.

For a `FileItem`, check the file's `relativePath` directly.

```ts
// In FileItem constructor
this.checkboxState = isDisabledByConfig(file.relativePath, disabled)
    ? vscode.TreeItemCheckboxState.Unchecked
    : vscode.TreeItemCheckboxState.Checked;
```

> **Note:** `Checked` = active/visible, `Unchecked` = suppressed.  This matches
> the existing convention in `LayersTreeViewProvider`.

### 3.1.2  Surface `onDidChangeCheckboxState`

`FilesTreeViewProvider` must expose the tree-view handle so the extension can wire
`onDidChangeCheckboxState`:

```ts
// Wired in extension.ts during activation:
filesTreeView.onDidChangeCheckboxState(({ items }) => {
    for (const [item, state] of items) {
        vscode.commands.executeCommand(
            'metaflow.toggleArtifactDisabled',
            item,
            state === vscode.TreeItemCheckboxState.Unchecked
        );
    }
});
```

### 3.1.3  Pass `disabled` globs into children resolution

`getChildren` must have access to the current `filters.disabled` array from
`state.config` to set checkbox states.  Since `state.config` is already available
via the `ExtensionState` reference, no new props needed.

---

## 3.2  New command: `metaflow.toggleArtifactDisabled`

**File:** `src/src/commands/commandHandlers.ts`

```ts
export async function toggleArtifactDisabled(
    item: FolderItem | FileItem,
    suppress: boolean   // true → add to disabled, false → remove
): Promise<void>
```

Steps:
1. Derive the glob for the item using `deriveDisabledGlob(item)`.
2. Resolve `configPath` from `ExtensionState` (already stored).
3. Call `ConfigWriter.suppressMutations()` to set the re-entrancy guard.
4. Call `addDisabledGlob` or `removeDisabledGlob` as appropriate.
5. Re-entrancy guard auto-clears in `onAfterWrite`.
6. The file watcher will reload the config (suppressed during write, fires after).
7. `ExtensionState` emits `onDidChange` → tree refreshes automatically.

### Glob derivation helper

```ts
function deriveDisabledGlob(item: FolderItem | FileItem): string {
    if (item instanceof FileItem) {
        // item.relativePath is the source relative path (includes .github/)
        return `**/${toPosixPath(item.relativePath)}`;
    }
    // FolderItem — use prefix + /**
    const posixPrefix = toPosixPath(item.sourcePrefix);  // see §3.3
    return `**/${posixPrefix}/**`;
}
```

---

## 3.3  `FolderItem` — expose `sourcePrefix`

`FolderItem` currently stores `prefix` (the display path prefix, with `.github/`
stripped).  For glob derivation we need the *source* prefix.

Two approaches:
- **A (preferred):** Store both `displayPrefix` and `sourcePrefix` on `FolderItem`.
  Set `sourcePrefix` from the representative file's `relativePath` up to the
  matching segment count.
- **B:** Reconstruct the source prefix on demand in the command using the
  `EffectiveFile[]` stored on the item.

Approach A is cleaner.  The `files` array already stored on `FolderItem` contains
`EffectiveFile` with `.github/` in `relativePath` — use the first file's path,
strip trailing filename to get the folder prefix.

---

## 3.4  `package.json` wiring

**File:** `src/package.json`

Add command declaration:

```jsonc
{
    "command": "metaflow.toggleArtifactDisabled",
    "title": "Toggle Artifact Suppression",
    "category": "MetaFlow"
}
```

Register in `contributes.commands`.

No keybinding required; this command is intended to be invoked exclusively via the
tree-view checkbox, not the command palette.  Optionally mark it with `"when": "false"`
in menu contributions to keep it out of the palette.

---

## 3.5  Extension activation wiring

**File:** `src/src/extension.ts`

```ts
// After creating filesTreeView:
const filesViewHandle = vscode.window.createTreeView('metaflow.filesView', {
    treeDataProvider: filesTreeViewProvider,
    showCollapseAll: true,
    canSelectMany: false,
});

filesViewHandle.onDidChangeCheckboxState(({ items }) => {
    for (const [item, state] of items) {
        vscode.commands.executeCommand(
            'metaflow.toggleArtifactDisabled',
            item,
            state === vscode.TreeItemCheckboxState.Unchecked
        );
    }
});
context.subscriptions.push(filesViewHandle);
```

---

## 3.6  Reset command: `metaflow.resetDisabledArtifacts`

**File:** `src/src/commands/commandHandlers.ts` + `src/package.json`

```ts
export async function resetDisabledArtifacts(): Promise<void> {
    const configPath = state.configPath;
    if (!configPath) { return; }
    await clearDisabledGlobs(configPath);
    // File watcher reload will refresh the tree.
}
```

Package.json:

```jsonc
{
    "command": "metaflow.resetDisabledArtifacts",
    "title": "Reset Suppressed Artifacts",
    "category": "MetaFlow",
    "icon": "$(discard)"
}
```

Add this as a button in the `metaflow.filesView` title bar via
`contributes.menus["view/title"]`.

---

## 3.7  Indeterminate checkbox state (folder partial suppression)

When some — but not all — files in a folder are disabled, the folder node should
show `Mixed` checkbox state (VS Code supports this via `vscode.TreeItemCheckboxState`
if exposed).  This is a **stretch goal** for Phase 3; implement only if the API
supports it cleanly.  Otherwise, use `Unchecked` when any file is suppressed and
`Checked` when none are.

---

## 3.8  Verification

Manual smoke test:

1. Open MetaFlow dev extension host.
2. Open Effective Files view — all items show as checked.
3. Uncheck an artifact folder — items disappear from tree; `config.jsonc` gains
   `filters.disabled` entry.
4. Check the folder again — items reappear; entry removed from `config.jsonc`.
5. Click "Reset Suppressed Artifacts" — all previously suppressed items restored.

---

## Exit criteria

- [ ] `FolderItem` and `FileItem` render checkboxes (Checked/Unchecked).
- [ ] Toggling writes/removes the correct glob in `filters.disabled`.
- [ ] Comments in `config.jsonc` preserved after toggle.
- [ ] Reset command clears all `disabled` entries.
- [ ] Watcher re-entrancy: no double-reload observed.
- [ ] All existing integration tests pass.
