/**
 * Profiles TreeView provider.
 *
 * Lists profiles with active indicator icon.
 */

import * as vscode from 'vscode';
import { ExtensionState } from '../commands/commandHandlers';
import { DEFAULT_PROFILE_ID, getProfileDisplayName } from '../commands/commandHelpers';
import {
    formatSummaryDescription,
    getInstructionScopeTooltipLines,
    getSummaryTooltipLines,
    summarizeProfile,
    summarizeProfileInstructionScope,
} from '../treeSummary';

function buildMarkdownTooltip(title: string, details: string[]): vscode.MarkdownString {
    return new vscode.MarkdownString(
        details.length > 0 ? `${title}\n\n${details.join('  \n')}` : title,
    );
}

class ProfileItem extends vscode.TreeItem {
    constructor(name: string, isActive: boolean, state: ExtensionState) {
        const profile = state.config?.profiles?.[name];
        const displayName = getProfileDisplayName(name, profile);
        super(displayName, vscode.TreeItemCollapsibleState.None);
        this.profileId = name;
        this.contextValue = name === DEFAULT_PROFILE_ID ? 'profileDefault' : 'profile';
        this.iconPath = isActive
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        const summary = summarizeProfile(state.treeSummaryCache, name);
        this.description = formatSummaryDescription(
            displayName === name ? undefined : name,
            summary,
            isActive ? ['active'] : [],
        );
        this.tooltip = buildMarkdownTooltip(`**${displayName}**`, [
            ...(displayName === name ? [] : [`Id: ${name}`]),
            isActive ? 'Status: active profile' : 'Status: inactive profile preview',
            ...getSummaryTooltipLines(summary),
            ...getInstructionScopeTooltipLines(
                summarizeProfileInstructionScope(state.treeSummaryCache, name),
            ),
        ]);
        this.command = {
            command: 'metaflow.switchProfile',
            title: 'Switch Profile',
            arguments: [{ profileId: name }],
        };
    }

    readonly profileId: string;
}

class LoadingItem extends vscode.TreeItem {
    constructor() {
        super('Loading...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'loading';
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.description = 'MetaFlow';
    }
}

type ProfileTreeItem = ProfileItem | LoadingItem;

export class ProfilesTreeViewProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    getTreeItem(element: ProfileTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProfileTreeItem): ProfileTreeItem[] {
        if (this.state.isLoading && !this.state.config) {
            return element ? [] : [new LoadingItem()];
        }

        if (element) {
            return [];
        }

        const config = this.state.config;
        if (!config?.profiles) {
            return [];
        }

        return Object.keys(config.profiles).map(
            (name) => new ProfileItem(name, name === config.activeProfile, this.state),
        );
    }
}
