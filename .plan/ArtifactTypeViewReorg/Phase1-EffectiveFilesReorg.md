# Phase 1 – Effective Files View Reorganisation

## Objective

Reorganise `FilesTreeViewProvider` to group top-level nodes by **artifact type**
(`instructions`, `prompts`, `agents`, `skills`) instead of by layer path.  No engine
changes.  No new config fields.  No checkboxes.

---

## 1.1  Artifact-type detection

**File:** `src/src/views/filesTreeView.ts`

The existing `toDisplayRelativePath` already strips the `.github/` prefix, yielding
paths like `instructions/foo.md` or `skills/my-skill/SKILL.md`.  The artifact type
is simply the first path segment.

```ts
type ArtifactType = 'instructions' | 'prompts' | 'agents' | 'skills' | 'other';

const KNOWN_TYPES: ReadonlySet<string> = new Set(['instructions', 'prompts', 'agents', 'skills']);

function getArtifactType(relativePath: string): ArtifactType {
    const posix = toPosixPath(relativePath).replace(/^\.github\//, '');
    const firstSegment = posix.split('/')[0];
    return KNOWN_TYPES.has(firstSegment) ? (firstSegment as ArtifactType) : 'other';
}
```

---

## 1.2  New `ArtifactTypeItem` node class

Replace (or supplement) the current `FolderItem` root with a dedicated node:

```ts
class ArtifactTypeItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ArtifactType,
        public readonly files: EffectiveFile[]
    ) {
        super(artifactType, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'artifactTypeFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    }
}
```

---

## 1.3  `getChildren` changes for `unified` mode

```
Root (no element)
  └── ArtifactTypeItem('instructions')   ← all files whose type == 'instructions'
  └── ArtifactTypeItem('prompts')
  └── ArtifactTypeItem('agents')
  └── ArtifactTypeItem('skills')
  └── ArtifactTypeItem('other')          ← omit if empty
```

Within each `ArtifactTypeItem`, delegate to the existing `getChildrenForPrefix` using
the artifact-type segment as the display-path prefix (excluding the type segment
itself, so sub-paths render cleanly):

```ts
if (element instanceof ArtifactTypeItem) {
    return this.getChildrenForType(element.files, element.artifactType, roots);
}
```

`getChildrenForType` mirrors `getChildrenForPrefix` but strips the leading type
segment from the display path so items do not duplicate the parent folder name.

---

## 1.4  `getChildren` changes for `repoTree` mode

```
Root
  └── RepoItem('DFX-AI-Metadata')
        └── ArtifactTypeItem('instructions')
        └── ArtifactTypeItem('prompts')
        ...
  └── RepoItem('MetaFlow')
        └── ArtifactTypeItem('instructions')
        ...
```

`getChildrenRepoTree` already returns `RepoItem` nodes.  Change `RepoItem` children
(inside `getChildren` element branch) to produce `ArtifactTypeItem` nodes grouped
from `element.files` before descending to per-file leaves.

---

## 1.5  Display attribution

Since layer/source information is no longer conveyed by folder hierarchy, it must
remain visible at the file level.  `FileItem.description` already shows `sourceLabel
(materialized)` — keep this, and ensure `tooltip` retains the full provenance block.

No changes needed to `FileItem` itself.

---

## 1.6  Existing view modes

The `filesViewMode` setting currently accepts `unified` | `repoTree`.  Both modes
adopt artifact-type grouping.  No new setting is introduced in Phase 1; the behaviour
change is a straight upgrade of both existing modes.

If there is strong concern about backward compatibility, a `filesViewGrouping` setting
can be added later, but the consensus is that artifact-type ordering is strictly
better for this panel.

---

## 1.7  Unit tests

**File:** `src/src/test/unit/filesTreeView.test.ts` (new tests appended)

| ID        | Description                                                                         |
|-----------|-------------------------------------------------------------------------------------|
| FTV-AT-01 | `unified` mode root children are `ArtifactTypeItem` nodes in correct order.        |
| FTV-AT-02 | Files with `.github/instructions/` prefix land under the `instructions` bucket.    |
| FTV-AT-03 | Files with unknown prefix land under `other`.                                       |
| FTV-AT-04 | `repoTree` mode: `RepoItem` children are `ArtifactTypeItem` nodes.                 |
| FTV-AT-05 | Empty `other` bucket is omitted from root.                                          |
| FTV-AT-06 | `FileItem` description still contains source-label attribution.                     |
| FTV-AT-07 | No regression on existing `FolderItem` traversal for sub-paths within a type node. |

Run with: `npm run test:unit` from `src/`.

---

## 1.8  Acceptance checklist

- [ ] `unified` mode: top-level nodes are artifact-type folders.
- [ ] `repoTree` mode: second-level nodes are artifact-type folders.
- [ ] `FileItem` tooltips retain full provenance (source, layer, path).
- [ ] No new config schema changes.
- [ ] No engine package changes.
- [ ] `npm run test:unit` passes clean with new FTV-AT-* tests added.
- [ ] No regression in existing `FilesTreeViewProvider` tests.
