export { resolveLayers, buildEffectiveFileMap, discoverLayersInRepo } from './overlayEngine';
export type { ResolveLayersCache, ResolveLayersOptions } from './overlayEngine';
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
    canonicalizePluginMetadataJson,
} from './pluginCatalog';
export { collectAgentPluginHookWarnings } from './agentPluginHookValidator';
export { detectSurfacedFileConflicts, formatSurfacedFileConflictMessage } from './conflictDetector';
export type { DetectSurfacedFileConflictsOptions } from './conflictDetector';
export { applyProfile } from './profileEngine';
export { getArtifactType } from './artifactType';
export type { ArtifactType } from './artifactType';
export {
    getPromptInjectionRulePack,
    isPromptInjectionTargetPath,
    scanPromptInjectionContent,
} from './promptInjectionScanner';
export type {
    PromptInjectionFinding,
    PromptInjectionRuleDefinition,
    PromptInjectionRuleId,
    PromptInjectionScanOptions,
    PromptInjectionSeverity,
} from './promptInjectionScanner';
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
    disposeManagedFile,
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
    hasValidReadmeDescriptorAtRoot,
    loadCapabilityDescriptorForLayer,
    parseCapabilityManifestContent,
    parseReadmeDescriptorContent,
    resolveCapabilityDescriptorPath,
    loadCapabilityManifestForLayer,
    capabilityManifestConstants,
} from './capabilityManifest';
export {
    parseRepoManifestContent,
    loadRepoManifestForRoot,
    isMarketplaceRepositoryRoot,
    repoManifestConstants,
} from './repoManifest';
export { parseFrontmatter } from './frontmatter';
export type { FrontmatterResult } from './frontmatter';
export type {
    LayerFile,
    LayerContent,
    CapabilityDescriptorKind,
    CapabilityDescriptorPath,
    EffectiveFile,
    CapabilityMetadata,
    CapabilityAgentPluginAuthor,
    CapabilityAgentPluginComponentValue,
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
    ManagedCapabilityCatalogState,
} from './managedState';
export type { DriftStatus, DriftResult } from './driftDetector';
export type {
    ApplyOptions,
    ApplyResult,
    PlannedSynchronizedFile,
    PlanSynchronizationOptions,
    SynchronizationPlan,
    PolicyRetainedFile,
    RetainedSynchronizationReason,
    RetainedSynchronizationStatus,
    DisposeManagedFileOptions,
    DisposeManagedFileResult,
    ManagedFileDispositionStatus,
    ManagedSynchronizationSourceIdentity,
} from './synchronizer';
export type { SettingsEntry } from './settingsInjector';
