export { resolveLayers, buildEffectiveFileMap } from './overlayEngine';
export { applyFilters } from './filterEngine';
export { applyProfile } from './profileEngine';
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
export type {
    LayerFile,
    LayerContent,
    EffectiveFile,
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