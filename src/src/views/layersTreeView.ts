/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as vscode from 'vscode';
import { ExcludableArtifactType, EffectiveFile, getArtifactType } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';

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

        if (options?.repoId && typeof layerIndex === 'number') {
            this.description = options.repoDisabled ? `(${options.repoId}, repo disabled)` : `(${options.repoId})`;
        } else if (options?.toggleable === false && typeof layerIndex === 'number') {
            this.description = '(single-repo, fixed order)';
        } else {
            this.description = '';
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
    }
}

const ARTIFACT_TYPE_ORDER: ExcludableArtifactType[] = ['instructions', 'prompts', 'agents', 'skills'];

class ArtifactTypeLayerItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ExcludableArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string,
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

    private getLayerEntries(): LayerEntry[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        if (config.metadataRepos && config.layerSources) {
            const repoEnabled = new Map(config.metadataRepos.map(repo => [repo.id, repo.enabled !== false]));
            const repoLabels = new Map(config.metadataRepos.map(repo => [repo.id, repo.name?.trim() || repo.id]));

            return config.layerSources.map((ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                return {
                    label: this.formatLayerLabel(ls.path, repoLabels.get(ls.repoId)),
                    layerIndex: i,
                    enabled: isRepoEnabled && isLayerEnabled,
                    repoId: ls.repoId,
                    repoLabel: repoLabels.get(ls.repoId) || ls.repoId,
                    repoDisabled: !isRepoEnabled,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(ls.path),
                };
            });
        }

        if (config.layers) {
            const singleRepoLabel = config.metadataRepo?.name?.trim() || 'primary';
            return config.layers.map((layer, i) => ({
                label: this.formatLayerLabel(layer, singleRepoLabel),
                layerIndex: i,
                enabled: true,
                repoLabel: singleRepoLabel,
                toggleable: true,
                normalizedPath: this.normalizeLayerPath(layer),
            }));
        }

        return [];
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
        const layerSources = this.state.config?.layerSources;
        if (!layerSources) {
            return new Set();
        }
        const ls = layerSources[layerIndex];
        if (!ls) {
            return new Set();
        }
        const layerId = `${ls.repoId}/${ls.path}`;
        const result = new Set<ExcludableArtifactType>();
        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            if (file.sourceLayer === layerId) {
                const type = getArtifactType(file.relativePath);
                if (type !== 'other') {
                    result.add(type as ExcludableArtifactType);
                }
            }
        }
        for (const t of (ls.excludedTypes ?? [])) {
            result.add(t);
        }
        return result;
    }

    /**
     * Returns ArtifactTypeLayerItems for a given layer source.
     * Only shown in tree mode for enabled leaf LayerItem nodes that have matching files.
     */
    private getArtifactTypeChildren(layerIndex: number, repoId?: string): ArtifactTypeLayerItem[] {
        const layerSources = this.state.config?.layerSources;
        if (!layerSources) {
            return [];
        }
        const ls = layerSources[layerIndex];
        if (!ls) {
            return [];
        }
        // Don't show artifact-type children for disabled layers
        const isRepoEnabled = this.state.config?.metadataRepos
            ?.find((r: { id: string; enabled?: boolean }) => r.id === ls.repoId)?.enabled !== false;
        if (!isRepoEnabled || ls.enabled === false) {
            return [];
        }
        const activeTypes = this.getActiveTypesForLayer(layerIndex);
        if (activeTypes.size === 0) {
            return [];
        }
        const excludedTypes = ls.excludedTypes ?? [];
        return ARTIFACT_TYPE_ORDER
            .filter(type => activeTypes.has(type))
            .map(type => new ArtifactTypeLayerItem(type, layerIndex, ls.repoId, excludedTypes.includes(type)));
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
                })
            );
        }

        if (element instanceof LayerRepoItem) {
            const repoEntries = entries.filter(entry => entry.repoId === element.repoId);
            return this.trackChildren(this.getTreeChildrenForPrefix(repoEntries, '', element.repoId, mode), element);
        }

        if (element instanceof LayerItem) {
            if (typeof element.layerIndex === 'number' && mode === 'tree') {
                return this.trackChildren(this.getArtifactTypeChildren(element.layerIndex, element.repoId), element);
            }
            const parentPath = element.pathKey === '(root)' ? '' : element.pathKey || '';
            const repoEntries = element.repoId
                ? entries.filter(entry => entry.repoId === element.repoId)
                : entries.filter(entry => entry.repoId === undefined);
            return this.trackChildren(this.getTreeChildrenForPrefix(repoEntries, parentPath, element.repoId, mode), element);
        }

        if (this.state.config?.metadataRepos && this.state.config.layerSources) {
            const repoOrder = new Map(this.state.config.metadataRepos.map((repo, idx) => [repo.id, idx]));
            const repoDisabled = new Map(this.state.config.metadataRepos.map(repo => [repo.id, repo.enabled === false]));
            const repoLabels = new Map(this.state.config.metadataRepos.map(repo => [repo.id, repo.name?.trim() || repo.id]));

            return this.trackChildren(this.state.config.metadataRepos
                .filter(repo => entries.some(entry => entry.repoId === repo.id))
                .sort((a, b) => (repoOrder.get(a.id) ?? 0) - (repoOrder.get(b.id) ?? 0))
                .map(repo => new LayerRepoItem(repoLabels.get(repo.id) || repo.id, repo.id, repoDisabled.get(repo.id) === true)), undefined);
        }

        return this.trackChildren(this.getTreeChildrenForPrefix(entries, ''), undefined);
    }

    getParent(element: LayerTreeItem): LayerTreeItem | undefined {
        return this._parentMap.get(element);
    }
}
