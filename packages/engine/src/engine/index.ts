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
    buildCodexPluginMarketplaceManifest,
} from './pluginCatalog';
export type {
    CapabilityPluginMarketplaceManifest,
    CapabilityPluginMarketplaceManifestOptions,
    CapabilityPluginMarketplacePluginEntry,
    CapabilityPluginMarketplaceManifestResult,
    CodexPluginMarketplaceManifest,
    CodexPluginMarketplaceManifestOptions,
    CodexPluginMarketplaceManifestResult,
    CodexPluginMarketplacePluginEntry,
} from './pluginCatalog';
export { detectSurfacedFileConflicts, formatSurfacedFileConflictMessage } from './conflictDetector';
export type { DetectSurfacedFileConflictsOptions } from './conflictDetector';
export { applyFilters } from './filterEngine';
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
    parseCanonicalCapabilityManifestContent,
    parseCapabilityManifestContent,
    loadCapabilityManifestForLayer,
    capabilityManifestConstants,
} from './capabilityManifest';
export {
    loadPolicyGrantsForLayer,
    parsePolicyGrantContent,
    policyGrantConstants,
} from './policyGrant';
export { loadMcpServersForLayer, parseMcpServerContent, mcpServerConstants } from './mcpServer';
export { loadHooksForLayer, parseHookContent, hookManifestConstants } from './hookManifest';
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
    HookFailureBehavior,
    HookInvocationType,
    HookMetadata,
    HookTriggerPhase,
    McpServerInvocation,
    McpServerMetadata,
    McpServerTransport,
    PolicyGrantApproval,
    PolicyGrantAuthorityCategory,
    PolicyGrantMetadata,
    RepoMetadata,
    SurfacedFileConflict,
    SurfacedFileConflictSource,
    ArtifactClassification,
    ProjectionLossiness,
    ProjectionMetadata,
    ProjectionTarget,
    TargetCapabilityConcept,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportStatus,
    OverlayResult,
    PendingAction,
    PendingChange,
} from './types';
export { describeProjection } from './projectionMetadata';
export { getTargetCapabilityMatrix } from './targetCapabilityMatrix';
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
