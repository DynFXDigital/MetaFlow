export { resolveLayers, buildEffectiveFileMap, discoverLayersInRepo } from './overlayEngine';
export type { ResolveLayersOptions } from './overlayEngine';
export {
    applyCapabilityReferenceRepairs,
    buildCapabilityIdentityIndexFromConfig,
    capabilityIdentityIndexToManagedState,
    collectCapabilityIdentityIndexWarnings,
    managedStateToCapabilityIdentityIndex,
    reconcileConfiguredCapabilityReferences,
} from './capabilityIdentity';
export type {
    BuildCapabilityIdentityIndexOptions,
    CapabilityIdentityIndex,
    CapabilityIdentityIndexEntry,
    CapabilityReferenceResolution,
    CapabilityReferenceResolutionKind,
    CapabilityReferenceRepair,
    CapabilityReferenceRepairResult,
    ConfiguredCapabilityReference,
} from './capabilityIdentity';
export {
    buildAgentPluginCatalog,
    buildCapabilityPluginMarketplaceManifest,
} from './pluginCatalog';
export { detectSurfacedFileConflicts, formatSurfacedFileConflictMessage } from './conflictDetector';
export type { DetectSurfacedFileConflictsOptions } from './conflictDetector';
export { applyFilters } from './filterEngine';
export { applyProfile } from './profileEngine';
export { getArtifactType } from './artifactType';
export type { ArtifactType } from './artifactType';
export { classifyFiles, classifySingle, resolveFileInjection } from './classifier';
export { matchesGlob, matchesAnyGlob } from './globMatcher';
export {
    generateProvenanceHeader,
    parseProvenanceHeader,
    stripProvenanceHeader,
} from './provenanceHeader';
export {
    computeContentHash,
    loadManagedState,
    saveManagedState,
    createEmptyState,
    getStateDirPath,
} from './managedState';
export { checkDrift, checkAllDrift } from './driftDetector';
export {
    apply,
    clean,
    planSynchronization,
    preview,
    toSynchronizedRelativePath,
} from './synchronizer';
export {
    computePluginRootPaths,
    computeSettingsEntries,
    computeSettingsKeysToRemove,
} from './settingsInjector';
export {
    collectDuplicateCapabilityUidWarnings,
    parseCapabilityManifestContent,
    loadCapabilityManifestForLayer,
    capabilityManifestConstants,
} from './capabilityManifest';
export {
    parseRepoManifestContent,
    loadRepoManifestForRoot,
    repoManifestConstants,
} from './repoManifest';
export { parseFrontmatter } from './frontmatter';
export type { FrontmatterResult } from './frontmatter';
export type {
    LayerFile,
    LayerContent,
    EffectiveFile,
    CapabilityMetadata,
    CapabilityAgentPluginManifest,
    CapabilityPluginCatalogEntry,
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    RepoMetadata,
    SurfacedFileConflict,
    SurfacedFileConflictSource,
    ArtifactClassification,
    OverlayResult,
    PendingAction,
    PendingChange,
} from './types';
export type { ProvenanceData } from './provenanceHeader';
export type {
    ManagedState,
    ManagedFileState,
    ManagedViewsState,
    ManagedCapabilityIdentityState,
} from './managedState';
export type { DriftStatus, DriftResult } from './driftDetector';
export type {
    ApplyOptions,
    ApplyResult,
    PlannedSynchronizedFile,
    PlanSynchronizationOptions,
    SynchronizationPlan,
} from './synchronizer';
export type { SettingsEntry } from './settingsInjector';
