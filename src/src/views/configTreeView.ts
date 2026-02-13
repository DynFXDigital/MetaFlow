/**
 * Config TreeView provider.
 *
 * Displays config summary: repo URL, commit, injection modes.
 */

import * as vscode from 'vscode';
import { ExtensionState } from '../commands/commandHandlers';

class ConfigItem extends vscode.TreeItem {
    constructor(label: string, description: string, contextValue?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = contextValue;
    }
}

export class ConfigTreeViewProvider implements vscode.TreeDataProvider<ConfigItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConfigItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ConfigItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ConfigItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const items: ConfigItem[] = [];

        if (this.state.configPath) {
            items.push(new ConfigItem('Config', this.state.configPath, 'configPath'));
        }

        if (config.metadataRepo) {
            items.push(new ConfigItem('Repo', config.metadataRepo.localPath));
            if (config.metadataRepo.url) {
                items.push(new ConfigItem('URL', config.metadataRepo.url));
            }
            if (config.metadataRepo.commit) {
                items.push(new ConfigItem('Commit', config.metadataRepo.commit));
            }
        }

        if (config.metadataRepos) {
            for (const repo of config.metadataRepos) {
                items.push(new ConfigItem(`Repo: ${repo.id}`, repo.localPath));
            }
        }

        if (config.injection) {
            const modes = Object.entries(config.injection)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            if (modes) {
                items.push(new ConfigItem('Injection', modes));
            }
        }

        return items;
    }
}
