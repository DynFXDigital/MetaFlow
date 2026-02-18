# Phase 1 – Schema & Engine

## Objective

Introduce `filters.disabled` to the config schema and extend the filter engine to
honour it. No UI changes in this phase — engine-only, fully testable in Node.

---

## 1.1  Schema change — `FilterConfig`

**File:** `packages/engine/src/config/configSchema.ts`

Add `disabled?: string[]` to `FilterConfig`:

```ts
export interface FilterConfig {
    /** Glob patterns for files to include. */
    include?: string[];
    /** Glob patterns for files to exclude (wins over include). */
    exclude?: string[];
    /**
     * UI-managed suppression list.  Treated identically to `exclude` at runtime
     * but kept separate so tooling can distinguish hand-authored excludes from
     * toggle state written by the extension.
     */
    disabled?: string[];
}
```

### Backward-compatibility guarantee

Absent `disabled` → behaviour is identical to today.  The field is purely additive.

---

## 1.2  Engine change — `applyFilters`

**File:** `packages/engine/src/engine/filterEngine.ts`

Merge `disabled` into the exclude check before the include check:

```ts
export function applyFilters(
    files: EffectiveFile[],
    filters: FilterConfig | undefined
): EffectiveFile[] {
    if (!filters) {
        return files;
    }

    // Merge hand-authored excludes and UI-managed disabled into one set
    const allExcludes = [
        ...(filters.exclude ?? []),
        ...(filters.disabled ?? []),
    ];

    return files.filter(file => {
        const relPath = file.relativePath;

        if (allExcludes.length > 0 && matchesAnyGlob(relPath, allExcludes)) {
            return false;
        }

        if (filters.include && filters.include.length > 0) {
            return matchesAnyGlob(relPath, filters.include);
        }

        return true;
    });
}
```

---

## 1.3  Unit tests

**File:** `packages/engine/test/engine.test.ts`  
(or a new focused file `packages/engine/test/filterEngine.test.ts` if the existing
test file grows too large)

Test cases to add:

| ID | Scenario | Expected |
|---|---|---|
| FE-D-01 | `disabled` with matching glob | file excluded |
| FE-D-02 | `disabled` with non-matching glob | file included |
| FE-D-03 | `disabled` overlaps `include` — exclude wins | file excluded |
| FE-D-04 | `disabled` and `exclude` both match — combined deduplicated | file excluded (no error) |
| FE-D-05 | `disabled` is empty array | no effect (all pass) |
| FE-D-06 | `disabled` is undefined | no effect (all pass) |
| FE-D-07 | Multiple globs in `disabled`, only one matches | file excluded |

---

## 1.4  Verification

```powershell
cd packages/engine
npm test
```

All 46 engine tests pass + new filter tests pass.

---

## Exit criteria

- [ ] `FilterConfig.disabled` field present in schema with JSDoc.
- [ ] `applyFilters` merges `disabled` into the exclude logic (exclude wins over include).
- [ ] All FE-D-* unit tests pass.
- [ ] No existing tests broken.
- [ ] `packages/engine` build clean (`npm run build`).
