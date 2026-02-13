/**
 * Config TreeView provider.
 *
 * Displays config summary: repo URL, commit, injection modes.
 */

import * as vscode from 'vscode';
import * as path from 'path';
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

    /**
     * Prefer workspace-relative display paths for readability.
     * Falls back to the original value when outside the workspace.
     */
    private toDisplayPath(pathValue: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot || !path.isAbsolute(pathValue)) {
            return pathValue;
        }

        const relativePath = path.relative(workspaceRoot, pathValue);
        const isWithinWorkspace =
            relativePath === '' ||
            (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

        if (!isWithinWorkspace) {
            return pathValue;
        }

        return relativePath === '' ? '.' : relativePath.replace(/\\/g, '/');
    }

    getChildren(): ConfigItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const items: ConfigItem[] = [];

        if (this.state.configPath) {
            items.push(new ConfigItem('Config', this.toDisplayPath(this.state.configPath), 'configPath'));
        }

        if (config.metadataRepo) {
            items.push(new ConfigItem('Repo', this.toDisplayPath(config.metadataRepo.localPath)));
            if (config.metadataRepo.url) {
                items.push(new ConfigItem('URL', config.metadataRepo.url));
            }
            if (config.metadataRepo.commit) {
                items.push(new ConfigItem('Commit', config.metadataRepo.commit));
            }
        }

        if (config.metadataRepos) {
            for (const repo of config.metadataRepos) {
                items.push(new ConfigItem(`Repo: ${repo.id}`, this.toDisplayPath(repo.localPath)));
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
