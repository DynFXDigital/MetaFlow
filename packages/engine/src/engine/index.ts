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
    isSynchronizationPlanningError,
    planSynchronization,
    preview,
    SynchronizationPlanningError,
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
export {
    codexMcpProjectionConstants,
    codexMcpProjectionDestination,
    isCodexMcpServerProjectable,
    renderCodexMcpConfigToml,
} from './codexMcpProjection';
export {
    buildGitHubCopilotMcpHandoff,
    githubCopilotMcpHandoffConstants,
} from './githubCopilotMcpHandoff';
export type {
    GitHubCopilotMcpHandoff,
    GitHubCopilotMcpServerHandoff,
} from './githubCopilotMcpHandoff';
export {
    codexConfigProjectionConstants,
    renderCodexConfigProjection,
} from './codexConfigProjection';
export { loadHooksForLayer, parseHookContent, hookManifestConstants } from './hookManifest';
export {
    loadExecutionProfilesForLayer,
    parseExecutionProfileContent,
    executionProfileConstants,
} from './executionProfile';
export {
    loadMemoryScopesForLayer,
    parseMemoryScopeContent,
    memoryScopeConstants,
} from './memoryScope';
export {
    loadEvaluationProfilesForLayer,
    parseEvaluationProfileContent,
    evaluationProfileConstants,
} from './evaluationProfile';
export {
    loadRuntimeEvidenceForLayer,
    parseRuntimeEvidenceContent,
    runtimeEvidenceConstants,
} from './runtimeEvidence';
export {
    codexAgentProfileDestination,
    loadAgentProfilesForLayer,
    parseAgentProfileContent,
    renderCodexAgentProfileToml,
} from './agentProfile';
export {
    contentManifestConstants,
    loadInstructionsForLayer,
    loadPromptsForLayer,
    parseContentManifestContent,
} from './contentManifest';
export { loadSkillsForLayer, parseSkillManifestContent, skillManifestConstants } from './skillManifest';
export {
    codexProjectConfigConstants,
    codexProjectConfigDestination,
    loadCodexProjectConfigsForLayer,
    parseCodexProjectConfigContent,
    renderCodexProjectConfigToml,
} from './codexProjectConfig';
export {
    codexHookProjectionConstants,
    codexHookProjectionDestination,
    isCodexHookProjectable,
    renderCodexHooksJson,
} from './codexHookProjection';
export {
    loadTargetAdaptersForLayer,
    parseTargetAdapterContent,
    targetAdapterConstants,
} from './targetAdapter';
export {
    loadPackageManifestsForLayer,
    parsePackageManifestContent,
    packageManifestConstants,
} from './packageManifest';
export {
    buildCodexPackageMarketplacePayload,
    buildGitHubCopilotPackageMarketplacePayload,
    buildPackageMarketplaceCandidatePayload,
    buildPackageMarketplaceEntries,
    buildPackageMarketplaceReport,
    normalizePackageMarketplaceName,
} from './packageMarketplaceExport';
export type {
    CodexPackageMarketplacePayload,
    GitHubCopilotPackageMarketplacePayload,
    PackageMarketplaceCandidateEntry,
    PackageMarketplaceReport,
    PackageMarketplaceReviewEntry,
    ResolvedPackageMarketplaceManifest,
} from './packageMarketplaceExport';
export { loadToolsForLayer, parseToolContent, toolManifestConstants } from './toolManifest';
export {
    parseRepoManifestContent,
    loadRepoManifestForRoot,
    repoManifestConstants,
} from './repoManifest';
export { buildAdapterReadinessReports } from './adapterReadiness';
export type { BuildAdapterReadinessReportsOptions } from './adapterReadiness';
export { parseFrontmatter } from './frontmatter';
export type { FrontmatterResult } from './frontmatter';
export type {
    AdapterReadinessAction,
    AdapterReadinessMetadataCounts,
    AdapterReadinessReport,
    AdapterReadinessSeverity,
    LayerFile,
    LayerContent,
    EffectiveFile,
    CapabilityMetadata,
    CapabilityAgentPluginManifest,
    CapabilityPluginCatalogEntry,
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    AgentProfileMetadata,
    CodexProjectConfigMetadata,
    CodexProjectConfigSettings,
    ContentMetadata,
    ContentRisk,
    ContentType,
    EvaluationProfileMetadata,
    EvaluationType,
    RuntimeEvidenceArtifactMetadata,
    RuntimeEvidenceMetadata,
    RuntimeEvidenceStatus,
    ExecutionIsolation,
    ExecutionProfileMetadata,
    ExecutionSurface,
    HookFailureBehavior,
    HookInvocationType,
    HookMetadata,
    HookTriggerPhase,
    McpServerInvocation,
    McpServerMetadata,
    McpServerTransport,
    MemoryScopeMetadata,
    MemoryScopeStorage,
    MemoryScopeType,
    PackageManifestMetadata,
    PolicyGrantApproval,
    PolicyGrantAuthorityCategory,
    PolicyGrantMetadata,
    RepoMetadata,
    SkillMetadata,
    SkillRisk,
    SurfacedFileConflict,
    SurfacedFileConflictSource,
    ArtifactClassification,
    ProjectionLossiness,
    ProjectionMetadata,
    ProjectionTarget,
    TargetAdapterMaterializationMode,
    TargetAdapterMetadata,
    TargetAdapterValidationStatus,
    TargetCapabilityConcept,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportReference,
    TargetCapabilitySupportStatus,
    ToolKind,
    ToolMetadata,
    OverlayResult,
    PendingAction,
    PendingChange,
} from './types';
export { TARGET_CAPABILITY_CONCEPTS } from './types';
export { describeProjection, describeProjectionWithTargetAdapters } from './projectionMetadata';
export {
    buildCodexSupportBoundariesDocument,
    buildTargetCapabilitySupportReference,
    getTargetCapabilityMatrix,
} from './targetCapabilityMatrix';
export type {
    CodexRuntimeEvidenceActionKind,
    CodexRuntimeEvidenceActionPlanConceptDetail,
    CodexRuntimeEvidenceActionPlanItem,
    CodexRuntimeEvidenceGateCondition,
    CodexRuntimeEvidenceGateResult,
    CodexRuntimeEvidenceGateSummary,
    CodexRuntimeEvidenceReadinessSummary,
    CodexSupportBoundariesDocument,
} from './targetCapabilityMatrix';
export {
    buildMigrationSuggestionsReport,
    formatMigrationSuggestionsReport,
} from './migrationSuggestions';
export type {
    MigrationSuggestion,
    MigrationSuggestionsReport,
} from './migrationSuggestions';
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
    SynchronizationPlanningConflict,
    SynchronizationPlanningConflictKind,
    SynchronizationPlanningConflictSource,
    SynchronizationPlan,
} from './synchronizer';
export type { SettingsEntry } from './settingsInjector';
