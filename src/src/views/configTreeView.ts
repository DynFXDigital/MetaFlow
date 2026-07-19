/**
 * Config TreeView provider.
 *
 * Displays config summary and repository source state.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionState } from '../commands/commandHandlers';
import { RepoSyncStatus } from '../commands/repoSyncStatus';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    isBuiltInCapabilityActive,
    resolveBuiltInCapabilityDisplayName,
    resolveBuiltInRepoEnabled,
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
import {
    buildConfigGovernanceWarnings,
    buildRepoGovernanceProjection,
    type RepoGovernanceProjection,
} from '../governanceSignals';
import {
    buildDiagnosticsSnapshot,
    formatDiagnosticsSnapshotWarningMessage,
} from '../diagnostics/diagnosticsSnapshot';

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

const WARNING_LABEL_MAX_LENGTH = 88;
const WARNING_DESCRIPTION_MAX_LENGTH = 40;

function normalizeWarningMessage(message: string): string {
    return message.trim().replace(/\s+/g, ' ');
}

function truncateWarningText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    const truncated = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace >= Math.floor(maxLength * 0.6)) {
        return `${truncated.slice(0, lastSpace).trimEnd()}…`;
    }

    return `${truncated}…`;
}

function truncateMiddle(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    const normalized = value.replace(/\\/g, '/');
    const segments = normalized.split('/').filter((segment) => segment.length > 0);
    if (segments.length >= 3) {
        const suffix = `/${segments.slice(-2).join('/')}`;
        const prefixLength = Math.max(1, maxLength - suffix.length - 1);
        const prefix = normalized.slice(0, prefixLength).replace(/[\/]+$/, '');
        return `${prefix}…${suffix}`;
    }

    const visibleLength = Math.max(1, maxLength - 1);
    const prefixLength = Math.ceil(visibleLength / 2);
    const suffixLength = Math.floor(visibleLength / 2);
    return `${value.slice(0, prefixLength)}…${value.slice(value.length - suffixLength)}`;
}

type WarningSourceTarget =
    | {
          path: string;
          kind: 'file' | 'directory';
          line?: number;
          column?: number;
      }
    | undefined;

function parseWarningLocation(location: string | undefined): {
    path: string;
    line?: number;
    column?: number;
} | undefined {
    const trimmed = location?.trim();
    if (!trimmed) {
        return undefined;
    }

    const match = /^(.*?)(?:#L(\d+)(?:C(\d+))?)?$/.exec(trimmed);
    if (!match) {
        return {
            path: trimmed,
        };
    }

    return {
        path: match[1],
        line: match[2] ? Math.max(0, Number.parseInt(match[2], 10) - 1) : undefined,
        column: match[3] ? Math.max(0, Number.parseInt(match[3], 10) - 1) : undefined,
    };
}

function resolveWarningSourceTarget(location: string | undefined): WarningSourceTarget {
    const parsedLocation = parseWarningLocation(location);
    if (!parsedLocation) {
        return undefined;
    }

    const candidates: string[] = [];
    if (path.isAbsolute(parsedLocation.path)) {
        candidates.push(path.normalize(parsedLocation.path));
    } else {
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            candidates.push(path.resolve(folder.uri.fsPath, parsedLocation.path));
        }
    }

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) {
                const stat = fs.statSync(candidate);
                if (stat.isFile()) {
                    return {
                        path: candidate,
                        kind: 'file',
                        line: parsedLocation.line,
                        column: parsedLocation.column,
                    };
                }

                if (stat.isDirectory()) {
                    return {
                        path: candidate,
                        kind: 'directory',
                        line: parsedLocation.line,
                        column: parsedLocation.column,
                    };
                }
            }
        } catch {
            // Ignore invalid or unreadable paths and leave the warning non-actionable.
        }
    }

    return undefined;
}

function buildWarningPresentation(message: string): {
    label: string;
    description?: string;
    tooltip: vscode.MarkdownString;
    normalizedMessage: string;
    warningIdentity: string;
    location?: string;
    sourcePath?: string;
    sourceKind?: 'file' | 'directory';
    sourceLine?: number;
    sourceColumn?: number;
} {
    const normalized = normalizeWarningMessage(message);
    const structuredMatch = normalized.match(/^\[([^\]]+)\]\s+(.+?)(?:\s+\[([^\]]+)\])?$/);
    const plainLocationMatch = structuredMatch
        ? undefined
        : normalized.match(/^(.+?)\s+\[([^\]]+)\]$/);
    const code = structuredMatch?.[1]?.trim();
    const details = structuredMatch?.[2]?.trim() ?? plainLocationMatch?.[1]?.trim() ?? normalized;
    const location = structuredMatch?.[3]?.trim() ?? plainLocationMatch?.[2]?.trim();
    const sourceTarget = resolveWarningSourceTarget(location);
    const label = truncateWarningText(details, WARNING_LABEL_MAX_LENGTH);
    const description = [
        code ? `[${code}]` : undefined,
        location ? truncateMiddle(location, WARNING_DESCRIPTION_MAX_LENGTH) : undefined,
    ]
        .filter((value): value is string => Boolean(value))
        .join(' ');

    const tooltipLines = [details];
    if (code) {
        tooltipLines.unshift(`Code: \`${code}\``);
    }
    if (location) {
        tooltipLines.push(`Location: \`${location}\``);
    }
    if (sourceTarget) {
        tooltipLines.push(
            sourceTarget.kind === 'directory'
                ? 'Action: Click to reveal the warning source location in Explorer.'
                : 'Action: Click to open the warning source location.',
        );
    }

    return {
        label,
        description: description || undefined,
        tooltip: buildMarkdownTooltip('**Warning**', tooltipLines),
        normalizedMessage: normalized,
        warningIdentity: `${code ?? ''}\n${details}`,
        location,
        sourcePath: sourceTarget?.path,
        sourceKind: sourceTarget?.kind,
        sourceLine: sourceTarget?.line,
        sourceColumn: sourceTarget?.column,
    };
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
            localGit?: boolean;
            governance?: RepoGovernanceProjection;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        const isReadonly = !repoId;
        const isRemote = RepoSourceItem.isGitRemoteUrl(repoUrl);
        const isLocalGit = options?.localGit === true && !isRemote;
        this.contextValue = isReadonly
            ? 'configRepoSourceReadonly'
            : isRemote
              ? RepoSourceItem.buildGitContextValue(syncStatus)
              : isLocalGit
                ? 'configRepoSourceLocalGit'
                : 'configRepoSourceRescannable';
        this.description = RepoSourceItem.buildDescription(
            localPath,
            isRemote,
            isLocalGit,
            syncStatus,
            summary,
            options?.governance,
        );
        this.iconPath = RepoSourceItem.buildIcon(isRemote, isLocalGit, syncStatus);
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
        if (syncStatus?.state === 'behind') {
            return 'configRepoSourceGitBehind';
        }
        if (syncStatus?.state === 'ahead') {
            return 'configRepoSourceGitAhead';
        }
        return 'configRepoSourceGit';
    }

    private static buildDescription(
        localPath: string,
        isRemote: boolean,
        isLocalGit: boolean,
        syncStatus: RepoSyncStatus | undefined,
        summary: ArtifactSummary | undefined,
        governance: RepoGovernanceProjection | undefined,
    ): string {
        const base = isRemote
            ? `${localPath} [git]`
            : isLocalGit
              ? `${localPath} [local git]`
              : localPath;
        const qualifiers = [
            RepoSourceItem.syncStatusQualifier(syncStatus),
            ...(governance?.descriptionQualifiers ?? []),
        ].filter((value): value is string => Boolean(value));

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

    private static buildIcon(
        isRemote: boolean,
        isLocalGit: boolean,
        syncStatus?: RepoSyncStatus,
    ): vscode.ThemeIcon {
        if (!isRemote && !isLocalGit) {
            return new vscode.ThemeIcon('folder');
        }

        if (isLocalGit) {
            return new vscode.ThemeIcon('source-control');
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
            localGit?: boolean;
            governance?: RepoGovernanceProjection;
        },
    ): vscode.MarkdownString {
        const detailLines = [`Status: ${enabled ? 'enabled' : 'disabled'}`];

        if (options?.builtIn) {
            detailLines.push('Source: bundled with the MetaFlow extension');
        } else {
            detailLines.push(`Local path: \`${localPath}\``);
        }

        if (!options?.builtIn && options?.localGit && !RepoSourceItem.isGitRemoteUrl(repoUrl)) {
            detailLines.push('Source control: local git repository');
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
        detailLines.push(...(options?.governance?.tooltipLines ?? []));
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
    public readonly warningMessage: string;
    public readonly sourcePath?: string;
    public readonly sourceKind?: 'file' | 'directory';
    public readonly sourceLine?: number;
    public readonly sourceColumn?: number;

    constructor(message: string) {
        const presentation = buildWarningPresentation(message);
        super(presentation.label, vscode.TreeItemCollapsibleState.None);
        this.warningMessage = presentation.normalizedMessage;
        this.sourcePath = presentation.sourcePath;
        this.sourceKind = presentation.sourceKind;
        this.sourceLine = presentation.sourceLine;
        this.sourceColumn = presentation.sourceColumn;
        this.contextValue = this.sourcePath ? 'configWarningSource' : 'configWarning';
        this.iconPath = new vscode.ThemeIcon('warning');
        this.description = presentation.description;
        this.tooltip = presentation.tooltip;
        if (this.sourcePath) {
            this.command = {
                command: 'metaflow.openWarningSource',
                title: 'Open Warning Source',
                arguments: [
                    {
                        sourcePath: this.sourcePath,
                        sourceKind: this.sourceKind,
                        ...(typeof this.sourceLine === 'number'
                            ? { sourceLine: this.sourceLine }
                            : {}),
                        ...(typeof this.sourceColumn === 'number'
                            ? { sourceColumn: this.sourceColumn }
                            : {}),
                        warningMessage: this.warningMessage,
                    },
                ],
            };
        }
        this.accessibilityInformation = {
            label: this.sourcePath
                ? this.sourceKind === 'directory'
                    ? `${this.warningMessage}. Reveals source location in Explorer.`
                    : `${this.warningMessage}. Opens source file.`
                : this.warningMessage,
            role: 'listitem',
        };
    }
}

type ConfigTreeItem = SectionItem | RepoSourceItem | LoadingItem | WarningItem;

export class ConfigTreeViewProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConfigTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private state: ExtensionState,
        private diagnosticCollection?: vscode.DiagnosticCollection,
    ) {
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

    private getGovernanceWarningMessages(): string[] {
        return buildConfigGovernanceWarnings({
            governanceContract: this.state.governanceContract,
            governanceContractErrors: this.state.governanceContractErrors,
            governanceCompliance: this.state.governanceCompliance,
        });
    }

    private getWarningMessages(): string[] {
        const dedupedWarnings = new Map<
            string,
            {
                message: string;
                hasLocation: boolean;
                sourceWeight: number;
                order: number;
            }
        >();
        let nextOrder = 0;

        const addWarning = (message: string): void => {
            const presentation = buildWarningPresentation(message);
            const candidate = {
                message,
                hasLocation: Boolean(presentation.location),
                sourceWeight: presentation.sourcePath ? 2 : presentation.location ? 1 : 0,
                order: nextOrder++,
            };
            const existing = dedupedWarnings.get(presentation.warningIdentity);
            if (!existing) {
                dedupedWarnings.set(presentation.warningIdentity, candidate);
                return;
            }

            if (
                candidate.sourceWeight > existing.sourceWeight ||
                (candidate.sourceWeight === existing.sourceWeight &&
                    candidate.hasLocation &&
                    !existing.hasLocation)
            ) {
                dedupedWarnings.set(presentation.warningIdentity, candidate);
            }
        };

        for (const message of this.state.capabilityWarnings) {
            addWarning(message);
        }

        for (const message of this.state.configWarnings) {
            addWarning(message);
        }

        if (this.diagnosticCollection) {
            for (const diagnosticWarning of buildDiagnosticsSnapshot(
                this.state,
                this.diagnosticCollection,
            ).warnings.map(formatDiagnosticsSnapshotWarningMessage)) {
                addWarning(diagnosticWarning);
            }
        }

        for (const governanceWarning of this.getGovernanceWarningMessages()) {
            addWarning(governanceWarning);
        }

        return Array.from(dedupedWarnings.values())
            .sort((left, right) => left.order - right.order)
            .map((entry) => entry.message);
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
        const summaryCache =
            this.state.isLoading && !this.state.treeSummaryCache
                ? undefined
                : this.state.treeSummaryCache;
        const summary = summaryCache
            ? summarizeRepo(summaryCache, BUILT_IN_CAPABILITY_REPO_ID)
            : undefined;
        const builtInEnabled = resolveBuiltInRepoEnabled(this.state.builtInCapability);
        const builtInCapabilityName =
            repoMetadata.get(BUILT_IN_CAPABILITY_REPO_ID)?.name?.trim() ||
            resolveBuiltInCapabilityDisplayName(
                this.state.capabilityByLayer?.[builtInLayerId]?.name,
                this.state.builtInCapability.sourceDisplayName,
            );
        const item = new RepoSourceItem(
            builtInCapabilityName,
            BUILT_IN_CAPABILITY_REPO_ID,
            builtInEnabled,
            'bundled extension metadata',
            undefined,
            undefined,
            summary,
            summary
                ? summarizeRepoInstructionScope(summaryCache, BUILT_IN_CAPABILITY_REPO_ID)
                : undefined,
            {
                title: builtInCapabilityName,
                description: repoMetadata.get(BUILT_IN_CAPABILITY_REPO_ID)?.description,
                builtIn: true,
                governance: buildRepoGovernanceProjection(BUILT_IN_CAPABILITY_REPO_ID, {
                    governanceContract: this.state.governanceContract,
                    governanceContractErrors: this.state.governanceContractErrors,
                    governanceCompliance: this.state.governanceCompliance,
                }),
            },
        );
        item.contextValue = 'configRepoSourceBuiltin';
        item.description = summary
            ? `bundled extension metadata (${summary.totalActive}/${summary.totalAvailable}, ${builtInEnabled ? 'enabled' : 'disabled'})`
            : `bundled extension metadata (${builtInEnabled ? 'enabled' : 'loading'})`;
        item.iconPath = new vscode.ThemeIcon('package');
        return item;
    }

    getChildren(element?: ConfigTreeItem): ConfigTreeItem[] {
        if (this.state.isLoading && !this.state.config) {
            return element ? [] : [new LoadingItem()];
        }

        const warningMessages = this.getWarningMessages();
        const config = this.state.config;
        const summaryCache =
            this.state.isLoading && !this.state.treeSummaryCache
                ? undefined
                : this.state.treeSummaryCache;

        if (element instanceof SectionItem) {
            if (element.section === 'warnings') {
                return warningMessages.map((message) => new WarningItem(message));
            }

            if (!config) {
                return [];
            }

            const builtInSource = isBuiltInCapabilityActive(this.state.builtInCapability)
                ? [this.createBuiltInSourceItem()]
                : [];
            const repoMetadataById = this.getRepoMetadataById();

            if (config.metadataRepos) {
                return [
                    ...config.metadataRepos.filter(
                        (repo) => repo.id !== BUILT_IN_CAPABILITY_REPO_ID,
                    ).map(
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
                                summaryCache
                                    ? summarizeRepo(summaryCache, repo.id)
                                    : undefined,
                                summaryCache
                                    ? summarizeRepoInstructionScope(summaryCache, repo.id)
                                    : undefined,
                                {
                                    title: repoMetadataById.get(repo.id)?.name,
                                    description: repoMetadataById.get(repo.id)?.description,
                                    localGit: this.state.localGitRepoIds.has(repo.id),
                                    governance: buildRepoGovernanceProjection(repo.id, {
                                        governanceContract: this.state.governanceContract,
                                        governanceContractErrors:
                                            this.state.governanceContractErrors,
                                        governanceCompliance: this.state.governanceCompliance,
                                    }),
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
                        summaryCache
                            ? summarizeRepo(summaryCache, 'primary')
                            : undefined,
                        summaryCache
                            ? summarizeRepoInstructionScope(summaryCache, 'primary')
                            : undefined,
                        {
                            title: repoMetadataById.get('primary')?.name,
                            description: repoMetadataById.get('primary')?.description,
                            localGit: this.state.localGitRepoIds.has('primary'),
                            governance: buildRepoGovernanceProjection('primary', {
                                governanceContract: this.state.governanceContract,
                                governanceContractErrors: this.state.governanceContractErrors,
                                governanceCompliance: this.state.governanceCompliance,
                            }),
                        },
                    ),
                    ...builtInSource,
                ];
            }

            return builtInSource;
        }

        if (!config) {
            return warningMessages.length > 0
                ? [new SectionItem(`Warnings (${warningMessages.length})`, 'warnings', 'warning')]
                : [];
        }

        if (element) {
            return [];
        }

        const rootItems: ConfigTreeItem[] = [
            new SectionItem('Repositories', 'repositories', 'repo'),
        ];
        if (warningMessages.length > 0) {
            rootItems.push(
                new SectionItem(
                    `Warnings (${warningMessages.length})`,
                    'warnings',
                    'warning',
                ),
            );
        }

        return rootItems;
    }
}
