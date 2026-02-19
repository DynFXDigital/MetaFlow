# Phase 1: Discovery Engine

## Goals

Implement the core layer discovery mechanism in the engine package, including scanning repositories for artifact directories, merging discovered layers with explicit configuration, and handling discovery filtering.

## Tasks

### 1. Extend Config Schema

**File:** `packages/engine/src/config/configSchema.ts`

Add discovery configuration to `NamedMetadataRepo`:

```typescript
export interface NamedMetadataRepo extends MetadataRepo {
    id: string;
    enabled?: boolean;
    /** Optional discovery configuration. */
    discover?: {
        /** Enable automatic layer discovery (default: false). */
        enabled?: boolean;
        /** Glob patterns to exclude from discovery. */
        exclude?: string[];
    };
}
```

**Rationale:** Keep discovery opt-in per repository to avoid surprising users with automatic behavior changes.

### 2. Implement Discovery Scanner

**File:** `packages/engine/src/engine/overlayEngine.ts`

Add new exported function:

```typescript
/**
 * Discover layer directories in a repository by scanning for known artifact roots.
 * 
 * @param repoRoot Absolute path to repository root.
 * @param excludePatterns Optional glob patterns to exclude.
 * @returns Array of discovered layer paths (relative to repo root).
 */
export function discoverLayersInRepo(
    repoRoot: string,
    excludePatterns?: string[]
): string[]
```

**Implementation details:**

1. Walk directory tree starting from `repoRoot`
2. For each directory encountered:
   - Check if it contains any `KNOWN_ARTIFACT_ROOTS` subdirectories
   - Check for `.github/{artifactRoot}` pattern
   - If found, mark parent as a layer path
3. Apply `excludePatterns` filtering using `minimatch` or similar
4. Return deduplicated, sorted array of layer paths
5. Handle missing directories / permission errors gracefully

**Algorithm:**

```
discoveredLayers = []
for each directory D in walk(repoRoot):
  if any artifact in KNOWN_ARTIFACT_ROOTS exists in D:
    relativePath = path.relative(repoRoot, D)
    if !matches(relativePath, excludePatterns):
      discoveredLayers.add(relativePath)
  if D contains .github/:
    for each artifact in KNOWN_ARTIFACT_ROOTS:
      if .github/{artifact} exists in D:
        relativePath = path.relative(repoRoot, D)
        if !matches(relativePath, excludePatterns):
          discoveredLayers.add(relativePath)
return sort(unique(discoveredLayers))
```

### 3. Integrate Discovery into Layer Resolution

**File:** `packages/engine/src/engine/overlayEngine.ts`

Modify `resolveMultiRepoLayers()` function:

```typescript
function resolveMultiRepoLayers(
    repos: NamedMetadataRepo[],
    layerSources: LayerSource[],
    workspaceRoot: string
): LayerContent[] {
    const repoMap = new Map<string, string>();
    const discoveryMap = new Map<string, string[]>(); // repoId → discovered layer paths
    
    // Build repo map and run discovery for enabled repos
    for (const repo of repos) {
        if (repo.enabled === false) continue;
        
        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        repoMap.set(repo.id, repoRoot);
        
        if (repo.discover?.enabled) {
            const discovered = discoverLayersInRepo(repoRoot, repo.discover.exclude);
            discoveryMap.set(repo.id, discovered);
        }
    }
    
    // Merge explicit layerSources with discovered layers
    const allLayerSources = [...layerSources];
    
    for (const [repoId, discoveredPaths] of discoveryMap.entries()) {
        for (const layerPath of discoveredPaths) {
            // Skip if already explicitly configured
            const alreadyExplicit = layerSources.some(
                ls => ls.repoId === repoId && ls.path === layerPath
            );
            if (!alreadyExplicit) {
                allLayerSources.push({
                    repoId,
                    path: layerPath,
                    enabled: true, // discovered layers are enabled by default
                });
            }
        }
    }
    
    // Continue with existing resolution logic using allLayerSources
    // ...existing code...
}
```

**Rationale:** Explicit entries always take precedence; discovered layers append afterward in alphabetical order.

### 4. Unit Tests

**File:** `packages/engine/test/discovery.test.ts` (new file)

Test cases (DISC-01 through DISC-08):

- **DISC-01**: `discoverLayersInRepo()` finds layers with artifact roots at repo root
- **DISC-02**: Discovery finds layers with artifact roots under `.github/`
- **DISC-03**: Discovery returns empty array for repo with no artifact directories
- **DISC-04**: Discovery respects exclude patterns (glob matching)
- **DISC-05**: Discovery handles missing/invalid repo paths gracefully
- **DISC-06**: `resolveMultiRepoLayers()` merges discovered layers with explicit config
- **DISC-07**: Explicit `layerSources` entries take precedence over discovered duplicates
- **DISC-08**: Discovery skips repos with `discover.enabled: false` or `enabled: false`

**Coverage target:** 95%+ statement coverage for new discovery functions.

## Acceptance Criteria

- [ ] `discoverLayersInRepo()` function exported from `overlayEngine.ts`
- [ ] Discovery correctly identifies layers with any known artifact root
- [ ] Exclude patterns work with standard glob syntax (`**/deprecated/**`, `*/archive/*`)
- [ ] `resolveLayers()` merges discovered layers after explicit entries
- [ ] All DISC-* unit tests pass with 95%+ coverage
- [ ] Engine builds and existing tests remain green
- [ ] No `vscode` imports added to engine package

## Dependencies

- `minimatch` or `micromatch` package for glob pattern matching (verify already present in engine deps)
- Existing `resolvePathFromWorkspace()` and `isWithinBoundary()` utilities

## Estimated Effort

2-3 days (discovery logic + comprehensive unit tests)
