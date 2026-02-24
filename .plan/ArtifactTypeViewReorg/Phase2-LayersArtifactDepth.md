# Phase 2 – Layers Tree Artifact-Type Depth

## Objective

Extend the Layers tree view one level deeper so users can check/uncheck individual
artifact types (`instructions`, `prompts`, `agents`, `skills`) within each layer.
Toggled state persists to `config.jsonc` via a new `excludedTypes` field on layer
source entries.

---

## 2.1  Schema change – `LayerSource.excludedTypes`

**File:** `packages/engine/src/config/configSchema.ts`

Add `excludedTypes` to the per-layer-source entry in the multi-repo config shape:

```ts
export type ArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills';

export interface LayerSource {
    repoId: string;
    path: string;
    enabled?: boolean;
    /**
     * Artifact-type directories to exclude for this layer source.
     * UI-managed; distinct from `filters.exclude` (which is hand-authored).
     */
    excludedTypes?: ArtifactType[];
}
```

For the single-repo `layers` array, there is no `LayerSource` object, so
`excludedTypes` is only available in the `layerSources` (multi-repo) config shape.
Single-repo configs are out of scope for Phase 2 but the design does not block a
later extension.

### Backward-compatibility guarantee

Absent `excludedTypes` → behaviour is identical to today.

---

## 2.2  Engine change – materialiser/filter integration

**File:** `packages/engine/src/engine/filterEngine.ts` (or the materializer, wherever
per-source filtering occurs)

Before a file from a given `LayerSource` is added to the effective set, check whether
its artifact type appears in `excludedTypes`:

```ts
function isExcludedByType(
    file: EffectiveFile,
    excludedTypes: ArtifactType[] | undefined
): boolean {
    if (!excludedTypes || excludedTypes.length === 0) {
        return false;
    }
    const type = getArtifactType(file.relativePath); // reuse util from Phase 1
    return excludedTypes.includes(type as ArtifactType);
}
```

The `getArtifactType` helper from Phase 1 can live in a shared
`packages/engine/src/engine/artifactType.ts` utility so both the engine and the
extension can import it.

---

## 2.3  `LayersTreeViewProvider` changes

**File:** `src/src/views/layersTreeView.ts`

### 2.3.1  New `ArtifactTypeLayerItem` node class

```ts
class ArtifactTypeLayerItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string,
        excluded: boolean
    ) {
        super(artifactType, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layerArtifactType';
        this.checkboxState = excluded
            ? vscode.TreeItemCheckboxState.Unchecked
            : vscode.TreeItemCheckboxState.Checked;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = excluded ? '(excluded)' : '';
    }
}
```

### 2.3.2  Rendering artifact-type children under a `LayerItem`

A `LayerItem` with a valid `layerIndex` can now have children — the four
`ArtifactTypeLayerItem` nodes:

```ts
if (element instanceof LayerItem && typeof element.layerIndex === 'number') {
    return this.getArtifactTypeChildren(element.layerIndex, element.repoId);
}
```

`getArtifactTypeChildren` reads `config.layerSources[layerIndex].excludedTypes` and
returns one `ArtifactTypeLayerItem` per known type.

Types are only shown if there is at least one effective file of that type in the layer
(prevents showing `prompts/` for a layer that has none).  This requires access to
`state.effectiveFiles`; filter by `sourceLayer` matching the layer's path.

### 2.3.3  Update `LayerItem.collapsibleState`

A `LayerItem` that represents a leaf layer (has a `layerIndex`) must switch to
`Collapsed` when artifact-type children exist.  Pass `hasArtifactTypes: true` option
or derive it from context.

---

## 2.4  `metaflow.toggleLayerArtifactType` command

**File:** `src/src/commands/commandHandlers.ts`

```ts
'metaflow.toggleLayerArtifactType': async (item: ArtifactTypeLayerItem, newState: vscode.TreeItemCheckboxState) => {
    const excluded = newState === vscode.TreeItemCheckboxState.Unchecked;
    await configWriter.setLayerArtifactTypeExcluded(item.layerIndex, item.artifactType, excluded);
}
```

Wire to `onDidChangeCheckboxState` on the layers tree view handle.

---

## 2.5  `ConfigWriter` extension

**File:** `src/src/commands/configWriter.ts` (or wherever the writer lives post-Phase 2A)

Add `setLayerArtifactTypeExcluded(layerIndex: number, type: ArtifactType, excluded: boolean)`:

1. Read current `config.jsonc` using `jsonc-parser`.
2. Find `layerSources[layerIndex]`.
3. Add or remove `type` from `excludedTypes` array.
4. Write back with the existing re-entrancy guard.

---

## 2.6  Shared utility – `getArtifactType`

Extract the `getArtifactType` function established in Phase 1 into a shared module:

**New file:** `packages/engine/src/engine/artifactType.ts`

```ts
export type ArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills' | 'other';

const KNOWN_TYPES = new Set<string>(['instructions', 'prompts', 'agents', 'skills']);

export function getArtifactType(relativePath: string): ArtifactType {
    const posix = relativePath.replace(/\\/g, '/').replace(/^\.github\//, '');
    const firstSegment = posix.split('/')[0] ?? '';
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
```

Import from both `filesTreeView.ts` and the engine filter.  Move the local copy from
Phase 1 into this module during Phase 2.

---

## 2.7  Unit tests

### Engine tests

**File:** `packages/engine/test/artifactTypeFilter.test.ts`

| ID        | Description                                                                             |
|-----------|-----------------------------------------------------------------------------------------|
| ATF-01    | File with `instructions/` prefix excluded when type is in `excludedTypes`.              |
| ATF-02    | File passes through when `excludedTypes` is absent.                                     |
| ATF-03    | File passes through when `excludedTypes` is empty array.                                |
| ATF-04    | File with `other` type is never excluded by `excludedTypes` (no `other` in the enum). |
| ATF-05    | Multiple excluded types all suppress correctly.                                          |

### Extension unit tests

**File:** `src/src/test/unit/layersTreeView.test.ts`

| ID        | Description                                                                             |
|-----------|-----------------------------------------------------------------------------------------|
| LTV-AT-01 | Layer item with a `layerIndex` renders `ArtifactTypeLayerItem` children.               |
| LTV-AT-02 | Excluded type renders `Unchecked`, non-excluded renders `Checked`.                      |
| LTV-AT-03 | Types with no effective files are omitted.                                               |
| LTV-AT-04 | Flat mode does not show artifact-type sub-items.                                        |

---

## 2.8  Acceptance checklist

- [ ] `layerSources[i].excludedTypes` accepted by config schema; configs without it load correctly.
- [ ] Engine skips files whose type is in the layer's `excludedTypes`.
- [ ] Layers tree: each layer item expands to show artifact-type children with checkboxes.
- [ ] Unchecking a type writes to `config.jsonc` and files disappear from Effective Files view.
- [ ] Re-checking restores files.
- [ ] Flat mode layer items are unchanged (no artifact-type depth in flat mode).
- [ ] All ATF-* and LTV-AT-* tests pass.
- [ ] `npm run test:unit` and `npm -w @metaflow/engine test` both pass clean.
- [ ] SRS, SDD, TCS updated with new REQ-* and TC-* IDs.
