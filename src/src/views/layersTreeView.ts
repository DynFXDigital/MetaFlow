/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as vscode from 'vscode';
import { ExcludableArtifactType, EffectiveFile, getArtifactType } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    BUILT_IN_CAPABILITY_REPO_LABEL,
} from '../builtInCapability';

type LayersViewMode = 'flat' | 'tree';

interface LayerEntry {
    label: string;
    layerIndex: number;
    enabled: boolean;
    repoId?: string;
    repoLabel: string;
    repoDisabled?: boolean;
    toggleable: boolean;
    normalizedPath: string;
    capability?: {
        id?: string;
        name?: string;
        description?: string;
        license?: string;
    };
}

class LayerRepoItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string,
        repoDisabled: boolean
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'layerRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        this.description = repoDisabled ? '(disabled)' : '';
    }
}

class LayerItem extends vscode.TreeItem {
    readonly layerIndex?: number;
    readonly repoId?: string;
    readonly pathKey?: string;

    constructor(
        label: string,
        enabled?: boolean,
        layerIndex?: number,
        options?: {
            repoId?: string;
            repoDisabled?: boolean;
            toggleable?: boolean;
            hasChildren?: boolean;
            path?: string;
            excludedCount?: number;
            capabilityName?: string;
            capabilityId?: string;
            capabilityDescription?: string;
            capabilityLicense?: string;
        }
    ) {
        const hasChildren = options?.hasChildren === true;
        super(
            label,
            hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.layerIndex = layerIndex;
        this.repoId = options?.repoId;
        this.pathKey = options?.path;

        if (typeof layerIndex === 'number') {
            this.contextValue = 'layer';
            this.checkboxState = enabled
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;
        } else {
            this.contextValue = 'layerFolder';
        }

        const excludedHint = (options?.excludedCount ?? 0) > 0
            ? `, ${options!.excludedCount} excluded`
            : '';
        if (options?.repoId && typeof layerIndex === 'number') {
            this.description = options.repoDisabled
                ? `(${options.repoId}, repo disabled)`
                : `(${options.repoId}${excludedHint})`;
        } else if (options?.toggleable === false && typeof layerIndex === 'number') {
            this.description = '(single-repo, fixed order)';
        } else {
            this.description = excludedHint ? `(${excludedHint.slice(2)})` : '';
        }

        if (typeof layerIndex === 'number' && typeof enabled === 'boolean') {
            this.accessibilityInformation = {
                label: `${label} ${enabled ? 'enabled' : 'disabled'}`,
                role: 'checkbox',
            };
        }

        if (options?.path) {
            this.id = options.path;
        }

        if (options?.capabilityName || options?.capabilityId || options?.capabilityDescription || options?.capabilityLicense) {
            const capabilityName = options.capabilityName ?? options.capabilityId ?? 'Unknown capability';
            const detailLines: string[] = [`Capability: ${capabilityName}`];
            if (options.capabilityDescription) {
                detailLines.push(`Description: ${options.capabilityDescription}`);
            }
            if (options.capabilityLicense) {
                detailLines.push(`License: ${options.capabilityLicense}`);
            }
            this.tooltip = detailLines.join('\n');
        }
    }
}

const ARTIFACT_TYPE_ORDER: ExcludableArtifactType[] = ['instructions', 'prompts', 'agents', 'skills'];

class ArtifactTypeLayerItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ExcludableArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string | undefined,
        excluded: boolean
    ) {
        super(artifactType, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layerArtifactType';
        this.checkboxState = excluded
            ? vscode.TreeItemCheckboxState.Unchecked
            : vscode.TreeItemCheckboxState.Checked;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = excluded ? '(excluded)' : '';
    }
}

type LayerTreeItem = LayerRepoItem | LayerItem | ArtifactTypeLayerItem;

export class LayersTreeViewProvider implements vscode.TreeDataProvider<LayerTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LayerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _parentMap = new WeakMap<LayerTreeItem, LayerTreeItem | undefined>();

    constructor(
        private state: ExtensionState,
        private readonly modeResolver: () => LayersViewMode = () =>
            vscode.workspace.getConfiguration('metaflow').get<LayersViewMode>('layersViewMode', 'flat')
    ) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: LayerTreeItem): vscode.TreeItem {
        return element;
    }

    private trackChildren<T extends LayerTreeItem>(items: T[], parent: LayerTreeItem | undefined): T[] {
        for (const item of items) {
            this._parentMap.set(item, parent);
        }
        return items;
    }

    private formatLayerLabel(layerPath: string, repoLabel?: string): string {
        if (layerPath !== '.') {
            return layerPath;
        }

        return repoLabel?.trim() || 'primary';
    }

    private normalizeLayerPath(layerPath: string): string {
        return layerPath === '.' ? '' : layerPath;
    }

    private normalizeLayerId(layerId: string): string {
        const normalized = layerId.replace(/\\/g, '/').replace(/\/+$/, '');
        return normalized === '' ? '.' : normalized;
    }

    private getCapabilityMetadataByLayerId(): Map<string, { id?: string; name?: string; description?: string; license?: string }> {
        const capabilityByLayer = new Map<string, { id?: string; name?: string; description?: string; license?: string }>();

        for (const [layerId, metadata] of Object.entries(this.state.capabilityByLayer ?? {})) {
            capabilityByLayer.set(this.normalizeLayerId(layerId), metadata);
        }

        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            const normalized = this.normalizeLayerId(file.sourceLayer || '');
            if (!normalized || capabilityByLayer.has(normalized)) {
                continue;
            }

            if (file.sourceCapabilityId || file.sourceCapabilityName || file.sourceCapabilityDescription || file.sourceCapabilityLicense) {
                capabilityByLayer.set(normalized, {
                    id: file.sourceCapabilityId,
                    name: file.sourceCapabilityName,
                    description: file.sourceCapabilityDescription,
                    license: file.sourceCapabilityLicense,
                });
            }
        }

        return capabilityByLayer;
    }

    private getLayerEntries(): LayerEntry[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const capabilityByLayer = this.getCapabilityMetadataByLayerId();

        if (config.metadataRepos && config.layerSources) {
            const repoEnabled = new Map(config.metadataRepos.map(repo => [repo.id, repo.enabled !== false]));
            const repoLabels = new Map(config.metadataRepos.map(repo => [repo.id, repo.name?.trim() || repo.id]));

            const entries: LayerEntry[] = config.layerSources.map((ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                const layerId = `${ls.repoId}/${ls.path}`;
                const capability = capabilityByLayer.get(this.normalizeLayerId(layerId));
                return {
                    label: this.formatLayerLabel(ls.path, repoLabels.get(ls.repoId)),
                    layerIndex: i,
                    enabled: isRepoEnabled && isLayerEnabled,
                    repoId: ls.repoId,
                    repoLabel: repoLabels.get(ls.repoId) || ls.repoId,
                    repoDisabled: !isRepoEnabled,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(ls.path),
                    capability,
                };
            });

            if (this.state.builtInCapability.enabled) {
                const builtInLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`;
                entries.push({
                    label: this.formatLayerLabel(BUILT_IN_CAPABILITY_LAYER_PATH, BUILT_IN_CAPABILITY_REPO_LABEL),
                    layerIndex: config.layerSources.length,
                    enabled: this.state.builtInCapability.layerEnabled,
                    repoId: BUILT_IN_CAPABILITY_REPO_ID,
                    repoLabel: BUILT_IN_CAPABILITY_REPO_LABEL,
                    repoDisabled: false,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(BUILT_IN_CAPABILITY_LAYER_PATH),
                    capability: capabilityByLayer.get(this.normalizeLayerId(builtInLayerId)),
                });
            }

            return entries;
        }

        if (config.layers) {
            const singleRepoLabel = config.metadataRepo?.name?.trim() || 'primary';
            const entries: LayerEntry[] = config.layers.map((layer, i) => {
                const normalizedLayerId = this.normalizeLayerId(layer);
                const capability = capabilityByLayer.get(normalizedLayerId);
                return {
                label: this.formatLayerLabel(layer, singleRepoLabel),
                layerIndex: i,
                enabled: true,
                repoLabel: singleRepoLabel,
                toggleable: true,
                normalizedPath: this.normalizeLayerPath(layer),
                    capability,
                };
            });

            if (this.state.builtInCapability.enabled) {
                const builtInLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`;
                entries.push({
                    label: this.formatLayerLabel(BUILT_IN_CAPABILITY_LAYER_PATH, BUILT_IN_CAPABILITY_REPO_LABEL),
                    layerIndex: config.layers.length,
                    enabled: this.state.builtInCapability.layerEnabled,
                    repoId: BUILT_IN_CAPABILITY_REPO_ID,
                    repoLabel: BUILT_IN_CAPABILITY_REPO_LABEL,
                    repoDisabled: false,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(BUILT_IN_CAPABILITY_LAYER_PATH),
                    capability: capabilityByLayer.get(this.normalizeLayerId(builtInLayerId)),
                });
            }

            return entries;
        }

        return [];
    }

    private getExcludedCount(layerIndex: number): number {
        const ls = this.state.config?.layerSources?.[layerIndex];
        return ls?.excludedTypes?.length ?? 0;
    }

    private getTreeChildrenForPrefix(entries: LayerEntry[], prefix: string, repoId?: string, mode?: LayersViewMode): LayerItem[] {
        const children = new Map<string, { path: string; label: string }>();
        const rootEntry = entries.find(entry => entry.normalizedPath === '');

        for (const entry of entries) {
            if (entry.normalizedPath === '') {
                continue;
            }

            if (prefix && !entry.normalizedPath.startsWith(prefix + '/')) {
                continue;
            }

            const remainder = prefix
                ? entry.normalizedPath.slice(prefix.length + 1)
                : entry.normalizedPath;
            const [segment] = remainder.split('/');
            if (!segment) {
                continue;
            }

            const childPath = prefix ? `${prefix}/${segment}` : segment;
            if (!children.has(childPath)) {
                children.set(childPath, { path: childPath, label: segment });
            }
        }

        const folderAndLayerItems = Array.from(children.values())
            .map(node => {
                const matchingEntry = entries.find(entry => entry.normalizedPath === node.path);
                const hasChildren = entries.some(entry => entry.normalizedPath.startsWith(node.path + '/'));
                const hasArtifactTypeChildren =
                    mode === 'tree' &&
                    typeof matchingEntry?.layerIndex === 'number' &&
                    matchingEntry.enabled === true &&
                    this.getActiveTypesForLayer(matchingEntry.layerIndex).size > 0;
                return new LayerItem(node.label, matchingEntry?.enabled, matchingEntry?.layerIndex, {
                    repoId: matchingEntry?.repoId ?? repoId,
                    repoDisabled: matchingEntry?.repoDisabled,
                    toggleable: matchingEntry?.toggleable,
                    hasChildren: hasChildren || hasArtifactTypeChildren,
                    path: node.path,
                    excludedCount: typeof matchingEntry?.layerIndex === 'number' ? this.getExcludedCount(matchingEntry.layerIndex) : undefined,
                    capabilityName: matchingEntry?.capability?.name,
                    capabilityId: matchingEntry?.capability?.id,
                    capabilityDescription: matchingEntry?.capability?.description,
                    capabilityLicense: matchingEntry?.capability?.license,
                });
            })
            .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));

        if (!prefix && rootEntry) {
            const rootLabel = entries[0]?.repoId
                ? 'root'
                : rootEntry.label;
            const rootHasArtifactChildren =
                mode === 'tree' &&
                typeof rootEntry.layerIndex === 'number' &&
                rootEntry.enabled === true &&
                this.getActiveTypesForLayer(rootEntry.layerIndex).size > 0;
            folderAndLayerItems.unshift(
                new LayerItem(rootLabel, rootEntry.enabled, rootEntry.layerIndex, {
                    repoId: rootEntry.repoId ?? repoId,
                    repoDisabled: rootEntry.repoDisabled,
                    toggleable: rootEntry.toggleable,
                    hasChildren: rootHasArtifactChildren,
                    path: '(root)',
                    excludedCount: typeof rootEntry.layerIndex === 'number' ? this.getExcludedCount(rootEntry.layerIndex) : undefined,
                    capabilityName: rootEntry.capability?.name,
                    capabilityId: rootEntry.capability?.id,
                    capabilityDescription: rootEntry.capability?.description,
                    capabilityLicense: rootEntry.capability?.license,
                })
            );
        }

        return folderAndLayerItems;
    }

    /**
     * Computes the set of artifact types that are active (have files or are explicitly excluded)
     * for a given multi-repo layer source. Returns an empty set for disabled or unknown layers.
     */
    private getActiveTypesForLayer(layerIndex: number): Set<ExcludableArtifactType> {
        const config = this.state.config;
        if (!config) {
            return new Set();
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];

        if (!layerSource && typeof singleLayerPath !== 'string') {
            return new Set();
        }

        const layerId = layerSource
            ? `${layerSource.repoId}/${layerSource.path}`
            : singleLayerPath!;
        const normalizedLayerId = this.normalizeLayerId(layerId);

        const result = new Set<ExcludableArtifactType>();
        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            if (this.normalizeLayerId(file.sourceLayer) === normalizedLayerId) {
                const type = getArtifactType(file.relativePath);
                if (type !== 'other') {
                    result.add(type as ExcludableArtifactType);
                }
            }
        }
        for (const t of (layerSource?.excludedTypes ?? [])) {
            result.add(t);
        }
        return result;
    }

    /**
     * Returns ArtifactTypeLayerItems for a given layer source.
     * Only shown in tree mode for enabled leaf LayerItem nodes that have matching files.
     */
    private getArtifactTypeChildren(layerIndex: number, repoId?: string): ArtifactTypeLayerItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];
        if (!layerSource && typeof singleLayerPath !== 'string') {
            return [];
        }

        // Don't show artifact-type children for disabled layers
        const isRepoEnabled = layerSource
            ? this.state.config?.metadataRepos
                ?.find((r: { id: string; enabled?: boolean }) => r.id === layerSource.repoId)?.enabled !== false
            : true;
        const isLayerEnabled = layerSource ? layerSource.enabled !== false : true;
        if (!isRepoEnabled || !isLayerEnabled) {
            return [];
        }

        const activeTypes = this.getActiveTypesForLayer(layerIndex);
        if (activeTypes.size === 0) {
            return [];
        }
        const excludedTypes = layerSource?.excludedTypes ?? [];
        return ARTIFACT_TYPE_ORDER
            .filter(type => activeTypes.has(type))
            .map(type => new ArtifactTypeLayerItem(type, layerIndex, layerSource?.repoId ?? repoId, excludedTypes.includes(type)));
    }

    getChildren(element?: LayerTreeItem): LayerTreeItem[] {
        const entries = this.getLayerEntries();
        if (entries.length === 0) {
            return [];
        }

        const mode = this.modeResolver();
        if (mode === 'flat') {
            if (element) {
                return [];
            }

            return entries.map(entry =>
                new LayerItem(entry.label, entry.enabled, entry.layerIndex, {
                    repoId: entry.repoId,
                    repoDisabled: entry.repoDisabled,
                    toggleable: entry.toggleable,
                    hasChildren: false,
                    path: entry.normalizedPath || '(root)',
                    excludedCount: this.getExcludedCount(entry.layerIndex),
                    capabilityName: entry.capability?.name,
                    capabilityId: entry.capability?.id,
                    capabilityDescription: entry.capability?.description,
                    capabilityLicense: entry.capability?.license,
                })
            );
        }

        if (element instanceof LayerRepoItem) {
            const repoEntries = entries.filter(entry => entry.repoId === element.repoId);
            return this.trackChildren(this.getTreeChildrenForPrefix(repoEntries, '', element.repoId, mode), element);
        }

        if (element instanceof LayerItem) {
            const parentPath = element.pathKey === '(root)' ? '' : element.pathKey || '';
            const repoEntries = element.repoId
                ? entries.filter(entry => entry.repoId === element.repoId)
                : entries.filter(entry => entry.repoId === undefined);

            // A node can be both a concrete layer (has layerIndex) and a folder with child layers.
            // In that case, expose both descendants and artifact-type toggles.
            const folderChildren = this.getTreeChildrenForPrefix(repoEntries, parentPath, element.repoId, mode)
                .filter(child => child.pathKey !== '(root)');

            if (typeof element.layerIndex === 'number' && mode === 'tree') {
                const artifactChildren = this.getArtifactTypeChildren(element.layerIndex, element.repoId);
                return this.trackChildren([...folderChildren, ...artifactChildren], element);
            }

            return this.trackChildren(folderChildren, element);
        }

        if (this.state.config?.metadataRepos && this.state.config.layerSources) {
            const repoOrder = new Map(this.state.config.metadataRepos.map((repo, idx) => [repo.id, idx]));
            const repoDisabled = new Map(this.state.config.metadataRepos.map(repo => [repo.id, repo.enabled === false]));
            const repoLabels = new Map(this.state.config.metadataRepos.map(repo => [repo.id, repo.name?.trim() || repo.id]));

            if (this.state.builtInCapability.enabled) {
                repoOrder.set(BUILT_IN_CAPABILITY_REPO_ID, Number.MAX_SAFE_INTEGER);
                repoDisabled.set(BUILT_IN_CAPABILITY_REPO_ID, false);
                repoLabels.set(BUILT_IN_CAPABILITY_REPO_ID, BUILT_IN_CAPABILITY_REPO_LABEL);
            }

            const repoIds = Array.from(new Set(entries.map(entry => entry.repoId).filter((id): id is string => typeof id === 'string')));
            return this.trackChildren(repoIds
                .sort((a, b) => (repoOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (repoOrder.get(b) ?? Number.MAX_SAFE_INTEGER))
                .map(repoId => new LayerRepoItem(repoLabels.get(repoId) || repoId, repoId, repoDisabled.get(repoId) === true)), undefined);
        }

        return this.trackChildren(this.getTreeChildrenForPrefix(entries, ''), undefined);
    }

    getParent(element: LayerTreeItem): LayerTreeItem | undefined {
        return this._parentMap.get(element);
    }
}
