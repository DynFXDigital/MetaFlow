/**
 * Config TreeView provider.
 *
 * Displays config summary and repository source state.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState } from '../commands/commandHandlers';

class SectionItem extends vscode.TreeItem {
    constructor(
        label: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'configRepoSection';
        this.iconPath = new vscode.ThemeIcon('repo');
    }
}

class RepoSourceItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string | undefined,
        enabled: boolean,
        description: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = repoId ? 'configRepoSource' : 'configRepoSourceReadonly';
        this.description = description;
        this.iconPath = enabled
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        if (repoId) {
            this.command = {
                command: 'metaflow.toggleRepoSource',
                title: 'Toggle Repo Source',
                arguments: [repoId],
            };
        }
    }
}

type ConfigTreeItem = SectionItem | RepoSourceItem;

export class ConfigTreeViewProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConfigTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ConfigTreeItem): vscode.TreeItem {
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

    getChildren(element?: ConfigTreeItem): ConfigTreeItem[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        if (element instanceof SectionItem) {
            if (config.metadataRepos) {
                return config.metadataRepos.map(repo =>
                    new RepoSourceItem(
                        repo.name?.trim() || repo.id,
                        repo.id,
                        repo.enabled !== false,
                        this.toDisplayPath(repo.localPath)
                    )
                );
            }

            if (config.metadataRepo) {
                return [
                    new RepoSourceItem(
                        'primary',
                        'primary',
                        true,
                        this.toDisplayPath(config.metadataRepo.localPath)
                    ),
                ];
            }

            return [];
        }

        if (element) {
            return [];
        }

        return [new SectionItem('Repositories')];
    }
}
