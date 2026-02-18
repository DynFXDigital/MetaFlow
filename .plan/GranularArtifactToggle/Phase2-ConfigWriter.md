# Phase 2 – Config Writer

## Objective

Implement `ConfigWriter` — a focused module that reads, mutates, and rewrites
`config.jsonc` safely using `jsonc-parser`, preserving comments and formatting.
This is the trickiest engineering piece; all UI write-back goes through this module.

---

## 2.1  Module location

```
src/src/engine/configWriter.ts    ← extension-side (imports vscode for file I/O)
```

**Why extension-side?**  Writing requires `vscode.workspace.fs` (or `fs`) and must
coordinate with the file-watcher subscription held by the extension.  The engine
package stays pure TS (no `vscode` imports).

Alternative: place a pure-TS writer in `packages/engine` using Node `fs` and inject
a watcher-pause callback.  Either is acceptable; extension-side is simpler for the
first iteration.

---

## 2.2  API surface

```ts
/**
 * Adds a glob to `filters.disabled[]` in config.jsonc.
 * Creates the array (and `filters` object) if absent.
 * No-ops if the glob is already present.
 */
export async function addDisabledGlob(
    configPath: string,
    glob: string,
    onBeforeWrite?: () => void,
    onAfterWrite?: () => void
): Promise<void>

/**
 * Removes a glob from `filters.disabled[]` in config.jsonc.
 * No-ops if the glob is not present.
 * Removes the array (and `filters` key) if it becomes empty and no
 * other filter keys exist.
 */
export async function removeDisabledGlob(
    configPath: string,
    glob: string,
    onBeforeWrite?: () => void,
    onAfterWrite?: () => void
): Promise<void>

/**
 * Clears the entire `filters.disabled` array from config.jsonc.
 * No-ops if the array is absent or already empty.
 */
export async function clearDisabledGlobs(
    configPath: string,
    onBeforeWrite?: () => void,
    onAfterWrite?: () => void
): Promise<void>
```

The `onBeforeWrite` / `onAfterWrite` hooks allow the caller (command handler) to
suppress file-watcher reloads during the write window.

---

## 2.3  Implementation notes

### JSONC mutation pattern

```ts
import * as jsonc from 'jsonc-parser';

async function mutateConfig(
    configPath: string,
    mutate: (edits: jsonc.Edit[], root: unknown) => void,
    onBeforeWrite?: () => void,
    onAfterWrite?: () => void
): Promise<void> {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const errors: jsonc.ParseError[] = [];
    const root = jsonc.parse(raw, errors);
    if (errors.length > 0) {
        throw new Error(`Config parse error: ${errors[0].error}`);
    }
    const edits: jsonc.Edit[] = [];
    mutate(edits, root);
    if (edits.length === 0) {
        return; // no-op
    }
    const newContent = jsonc.applyEdits(raw, edits);
    onBeforeWrite?.();
    try {
        await fs.promises.writeFile(configPath, newContent, 'utf8');
    } finally {
        onAfterWrite?.();
    }
}
```

### Key `jsonc.modify` calls

| Operation | Path | Value |
|---|---|---|
| Add glob | `['filters', 'disabled', -1]` | `glob` (string) |
| Remove item at index `i` | `['filters', 'disabled', i]` | `undefined` |
| Clear array | `['filters', 'disabled']` | `[]` or `undefined` |

### Watcher re-entrancy guard

The command handler (`toggleArtifact`) sets a boolean flag
`ConfigWriter.isMutating = true` before write and clears it in `onAfterWrite`.  The
file-watcher callback in `extension.ts` skips the reload when this flag is set.

---

## 2.4  Glob derivation rules

When the user toggles a node in the tree, the command must derive the correct glob.
This mapping is owned by the command handler (not the writer) but documented here
for completeness:

| Node type | Example display path | Derived glob |
|---|---|---|
| Artifact-type folder | `instructions/` | `**/.github/instructions/**` |
| Skill subdirectory | `skills/sdd-authoring/` | `**/.github/skills/sdd-authoring/**` |
| Prompt folder | `prompts/` | `**/.github/prompts/**` |
| Individual file | `instructions/coding.md` | `**/.github/instructions/coding.md` |
| Agent folder | `agents/` | `**/.github/agents/**` |
| Single agent dir | `agents/review/` | `**/.github/agents/review/**` |

The effective file's `relativePath` already contains the `.github/` prefix (it is
only stripped for *display* in `toDisplayRelativePath`).  The source path should be
used to build the glob, not the display path.

---

## 2.5  Unit tests

**File:** `src/src/test/unit/configWriter.test.ts`

| ID | Scenario | Expected |
|---|---|---|
| CW-01 | `addDisabledGlob` on config with no `filters` key | Creates `"filters": { "disabled": ["<glob>"] }` |
| CW-02 | `addDisabledGlob` on config with `filters` but no `disabled` | Adds `disabled` array |
| CW-03 | `addDisabledGlob` when glob already present | No-op (file unchanged) |
| CW-04 | `addDisabledGlob` with existing `exclude` array | Does not touch `exclude` |
| CW-05 | `removeDisabledGlob` when glob present | Removes entry; array remains if others exist |
| CW-06 | `removeDisabledGlob` last entry | Removes `disabled` key |
| CW-07 | `removeDisabledGlob` when glob absent | No-op |
| CW-08 | `clearDisabledGlobs` with populated array | Removes `disabled` key |
| CW-09 | `clearDisabledGlobs` with empty array | No-op |
| CW-10 | JSONC with comments preserved after mutation | Comments intact in output |
| CW-11 | `onBeforeWrite` / `onAfterWrite` hooks called in order | Both called; after called even on error |

---

## 2.6  Verification

```powershell
cd src
npm run compile
npm run test:unit
```

All existing unit tests pass + CW-* tests pass.

---

## Exit criteria

- [ ] `configWriter.ts` module implemented with the three exported functions.
- [ ] Watcher re-entrancy guard pattern documented in code comment.
- [ ] Glob derivation utility function implemented in command handler (or shared util).
- [ ] All CW-* unit tests pass.
- [ ] No existing unit tests broken.
