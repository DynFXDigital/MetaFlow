/**
 * Config TreeView provider.
 *
 * Displays config summary and repository source state.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState } from '../commands/commandHandlers';
import { RepoSyncStatus } from '../commands/repoSyncStatus';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    isBuiltInCapabilityActive,
    resolveBuiltInCapabilityDisplayName,
} from '../builtInCapability';
import {
    ArtifactSummary,
    InstructionScopeSummary,
    formatSummaryDescription,
    getInstructionScopeTooltipLines,
    getSummaryTooltipLines,
    summarizeRepoInstructionScope,
    summarizeRepo,
} from '../treeSummary';

function buildMarkdownTooltip(
    title: string,
    details: string[],
    description?: string,
): vscode.MarkdownString {
    const normalizedDescription = description?.trim();
    const normalizedDetails = details.filter((detail) => detail.trim().length > 0);
    const header = normalizedDescription ? `${title}  \n${normalizedDescription}` : title;
    const body = normalizedDetails.join('  \n');
    return new vscode.MarkdownString(body ? `${header}\n\n${body}` : header);
}

class SectionItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly section: 'repositories' | 'warnings',
        iconId: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = section === 'warnings' ? 'configWarningSection' : 'configRepoSection';
        this.iconPath = new vscode.ThemeIcon(iconId);
    }
}

class LoadingItem extends vscode.TreeItem {
    constructor() {
        super('Loading...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'loading';
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.description = 'MetaFlow';
    }
}

class RepoSourceItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string | undefined,
        enabled: boolean,
        localPath: string,
        repoUrl?: string,
        syncStatus?: RepoSyncStatus,
        summary?: ArtifactSummary,
        scopeSummary?: InstructionScopeSummary,
        options?: {
            title?: string;
            description?: string;
            builtIn?: boolean;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        const isReadonly = !repoId;
        const isRemote = RepoSourceItem.isGitRemoteUrl(repoUrl);
        this.contextValue = isReadonly
            ? 'configRepoSourceReadonly'
            : isRemote
              ? RepoSourceItem.buildGitContextValue(syncStatus)
              : 'configRepoSourceRescannable';
        this.description = RepoSourceItem.buildDescription(
            localPath,
            isRemote,
            syncStatus,
            summary,
        );
        this.iconPath = RepoSourceItem.buildIcon(isRemote, syncStatus);
        if (!isReadonly) {
            this.checkboxState = enabled
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;
        }
        this.tooltip = RepoSourceItem.buildTooltip(
            options?.title?.trim() || label,
            localPath,
            repoUrl,
            enabled,
            syncStatus,
            summary,
            scopeSummary,
            options,
        );
        this.accessibilityInformation = {
            label: `${label} ${enabled ? 'enabled' : 'disabled'}`,
            role: 'checkbox',
        };
    }

    private static buildGitContextValue(syncStatus?: RepoSyncStatus): string {
        return syncStatus?.state === 'behind' ? 'configRepoSourceGitBehind' : 'configRepoSourceGit';
    }

    private static buildDescription(
        localPath: string,
        isRemote: boolean,
        syncStatus: RepoSyncStatus | undefined,
        summary: ArtifactSummary | undefined,
    ): string {
        const base = isRemote ? `${localPath} [git]` : localPath;
        const qualifiers = [RepoSourceItem.syncStatusQualifier(syncStatus)].filter(
            (value): value is string => Boolean(value),
        );

        if (summary) {
            return formatSummaryDescription(base, summary, qualifiers);
        }

        if (qualifiers.length > 0) {
            return `${base} (${qualifiers.join(', ')})`;
        }

        return base;
    }

    private static syncStatusQualifier(syncStatus?: RepoSyncStatus): string {
        if (!syncStatus) {
            return '';
        }

        switch (syncStatus.state) {
            case 'upToDate':
                return 'up to date';
            case 'behind':
                return `${syncStatus.behindCount ?? 0} update${(syncStatus.behindCount ?? 0) === 1 ? '' : 's'}`;
            case 'ahead':
                return `${syncStatus.aheadCount ?? 0} ahead`;
            case 'diverged':
                return 'diverged';
            case 'unknown':
                return 'status unknown';
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
        title: string,
        localPath: string,
        repoUrl: string | undefined,
        enabled: boolean,
        syncStatus?: RepoSyncStatus,
        summary?: ArtifactSummary,
        scopeSummary?: InstructionScopeSummary,
        options?: {
            description?: string;
            builtIn?: boolean;
        },
    ): vscode.MarkdownString {
        const detailLines = [`Status: ${enabled ? 'enabled' : 'disabled'}`];

        if (options?.builtIn) {
            detailLines.push('Source: bundled with the MetaFlow extension');
        } else {
            detailLines.push(`Local path: \`${localPath}\``);
        }

        if (!options?.builtIn && RepoSourceItem.isGitRemoteUrl(repoUrl)) {
            detailLines.push(`Remote URL: \`${repoUrl!.trim()}\``);
        }

        if (syncStatus) {
            detailLines.push(`Sync status: ${RepoSourceItem.describeSyncState(syncStatus)}`);
            if (syncStatus.trackingRef) {
                detailLines.push(`Tracking branch: \`${syncStatus.trackingRef}\``);
            }
            if (
                typeof syncStatus.behindCount === 'number' ||
                typeof syncStatus.aheadCount === 'number'
            ) {
                detailLines.push(
                    `Ahead/Behind: ${syncStatus.aheadCount ?? 0}/${syncStatus.behindCount ?? 0}`,
                );
            }
            detailLines.push(`Last checked: ${syncStatus.lastCheckedAt}`);
            if (syncStatus.error) {
                detailLines.push(`Error: ${syncStatus.error}`);
            }
        }
        if (summary) {
            detailLines.push(...getSummaryTooltipLines(summary));
        }
        if (scopeSummary) {
            detailLines.push(...getInstructionScopeTooltipLines(scopeSummary));
        }
        return buildMarkdownTooltip(
            `**${title}**`,
            detailLines,
            options?.description ? `*${options.description}*` : undefined,
        );
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

class WarningItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'configWarning';
        this.iconPath = new vscode.ThemeIcon('warning');
        this.tooltip = message;
    }
}

type ConfigTreeItem = SectionItem | RepoSourceItem | LoadingItem | WarningItem;

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

    private getRepoMetadataById(): Map<string, { name?: string; description?: string }> {
        return new Map(Object.entries(this.state.repoMetadataById ?? {}));
    }

    private resolveRepoDisplayLabel(
        repoId: string,
        configName: string | undefined,
        localPath: string | undefined,
        manifestName?: string,
    ): string {
        const trimmed = configName?.trim();
        if (trimmed && trimmed !== repoId) {
            return trimmed;
        }

        const manifest = manifestName?.trim();
        if (manifest) {
            return manifest;
        }

        const base = localPath ? path.basename(localPath.replace(/[\\/]+$/, '')) : '';
        return base || repoId;
    }

    private createBuiltInSourceItem(): RepoSourceItem {
        const repoMetadata = this.getRepoMetadataById();
        const builtInLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`;
        const builtInCapabilityName =
            repoMetadata.get(BUILT_IN_CAPABILITY_REPO_ID)?.name?.trim() ||
            resolveBuiltInCapabilityDisplayName(
                this.state.capabilityByLayer?.[builtInLayerId]?.name,
                this.state.builtInCapability.sourceDisplayName,
            );
        const item = new RepoSourceItem(
            builtInCapabilityName,
            undefined,
            this.state.builtInCapability.layerEnabled,
            'bundled extension metadata',
            undefined,
            undefined,
            summarizeRepo(this.state.treeSummaryCache, BUILT_IN_CAPABILITY_REPO_ID),
            summarizeRepoInstructionScope(this.state.treeSummaryCache, BUILT_IN_CAPABILITY_REPO_ID),
            {
                title: builtInCapabilityName,
                description: repoMetadata.get(BUILT_IN_CAPABILITY_REPO_ID)?.description,
                builtIn: true,
            },
        );
        item.contextValue = 'configRepoSourceBuiltin';
        item.description = formatSummaryDescription(
            'bundled extension metadata',
            summarizeRepo(this.state.treeSummaryCache, BUILT_IN_CAPABILITY_REPO_ID),
            [this.state.builtInCapability.layerEnabled ? 'enabled' : 'disabled'],
        );
        item.iconPath = new vscode.ThemeIcon('package');
        return item;
    }

    getChildren(element?: ConfigTreeItem): ConfigTreeItem[] {
        if (this.state.isLoading && !this.state.config) {
            return element ? [] : [new LoadingItem()];
        }

        const config = this.state.config;
        if (!config) {
            return [];
        }

        if (element instanceof SectionItem) {
            if (element.section === 'warnings') {
                return this.state.capabilityWarnings.map((message) => new WarningItem(message));
            }

            const builtInSource = isBuiltInCapabilityActive(this.state.builtInCapability)
                ? [this.createBuiltInSourceItem()]
                : [];
            const repoMetadataById = this.getRepoMetadataById();

            if (config.metadataRepos) {
                return [
                    ...config.metadataRepos.map(
                        (repo) =>
                            new RepoSourceItem(
                                this.resolveRepoDisplayLabel(
                                    repo.id,
                                    repo.name,
                                    repo.localPath,
                                    repoMetadataById.get(repo.id)?.name,
                                ),
                                repo.id,
                                repo.enabled !== false,
                                this.toDisplayPath(repo.localPath),
                                repo.url,
                                this.state.repoSyncByRepoId[repo.id],
                                summarizeRepo(this.state.treeSummaryCache, repo.id),
                                summarizeRepoInstructionScope(this.state.treeSummaryCache, repo.id),
                                {
                                    title: repoMetadataById.get(repo.id)?.name,
                                    description: repoMetadataById.get(repo.id)?.description,
                                },
                            ),
                    ),
                    ...builtInSource,
                ];
            }

            if (config.metadataRepo) {
                const primaryLabel = this.resolveRepoDisplayLabel(
                    'primary',
                    config.metadataRepo.name,
                    config.metadataRepo.localPath,
                    repoMetadataById.get('primary')?.name,
                );
                return [
                    new RepoSourceItem(
                        primaryLabel,
                        'primary',
                        true,
                        this.toDisplayPath(config.metadataRepo.localPath),
                        config.metadataRepo.url,
                        this.state.repoSyncByRepoId.primary,
                        summarizeRepo(this.state.treeSummaryCache, 'primary'),
                        summarizeRepoInstructionScope(this.state.treeSummaryCache, 'primary'),
                        {
                            title: repoMetadataById.get('primary')?.name,
                            description: repoMetadataById.get('primary')?.description,
                        },
                    ),
                    ...builtInSource,
                ];
            }

            return builtInSource;
        }

        if (element) {
            return [];
        }

        const rootItems: ConfigTreeItem[] = [
            new SectionItem('Repositories', 'repositories', 'repo'),
        ];
        if (this.state.capabilityWarnings.length > 0) {
            rootItems.push(
                new SectionItem(
                    `Warnings (${this.state.capabilityWarnings.length})`,
                    'warnings',
                    'warning',
                ),
            );
        }

        return rootItems;
    }
}
