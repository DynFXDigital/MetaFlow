/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as vscode from 'vscode';
import { ExtensionState } from '../commands/commandHandlers';

class RepoSourceItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string,
        enabled: boolean,
        localPath?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'repoSource';
        this.iconPath = enabled
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        this.description = localPath ? localPath : '';
        this.command = {
            command: 'metaflow.toggleRepoSource',
            title: 'Toggle Repo Source',
            arguments: [repoId],
        };
    }
}

class LayerItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly layerIndex: number,
        enabled: boolean,
        repoId?: string,
        repoDisabled?: boolean
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layer';
        this.iconPath = enabled
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        if (repoId) {
            this.description = repoDisabled ? `(${repoId}, repo disabled)` : `(${repoId})`;
        } else {
            this.description = '';
        }
        this.command = {
            command: 'metaflow.toggleLayer',
            title: 'Toggle Layer',
            arguments: [layerIndex],
        };
    }
}

type LayerTreeItem = RepoSourceItem | LayerItem;

export class LayersTreeViewProvider implements vscode.TreeDataProvider<LayerTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LayerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: LayerTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): LayerTreeItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        // Multi-repo mode
        if (config.metadataRepos && config.layerSources) {
            const repoEnabled = new Map(config.metadataRepos.map(repo => [repo.id, repo.enabled !== false]));

            const repoItems = config.metadataRepos.map(repo =>
                new RepoSourceItem(repo.name?.trim() || repo.id, repo.id, repo.enabled !== false, repo.localPath)
            );

            const layerItems = config.layerSources.map((ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                return new LayerItem(ls.path, i, isRepoEnabled && isLayerEnabled, ls.repoId, !isRepoEnabled);
            });

            return [...repoItems, ...layerItems];
        }

        // Single-repo mode
        if (config.layers) {
            return config.layers.map((layer, i) =>
                new LayerItem(layer, i, true)
            );
        }

        return [];
    }
}
