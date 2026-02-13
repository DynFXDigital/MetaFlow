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
        repoId?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layer';
        this.iconPath = enabled
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        this.description = repoId ? `(${repoId})` : '';
        this.command = {
            command: 'metaflow.toggleLayer',
            title: 'Toggle Layer',
            arguments: [layerIndex],
        };
    }
}

export class LayersTreeViewProvider implements vscode.TreeDataProvider<LayerItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LayerItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: LayerItem): vscode.TreeItem {
        return element;
    }

    getChildren(): LayerItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        // Multi-repo mode
        if (config.layerSources) {
            return config.layerSources.map((ls, i) =>
                new LayerItem(ls.path, i, ls.enabled !== false, ls.repoId)
            );
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
