/**
 * Capability identity indexing and reconciliation helpers.
 *
 * These helpers intentionally do not mutate config. They build a current
 * repository capability index and classify stale path references so command
 * handlers can later decide whether and how to repair config.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MetaFlowConfig, MetadataRepo } from '../config/configSchema';
import {
    normalizeInputPath,
    resolvePathFromWorkspace,
    isWithinBoundary,
} from '../config/configPathUtils';
import { CapabilityWarning } from './types';
import { loadCapabilityManifestForLayer } from './capabilityManifest';
import { discoverLayersInRepo } from './overlayEngine';
import { ManagedCapabilityIdentityState } from './managedState';

export interface CapabilityIdentityIndexEntry {
    repoId: string;
    path: string;
    id: string;
    uid?: string;
    previousIds?: string[];
    previousPaths?: string[];
    name?: string;
    description?: string;
    license?: string;
    experimental?: boolean;
    manifestPath?: string;
}

export interface CapabilityIdentityIndex {
    generatedAt: string;
    entries: CapabilityIdentityIndexEntry[];
}

export interface BuildCapabilityIdentityIndexOptions {
    includeDisabledRepos?: boolean;
}

export type CapabilityReferenceResolutionKind =
    | 'path-found'
    | 'uid-match'
    | 'alias-match'
    | 'ambiguous'
    | 'no-match'
    | 'repo-missing'
    | 'path-outside-repo';

export interface ConfiguredCapabilityReference {
    source: 'metadataRepos.capabilities' | 'layerSources' | 'profiles.layerOverrides' | 'layers';
    repoId: string;
    path: string;
    enabled?: boolean;
    profileId?: string;
}

export interface CapabilityReferenceResolution {
    reference: ConfiguredCapabilityReference;
    kind: CapabilityReferenceResolutionKind;
    candidates: CapabilityIdentityIndexEntry[];
    matchReason?: 'uid' | 'previousPath' | 'previousId';
    previousEntry?: CapabilityIdentityIndexEntry;
}

export interface CapabilityReferenceRepair {
    source: ConfiguredCapabilityReference['source'];
    repoId: string;
    oldPath: string;
    newPath: string;
    kind: 'uid-match' | 'alias-match';
    matchReason: 'uid' | 'previousPath' | 'previousId';
    profileId?: string;
}

export interface CapabilityReferenceRepairResult {
    repaired: CapabilityReferenceRepair[];
}

function deriveCapabilityId(layerPath: string, repoRoot: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

function normalizeLayerPath(layerPath: string): string {
    return normalizeInputPath(layerPath || '.').replace(/\\/g, '/');
}

function normalizeAliasPath(layerPath: string): string {
    return normalizeLayerPath(layerPath);
}

function pushRepoEntries(
    entries: CapabilityIdentityIndexEntry[],
    workspaceRoot: string,
    repoId: string,
    repo: MetadataRepo & { enabled?: boolean; discover?: { exclude?: string[] } },
    options: BuildCapabilityIdentityIndexOptions,
): void {
    if (repo.enabled === false && !options.includeDisabledRepos) {
        return;
    }

    const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
    if (!fs.existsSync(repoRoot)) {
        return;
    }

    const layerPaths = discoverLayersInRepo(repoRoot, repo.discover?.exclude);
    for (const layerPath of layerPaths) {
        const normalizedPath = normalizeLayerPath(layerPath);
        const layerAbsPath = path.join(repoRoot, normalizedPath);
        if (!isWithinBoundary(layerAbsPath, repoRoot) || !fs.existsSync(layerAbsPath)) {
            continue;
        }

        const capabilityId = deriveCapabilityId(normalizedPath, repoRoot);
        const manifest = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
        entries.push({
            repoId,
            path: normalizedPath,
            id: manifest?.id ?? capabilityId,
            uid: manifest?.uid,
            previousIds: manifest?.previousIds,
            previousPaths: manifest?.previousPaths?.map(normalizeAliasPath),
            name: manifest?.name,
            description: manifest?.description,
            license: manifest?.license,
            experimental: manifest?.experimental,
            manifestPath: manifest?.manifestPath,
        });
    }
}

export function buildCapabilityIdentityIndexFromConfig(
    config: MetaFlowConfig,
    workspaceRoot: string,
    options: BuildCapabilityIdentityIndexOptions = {},
): CapabilityIdentityIndex {
    const entries: CapabilityIdentityIndexEntry[] = [];

    if (config.metadataRepos) {
        for (const repo of config.metadataRepos) {
            pushRepoEntries(entries, workspaceRoot, repo.id, repo, options);
        }
    } else if (config.metadataRepo) {
        pushRepoEntries(
            entries,
            workspaceRoot,
            'primary',
            { ...config.metadataRepo, enabled: true },
            options,
        );
    }

    entries.sort((left, right) =>
        `${left.repoId}:${left.path}`.localeCompare(`${right.repoId}:${right.path}`),
    );

    return {
        generatedAt: new Date().toISOString(),
        entries,
    };
}

export function capabilityIdentityIndexToManagedState(
    index: CapabilityIdentityIndex,
): ManagedCapabilityIdentityState {
    return {
        updatedAt: index.generatedAt,
        entries: index.entries.map((entry) => ({
            repoId: entry.repoId,
            path: entry.path,
            id: entry.id,
            ...(entry.uid !== undefined ? { uid: entry.uid } : {}),
            ...(entry.previousIds !== undefined ? { previousIds: [...entry.previousIds] } : {}),
            ...(entry.previousPaths !== undefined
                ? { previousPaths: [...entry.previousPaths] }
                : {}),
            ...(entry.name !== undefined ? { name: entry.name } : {}),
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.license !== undefined ? { license: entry.license } : {}),
            ...(entry.experimental !== undefined ? { experimental: entry.experimental } : {}),
            ...(entry.manifestPath !== undefined ? { manifestPath: entry.manifestPath } : {}),
        })),
    };
}

export function managedStateToCapabilityIdentityIndex(
    state: ManagedCapabilityIdentityState | undefined,
): CapabilityIdentityIndex | undefined {
    if (!state) {
        return undefined;
    }

    return {
        generatedAt: state.updatedAt,
        entries: state.entries.map((entry) => ({
            repoId: entry.repoId,
            path: normalizeLayerPath(entry.path),
            id: entry.id,
            ...(entry.uid !== undefined ? { uid: entry.uid } : {}),
            ...(entry.previousIds !== undefined ? { previousIds: [...entry.previousIds] } : {}),
            ...(entry.previousPaths !== undefined
                ? { previousPaths: entry.previousPaths.map(normalizeAliasPath) }
                : {}),
            ...(entry.name !== undefined ? { name: entry.name } : {}),
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.license !== undefined ? { license: entry.license } : {}),
            ...(entry.experimental !== undefined ? { experimental: entry.experimental } : {}),
            ...(entry.manifestPath !== undefined ? { manifestPath: entry.manifestPath } : {}),
        })),
    };
}

function warning(code: string, message: string, filePath?: string): CapabilityWarning {
    return {
        code,
        message,
        filePath,
        severity: 'error',
    };
}

export function collectCapabilityIdentityIndexWarnings(
    index: CapabilityIdentityIndex,
): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];
    const uidEntries = new Map<string, CapabilityIdentityIndexEntry[]>();
    const aliasEntries = new Map<string, CapabilityIdentityIndexEntry[]>();

    for (const entry of index.entries) {
        if (entry.uid) {
            const uid = entry.uid.toLowerCase();
            const entries = uidEntries.get(uid) ?? [];
            entries.push(entry);
            uidEntries.set(uid, entries);
        }

        for (const previousPath of entry.previousPaths ?? []) {
            const key = `${entry.repoId}:path:${normalizeAliasPath(previousPath)}`;
            const entries = aliasEntries.get(key) ?? [];
            entries.push(entry);
            aliasEntries.set(key, entries);
        }

        for (const previousId of entry.previousIds ?? []) {
            const key = `${entry.repoId}:id:${previousId.trim().toLowerCase()}`;
            const entries = aliasEntries.get(key) ?? [];
            entries.push(entry);
            aliasEntries.set(key, entries);
        }
    }

    for (const [uid, entries] of uidEntries) {
        if (entries.length < 2) {
            continue;
        }
        const paths = entries.map((entry) => `${entry.repoId}/${entry.path}`).sort();
        for (const entry of entries) {
            warnings.push(
                warning(
                    'CAPABILITY_IDENTITY_UID_DUPLICATE',
                    `Capability uid ${uid} is declared by multiple capabilities: ${paths.join(', ')}.`,
                    entry.manifestPath,
                ),
            );
        }
    }

    for (const [aliasKey, entries] of aliasEntries) {
        if (entries.length < 2) {
            continue;
        }
        const [, aliasKind, aliasValue] = aliasKey.split(':');
        const paths = entries.map((entry) => `${entry.repoId}/${entry.path}`).sort();
        for (const entry of entries) {
            warnings.push(
                warning(
                    'CAPABILITY_IDENTITY_ALIAS_DUPLICATE',
                    `Capability previous ${aliasKind} ${aliasValue} resolves to multiple capabilities: ${paths.join(', ')}.`,
                    entry.manifestPath,
                ),
            );
        }
    }

    return warnings;
}

function collectConfiguredReferences(
    config: MetaFlowConfig,
    includeDisabled: boolean,
): ConfiguredCapabilityReference[] {
    const references: ConfiguredCapabilityReference[] = [];

    for (const repo of config.metadataRepos ?? []) {
        for (const capability of repo.capabilities ?? []) {
            if (capability.enabled === false && !includeDisabled) {
                continue;
            }
            references.push({
                source: 'metadataRepos.capabilities',
                repoId: repo.id,
                path: normalizeLayerPath(capability.path),
                enabled: capability.enabled,
            });
        }
    }

    for (const source of config.layerSources ?? []) {
        if (source.enabled === false && !includeDisabled) {
            continue;
        }
        references.push({
            source: 'layerSources',
            repoId: source.repoId,
            path: normalizeLayerPath(source.path),
            enabled: source.enabled,
        });
    }

    if (config.metadataRepo && config.layers) {
        for (const layerPath of config.layers) {
            references.push({
                source: 'layers',
                repoId: 'primary',
                path: normalizeLayerPath(layerPath),
            });
        }
    }

    for (const [profileId, profile] of Object.entries(config.profiles ?? {})) {
        for (const override of profile.layerOverrides ?? []) {
            if (override.enabled === false && !includeDisabled) {
                continue;
            }
            references.push({
                source: 'profiles.layerOverrides',
                repoId: override.repoId,
                path: normalizeLayerPath(override.path),
                enabled: override.enabled,
                profileId,
            });
        }
    }

    return references;
}

function repoRootForReference(
    config: MetaFlowConfig,
    workspaceRoot: string,
    repoId: string,
): string | undefined {
    if (config.metadataRepos) {
        const repo = config.metadataRepos.find((candidate) => candidate.id === repoId);
        return repo ? resolvePathFromWorkspace(workspaceRoot, repo.localPath) : undefined;
    }

    if (repoId === 'primary' && config.metadataRepo) {
        return resolvePathFromWorkspace(workspaceRoot, config.metadataRepo.localPath);
    }

    return undefined;
}

function exactPathEntry(
    index: CapabilityIdentityIndex,
    reference: ConfiguredCapabilityReference,
): CapabilityIdentityIndexEntry | undefined {
    return index.entries.find(
        (entry) => entry.repoId === reference.repoId && entry.path === reference.path,
    );
}

function entriesForUid(
    index: CapabilityIdentityIndex,
    repoId: string,
    uid: string | undefined,
): CapabilityIdentityIndexEntry[] {
    if (!uid) {
        return [];
    }
    const normalizedUid = uid.toLowerCase();
    return index.entries.filter(
        (entry) => entry.repoId === repoId && entry.uid?.toLowerCase() === normalizedUid,
    );
}

function entriesForAlias(
    index: CapabilityIdentityIndex,
    reference: ConfiguredCapabilityReference,
    previousEntry: CapabilityIdentityIndexEntry | undefined,
): { candidates: CapabilityIdentityIndexEntry[]; matchReason?: 'previousPath' | 'previousId' } {
    const previousPathCandidates = index.entries.filter(
        (entry) =>
            entry.repoId === reference.repoId &&
            (entry.previousPaths ?? []).includes(reference.path),
    );
    if (previousPathCandidates.length > 0) {
        return {
            candidates: previousPathCandidates,
            matchReason: 'previousPath',
        };
    }

    if (!previousEntry?.id) {
        return { candidates: [] };
    }

    const previousId = previousEntry.id.toLowerCase();
    return {
        candidates: index.entries.filter(
            (entry) =>
                entry.repoId === reference.repoId &&
                (entry.previousIds ?? []).some((id) => id.toLowerCase() === previousId),
        ),
        matchReason: 'previousId',
    };
}

export function reconcileConfiguredCapabilityReferences(
    config: MetaFlowConfig,
    workspaceRoot: string,
    currentIndex: CapabilityIdentityIndex,
    lastKnownIndex?: CapabilityIdentityIndex,
    options: { includeDisabled?: boolean } = {},
): CapabilityReferenceResolution[] {
    const resolutions: CapabilityReferenceResolution[] = [];
    const references = collectConfiguredReferences(config, options.includeDisabled === true);

    for (const reference of references) {
        const repoRoot = repoRootForReference(config, workspaceRoot, reference.repoId);
        if (!repoRoot || !fs.existsSync(repoRoot)) {
            resolutions.push({ reference, kind: 'repo-missing', candidates: [] });
            continue;
        }

        const layerAbsPath = path.join(repoRoot, reference.path);
        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            resolutions.push({ reference, kind: 'path-outside-repo', candidates: [] });
            continue;
        }

        const existing = exactPathEntry(currentIndex, reference);
        if (existing && fs.existsSync(layerAbsPath)) {
            resolutions.push({ reference, kind: 'path-found', candidates: [existing] });
            continue;
        }

        const previousEntry = lastKnownIndex ? exactPathEntry(lastKnownIndex, reference) : undefined;
        const uidCandidates = entriesForUid(currentIndex, reference.repoId, previousEntry?.uid);
        if (uidCandidates.length === 1) {
            resolutions.push({
                reference,
                kind: 'uid-match',
                candidates: uidCandidates,
                matchReason: 'uid',
                previousEntry,
            });
            continue;
        }
        if (uidCandidates.length > 1) {
            resolutions.push({
                reference,
                kind: 'ambiguous',
                candidates: uidCandidates,
                matchReason: 'uid',
                previousEntry,
            });
            continue;
        }

        const alias = entriesForAlias(currentIndex, reference, previousEntry);
        if (alias.candidates.length === 1) {
            resolutions.push({
                reference,
                kind: 'alias-match',
                candidates: alias.candidates,
                matchReason: alias.matchReason,
                previousEntry,
            });
            continue;
        }
        if (alias.candidates.length > 1) {
            resolutions.push({
                reference,
                kind: 'ambiguous',
                candidates: alias.candidates,
                matchReason: alias.matchReason,
                previousEntry,
            });
            continue;
        }

        resolutions.push({
            reference,
            kind: 'no-match',
            candidates: [],
            previousEntry,
        });
    }

    return resolutions;
}

function shouldRepairResolution(
    resolution: CapabilityReferenceResolution,
): resolution is CapabilityReferenceResolution & {
    kind: 'uid-match' | 'alias-match';
    candidates: [CapabilityIdentityIndexEntry];
    matchReason: 'uid' | 'previousPath' | 'previousId';
} {
    return (
        (resolution.kind === 'uid-match' || resolution.kind === 'alias-match') &&
        resolution.candidates.length === 1 &&
        resolution.matchReason !== undefined
    );
}

function repairRecordPath(
    record: { path: string },
    reference: ConfiguredCapabilityReference,
    newPath: string,
): boolean {
    if (normalizeLayerPath(record.path) !== reference.path) {
        return false;
    }

    record.path = newPath;
    return true;
}

function pushRepair(
    repaired: CapabilityReferenceRepair[],
    resolution: CapabilityReferenceResolution & {
        kind: 'uid-match' | 'alias-match';
        matchReason: 'uid' | 'previousPath' | 'previousId';
    },
    newPath: string,
): void {
    repaired.push({
        source: resolution.reference.source,
        repoId: resolution.reference.repoId,
        oldPath: resolution.reference.path,
        newPath,
        kind: resolution.kind,
        matchReason: resolution.matchReason,
        ...(resolution.reference.profileId
            ? { profileId: resolution.reference.profileId }
            : {}),
    });
}

export function applyCapabilityReferenceRepairs(
    config: MetaFlowConfig,
    resolutions: CapabilityReferenceResolution[],
): CapabilityReferenceRepairResult {
    const repaired: CapabilityReferenceRepair[] = [];

    for (const resolution of resolutions) {
        if (!shouldRepairResolution(resolution)) {
            continue;
        }

        const newPath = resolution.candidates[0].path;
        if (newPath === resolution.reference.path) {
            continue;
        }

        if (resolution.reference.source === 'metadataRepos.capabilities') {
            const repo = config.metadataRepos?.find(
                (candidate) => candidate.id === resolution.reference.repoId,
            );
            const capability = repo?.capabilities?.find((candidate) =>
                repairRecordPath(candidate, resolution.reference, newPath),
            );
            if (capability) {
                pushRepair(repaired, resolution, newPath);
            }
            continue;
        }

        if (resolution.reference.source === 'layerSources') {
            const layerSource = config.layerSources?.find(
                (candidate) =>
                    candidate.repoId === resolution.reference.repoId &&
                    repairRecordPath(candidate, resolution.reference, newPath),
            );
            if (layerSource) {
                pushRepair(repaired, resolution, newPath);
            }
            continue;
        }

        if (resolution.reference.source === 'layers') {
            const layerIndex = config.layers?.findIndex(
                (candidate) => normalizeLayerPath(candidate) === resolution.reference.path,
            );
            if (layerIndex !== undefined && layerIndex >= 0 && config.layers) {
                config.layers[layerIndex] = newPath;
                pushRepair(repaired, resolution, newPath);
            }
            continue;
        }

        const profileId = resolution.reference.profileId;
        if (!profileId) {
            continue;
        }

        const override = config.profiles?.[profileId]?.layerOverrides?.find(
            (candidate) =>
                candidate.repoId === resolution.reference.repoId &&
                repairRecordPath(candidate, resolution.reference, newPath),
        );
        if (override) {
            pushRepair(repaired, resolution, newPath);
        }
    }

    return { repaired };
}
