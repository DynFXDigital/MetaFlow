export { resolveLayers, buildEffectiveFileMap, discoverLayersInRepo } from './overlayEngine';
export type { ResolveLayersOptions } from './overlayEngine';
export { applyFilters, applyExcludedTypeFilters } from './filterEngine';
export { applyProfile } from './profileEngine';
export { getArtifactType } from './artifactType';
export type { ArtifactType } from './artifactType';
export { classifyFiles, classifySingle } from './classifier';
export { matchesGlob, matchesAnyGlob } from './globMatcher';
export { generateProvenanceHeader, parseProvenanceHeader, stripProvenanceHeader } from './provenanceHeader';
export {
    computeContentHash,
    loadManagedState,
    saveManagedState,
    createEmptyState,
    getStateDirPath,
} from './managedState';
export { checkDrift, checkAllDrift } from './driftDetector';
export { apply, clean, preview, toMaterializedRelativePath } from './materializer';
export { computeSettingsEntries, computeSettingsKeysToRemove } from './settingsInjector';
export {
    parseCapabilityManifestContent,
    loadCapabilityManifestForLayer,
    capabilityManifestConstants,
} from './capabilityManifest';
export type {
    LayerFile,
    LayerContent,
    EffectiveFile,
    CapabilityMetadata,
    CapabilityWarning,
    ArtifactClassification,
    OverlayResult,
    PendingAction,
    PendingChange,
} from './types';
export type { ProvenanceData } from './provenanceHeader';
export type { ManagedState, ManagedFileState } from './managedState';
export type { DriftStatus, DriftResult } from './driftDetector';
export type { ApplyOptions, ApplyResult } from './materializer';
export type { SettingsEntry } from './settingsInjector';