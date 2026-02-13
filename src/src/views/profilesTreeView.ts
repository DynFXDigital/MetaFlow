/**
 * Profiles TreeView provider.
 *
 * Lists profiles with active indicator icon.
 */

import * as vscode from 'vscode';
import { ExtensionState } from '../commands/commandHandlers';

class ProfileItem extends vscode.TreeItem {
    constructor(name: string, isActive: boolean) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'profile';
        this.iconPath = isActive ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-outline');
        this.description = isActive ? '(active)' : '';
        this.command = {
            command: 'metaflow.switchProfile',
            title: 'Switch Profile',
        };
    }
}

export class ProfilesTreeViewProvider implements vscode.TreeDataProvider<ProfileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ProfileItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ProfileItem[] {
        const config = this.state.config;
        if (!config?.profiles) {
            return [];
        }

        return Object.keys(config.profiles).map(
            name => new ProfileItem(name, name === config.activeProfile)
        );
    }
}
