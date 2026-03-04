/**
 * Config TreeView provider.
 *
 * Displays config summary and repository source state.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState } from '../commands/commandHandlers';
import { RepoSyncStatus } from '../commands/repoSyncStatus';
import { BUILT_IN_CAPABILITY_REPO_LABEL } from '../builtInCapability';

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
        localPath: string,
        repoUrl?: string,
        syncStatus?: RepoSyncStatus
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        const isReadonly = !repoId;
        const isRemote = RepoSourceItem.isGitRemoteUrl(repoUrl);
        this.contextValue = isReadonly
            ? 'configRepoSourceReadonly'
            : (isRemote ? 'configRepoSourceGitRescannable' : 'configRepoSourceRescannable');
        this.description = RepoSourceItem.buildDescription(localPath, isRemote, syncStatus);
        this.iconPath = RepoSourceItem.buildIcon(isRemote, syncStatus);
        if (!isReadonly) {
            this.checkboxState = enabled
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;
        }
        this.tooltip = RepoSourceItem.buildTooltip(label, localPath, repoUrl, syncStatus);
        this.accessibilityInformation = {
            label: `${label} ${enabled ? 'enabled' : 'disabled'}`,
            role: 'checkbox',
        };
    }

    private static buildDescription(localPath: string, isRemote: boolean, syncStatus?: RepoSyncStatus): string {
        if (!isRemote) {
            return localPath;
        }

        const statusSuffix = RepoSourceItem.syncStatusSuffix(syncStatus);
        return `${localPath} [git]${statusSuffix}`;
    }

    private static syncStatusSuffix(syncStatus?: RepoSyncStatus): string {
        if (!syncStatus) {
            return '';
        }

        switch (syncStatus.state) {
            case 'upToDate':
                return ' (up to date)';
            case 'behind':
                return ` (${syncStatus.behindCount ?? 0} update${(syncStatus.behindCount ?? 0) === 1 ? '' : 's'})`;
            case 'ahead':
                return ` (${syncStatus.aheadCount ?? 0} ahead)`;
            case 'diverged':
                return ' (diverged)';
            case 'unknown':
                return ' (status unknown)';
            default:
                return '';
        }
    }

    private static buildIcon(isRemote: boolean, syncStatus?: RepoSyncStatus): vscode.ThemeIcon {
        if (!isRemote) {
            return new vscode.ThemeIcon('folder');
        }

        if (!syncStatus) {
            return new vscode.ThemeIcon('cloud');
        }

        switch (syncStatus.state) {
            case 'upToDate':
                return new vscode.ThemeIcon('cloud');
            case 'behind':
                return new vscode.ThemeIcon('arrow-down');
            case 'ahead':
                return new vscode.ThemeIcon('arrow-up');
            case 'diverged':
                return new vscode.ThemeIcon('warning');
            case 'unknown':
                return new vscode.ThemeIcon('question');
            default:
                return new vscode.ThemeIcon('cloud');
        }
    }

    private static isGitRemoteUrl(repoUrl: string | undefined): boolean {
        if (!repoUrl) {
            return false;
        }
        const trimmed = repoUrl.trim();
        if (!trimmed) {
            return false;
        }
        return /^(git@|git:\/\/|ssh:\/\/|https?:\/\/)/i.test(trimmed);
    }

    private static buildTooltip(
        label: string,
        localPath: string,
        repoUrl: string | undefined,
        syncStatus?: RepoSyncStatus
    ): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString(
            `**Repository**: ${label}\n\nLocal path: \`${localPath}\``
        );
        if (RepoSourceItem.isGitRemoteUrl(repoUrl)) {
            tooltip.appendMarkdown(`\n\nRemote URL: \`${repoUrl!.trim()}\``);
        }

        if (syncStatus) {
            tooltip.appendMarkdown(`\n\nSync status: ${RepoSourceItem.describeSyncState(syncStatus)}`);
            if (syncStatus.trackingRef) {
                tooltip.appendMarkdown(`\n\nTracking branch: \`${syncStatus.trackingRef}\``);
            }
            if (typeof syncStatus.behindCount === 'number' || typeof syncStatus.aheadCount === 'number') {
                tooltip.appendMarkdown(`\n\nAhead/Behind: ${syncStatus.aheadCount ?? 0}/${syncStatus.behindCount ?? 0}`);
            }
            tooltip.appendMarkdown(`\n\nLast checked: ${syncStatus.lastCheckedAt}`);
            if (syncStatus.error) {
                tooltip.appendMarkdown(`\n\nError: ${syncStatus.error}`);
            }
        }
        return tooltip;
    }

    private static describeSyncState(syncStatus: RepoSyncStatus): string {
        switch (syncStatus.state) {
            case 'upToDate':
                return 'Up to date with upstream';
            case 'behind':
                return 'Updates available upstream';
            case 'ahead':
                return 'Local commits are ahead of upstream';
            case 'diverged':
                return 'Local and upstream histories diverged';
            case 'unknown':
                return 'Unknown';
            default:
                return syncStatus.state;
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
            const builtInSource = this.state.builtInCapability.enabled
                ? [this.createBuiltInSourceItem()]
                : [];

            if (config.metadataRepos) {
                return [
                    ...config.metadataRepos.map(repo =>
                    new RepoSourceItem(
                        repo.name?.trim() || repo.id,
                        repo.id,
                        repo.enabled !== false,
                        this.toDisplayPath(repo.localPath),
                        repo.url,
                        this.state.repoSyncByRepoId[repo.id]
                    )
                    ),
                    ...builtInSource,
                ];
            }

            if (config.metadataRepo) {
                return [
                    new RepoSourceItem(
                        'primary',
                        'primary',
                        true,
                        this.toDisplayPath(config.metadataRepo.localPath),
                        config.metadataRepo.url,
                        this.state.repoSyncByRepoId.primary
                    ),
                    ...builtInSource,
                ];
            }

            return builtInSource;
        }

        if (element) {
            return [];
        }

        return [new SectionItem('Repositories')];
    }

    private createBuiltInSourceItem(): RepoSourceItem {
        const item = new RepoSourceItem(
            BUILT_IN_CAPABILITY_REPO_LABEL,
            undefined,
            this.state.builtInCapability.layerEnabled,
            'bundled extension metadata',
            undefined,
            undefined
        );
        item.contextValue = 'configRepoSourceBuiltin';
        item.description = this.state.builtInCapability.layerEnabled
            ? 'bundled extension metadata (enabled)'
            : 'bundled extension metadata (disabled)';
        item.iconPath = new vscode.ThemeIcon('package');
        item.tooltip = new vscode.MarkdownString(
            '**Built-in MetaFlow capability**\n\nManaged by extension workspace state. Toggle the layer checkbox in the Layers view to enable or disable contribution.'
        );
        return item;
    }
}
