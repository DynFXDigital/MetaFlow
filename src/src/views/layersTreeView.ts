/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as vscode from 'vscode';
import { ExtensionState } from '../commands/commandHandlers';

class LayerItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly layerIndex: number,
        enabled: boolean,
        repoId?: string,
        repoDisabled?: boolean,
        toggleable = true
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layer';
        this.checkboxState = enabled
            ? vscode.TreeItemCheckboxState.Checked
            : vscode.TreeItemCheckboxState.Unchecked;
        if (repoId) {
            this.description = repoDisabled ? `(${repoId}, repo disabled)` : `(${repoId})`;
        } else if (!toggleable) {
            this.description = '(single-repo, fixed order)';
        } else {
            this.description = '';
        }
        this.accessibilityInformation = {
            label: `${label} ${enabled ? 'enabled' : 'disabled'}`,
            role: 'checkbox',
        };
    }
}

type LayerTreeItem = LayerItem;

export class LayersTreeViewProvider implements vscode.TreeDataProvider<LayerTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LayerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: LayerTreeItem): vscode.TreeItem {
        return element;
    }

    private formatLayerLabel(layerPath: string, repoLabel?: string): string {
        if (layerPath !== '.') {
            return layerPath;
        }

        return repoLabel?.trim() || 'primary';
    }

    getChildren(element?: LayerTreeItem): LayerTreeItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        // Multi-repo mode
        if (config.metadataRepos && config.layerSources) {
            if (element) {
                return [];
            }

            const repoEnabled = new Map(config.metadataRepos.map(repo => [repo.id, repo.enabled !== false]));
            const repoLabels = new Map(config.metadataRepos.map(repo => [repo.id, repo.name?.trim() || repo.id]));
            return config.layerSources.map((ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                const label = this.formatLayerLabel(ls.path, repoLabels.get(ls.repoId));
                return new LayerItem(label, i, isRepoEnabled && isLayerEnabled, ls.repoId, !isRepoEnabled);
            });
        }

        if (element) {
            return [];
        }

        // Single-repo mode
        if (config.layers) {
            const singleRepoLabel = config.metadataRepo?.name?.trim() || 'primary';
            return config.layers.map((layer, i) => new LayerItem(this.formatLayerLabel(layer, singleRepoLabel), i, true));
        }

        return [];
    }
}
