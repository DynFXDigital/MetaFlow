/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    ExcludableArtifactType,
    EffectiveFile,
    getArtifactType,
    parseFrontmatter,
} from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    isBuiltInCapabilityActive,
    resolveBuiltInCapabilityDisplayName,
} from '../builtInCapability';
import { projectConfigForProfile } from '../commands/commandHelpers';
import {
    ArtifactSummaryCounts,
    ArtifactSummary,
    formatSummaryDescription,
    getInstructionScopeTooltipLines,
    getSummaryTooltipLines,
    InstructionScopeSummary,
    summarizeLayerInstructionScope,
    summarizeLayerPrefix,
    summarizeRepoInstructionScope,
    summarizeRepo,
    TreeSummaryRecord,
} from '../treeSummary';

const KNOWN_ARTIFACT_TYPES = new Set<ExcludableArtifactType>([
    'instructions',
    'prompts',
    'agents',
    'skills',
]);

interface ParsedMetadata {
    fields?: Record<string, string>;
    heading?: string;
}

interface BrowseRecord {
    artifactPath: string;
    absolutePath?: string;
}

interface BrowseFolderMetadata {
    displayLabel: string;
    description?: string;
    internalId?: string;
}

function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function normalizeRelativePath(value: string): string {
    const normalized = toPosixPath(value)
        .replace(/^\.\//, '')
        .replace(/^\/+|\/+$/g, '');
    return normalized || '.';
}

function pathStartsWith(candidate: string, prefix: string): boolean {
    const normalizedCandidate = normalizeRelativePath(candidate);
    const normalizedPrefix = normalizeRelativePath(prefix);

    if (normalizedPrefix === '.') {
        return true;
    }

    return (
        normalizedCandidate === normalizedPrefix ||
        normalizedCandidate.startsWith(`${normalizedPrefix}/`)
    );
}

function toDisplayTitleFromSlug(value: string): string {
    const tokenMap: Record<string, string> = {
        ai: 'AI',
        api: 'API',
        cli: 'CLI',
        github: 'GitHub',
        mcp: 'MCP',
        sdlc: 'SDLC',
        vscode: 'VS Code',
    };

    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(
            (token) =>
                tokenMap[token.toLowerCase()] || token.charAt(0).toUpperCase() + token.slice(1),
        )
        .join(' ');
}

function extractFirstMarkdownHeading(content: string): string | undefined {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
}

function getPathAfterArtifactType(relativePath: string): string {
    const parts = toPosixPath(relativePath).split('/').filter(Boolean);
    const githubIndex = parts.indexOf('.github');
    const displayParts =
        githubIndex === -1
            ? parts
            : [...parts.slice(0, githubIndex), ...parts.slice(githubIndex + 1)];
    const typeIndex = displayParts.findIndex((part): part is ExcludableArtifactType =>
        KNOWN_ARTIFACT_TYPES.has(part as ExcludableArtifactType),
    );

    if (typeIndex === -1) {
        return displayParts.join('/');
    }

    return displayParts.slice(typeIndex + 1).join('/');
}

function getSourcePath(file: EffectiveFile): string | undefined {
    const sourcePath =
        (file as EffectiveFile & { absolutePath?: string }).sourcePath ??
        (file as EffectiveFile & { absolutePath?: string }).absolutePath;
    return typeof sourcePath === 'string' ? sourcePath : undefined;
}

type LayersViewMode = 'flat' | 'tree';

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

type ArtifactInjectionSource = 'capability' | 'repo' | 'global' | 'default';

interface ArtifactInjectionState {
    mode: 'settings' | 'synchronize';
    source: ArtifactInjectionSource;
}

const DEFAULT_ARTIFACT_INJECTION_MODE: Record<ExcludableArtifactType, 'settings' | 'synchronize'> =
    {
        instructions: 'settings',
        prompts: 'settings',
        agents: 'settings',
        skills: 'settings',
    };

function normalizeInjectionPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    return normalized === '' ? '.' : normalized;
}

function formatInjectionSource(source: ArtifactInjectionSource): string {
    switch (source) {
        case 'capability':
            return 'capability override';
        case 'repo':
            return 'repo default';
        case 'global':
            return 'global default';
        default:
            return 'built-in default';
    }
}

function resolveArtifactInjectionState(
    config: ExtensionState['config'],
    layerIndex: number,
    artifactType: ExcludableArtifactType,
): ArtifactInjectionState {
    const layerSource = config?.layerSources?.[layerIndex];
    if (config?.metadataRepos && layerSource) {
        const repo = config.metadataRepos.find((candidate) => candidate.id === layerSource.repoId);
        const capability = repo?.capabilities?.find(
            (candidate) =>
                normalizeInjectionPath(candidate.path) === normalizeInjectionPath(layerSource.path),
        );

        if (capability?.injection?.[artifactType]) {
            return {
                mode: capability.injection[artifactType]!,
                source: 'capability',
            };
        }

        if (repo?.injection?.[artifactType]) {
            return {
                mode: repo.injection[artifactType]!,
                source: 'repo',
            };
        }
    }

    if (config?.injection?.[artifactType]) {
        return {
            mode: config.injection[artifactType]!,
            source: 'global',
        };
    }

    return {
        mode: DEFAULT_ARTIFACT_INJECTION_MODE[artifactType],
        source: 'default',
    };
}

interface LayerEntry {
    label: string;
    layerIndex: number;
    enabled: boolean;
    repoId?: string;
    repoLabel: string;
    repoDisabled?: boolean;
    toggleable: boolean;
    normalizedPath: string;
    capability?: {
        id?: string;
        name?: string;
        description?: string;
        license?: string;
    };
}

interface LayerAvailability {
    repoEnabled: boolean;
    layerEnabled: boolean;
}

type BranchToggleStatus = 'all-enabled' | 'partially-enabled' | 'all-disabled';

interface BranchToggleSummary {
    checkboxState: vscode.TreeItemCheckboxState;
    enabledCount: number;
    totalCount: number;
    status: BranchToggleStatus;
}

function summarizeBranchToggle(entries: LayerEntry[]): BranchToggleSummary | undefined {
    if (entries.length === 0) {
        return undefined;
    }

    const enabledCount = entries.filter((entry) => entry.enabled).length;
    const totalCount = entries.length;
    const status: BranchToggleStatus =
        enabledCount === totalCount
            ? 'all-enabled'
            : enabledCount === 0
              ? 'all-disabled'
              : 'partially-enabled';

    return {
        checkboxState:
            status === 'all-enabled'
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked,
        enabledCount,
        totalCount,
        status,
    };
}

function formatBranchStatus(summary: BranchToggleSummary): string {
    switch (summary.status) {
        case 'all-enabled':
            return 'all descendant capabilities enabled';
        case 'all-disabled':
            return 'all descendant capabilities disabled';
        default:
            return `partially enabled (${summary.enabledCount}/${summary.totalCount})`;
    }
}

function buildLayerTreeItemId(
    kind: 'repo' | 'folder' | 'layer' | 'artifact',
    mode: LayersViewMode,
    repoId: string | undefined,
    layerPath: string,
    artifactType?: ExcludableArtifactType,
): string {
    const normalizedRepoId = repoId?.trim() || 'primary';
    const normalizedLayerPath = layerPath.trim() || '.';

    if (kind === 'artifact' && artifactType) {
        return `${mode}:${kind}:${normalizedRepoId}:${normalizedLayerPath}:${artifactType}`;
    }

    return `${mode}:${kind}:${normalizedRepoId}:${normalizedLayerPath}`;
}

class LayerRepoItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string,
        repoDisabled: boolean,
        summary: ArtifactSummary,
        scopeSummary: InstructionScopeSummary,
        options?: {
            title?: string;
            description?: string;
            localPath?: string;
            builtIn?: boolean;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = buildLayerTreeItemId('repo', 'tree', repoId, '.');
        this.contextValue = 'layerRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        this.description = formatSummaryDescription(
            undefined,
            summary,
            repoDisabled ? ['disabled'] : [],
        );
        const detailLines = [`Status: ${repoDisabled ? 'disabled' : 'enabled'}`];

        if (options?.builtIn) {
            detailLines.push('Source: bundled with the MetaFlow extension');
        } else {
            detailLines.push(`Repository ID: \`${repoId}\``);
            if (options?.localPath) {
                detailLines.push(`Root: \`${options.localPath}\``);
            }
        }
        detailLines.push(...getSummaryTooltipLines(summary));
        detailLines.push(...getInstructionScopeTooltipLines(scopeSummary));

        this.tooltip = buildMarkdownTooltip(
            `**${options?.title?.trim() || label}**`,
            detailLines,
            options?.description ? `*${options.description}*` : undefined,
        );
    }
}

class LoadingLayerItem extends vscode.TreeItem {
    constructor() {
        super('Loading...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'loading';
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.description = 'MetaFlow';
    }
}

class LayerItem extends vscode.TreeItem {
    readonly layerIndex?: number;
    readonly repoId?: string;
    readonly pathKey?: string;
    readonly layerPath?: string;

    constructor(
        label: string,
        enabled?: boolean,
        layerIndex?: number,
        options?: {
            itemId?: string;
            repoId?: string;
            repoLabel?: string;
            showRepoLabelInDescription?: boolean;
            repoDisabled?: boolean;
            toggleable?: boolean;
            hasChildren?: boolean;
            path?: string;
            layerPath?: string;
            showPathInDescription?: boolean;
            excludedCount?: number;
            capabilityName?: string;
            capabilityId?: string;
            capabilityDescription?: string;
            capabilityLicense?: string;
            summary?: ArtifactSummary;
            scopeSummary?: InstructionScopeSummary;
            branchToggleSummary?: BranchToggleSummary;
        },
    ) {
        const hasChildren = options?.hasChildren === true;
        // Prefer capability name as primary label for concrete layer nodes
        const displayLabel =
            typeof layerIndex === 'number' && options?.capabilityName
                ? options.capabilityName
                : label;
        super(
            displayLabel,
            hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );
        this.layerIndex = layerIndex;
        this.repoId = options?.repoId;
        this.pathKey = options?.path;
        this.layerPath = options?.layerPath;

        if (typeof layerIndex === 'number') {
            this.contextValue = 'layer';
            this.checkboxState = enabled
                ? vscode.TreeItemCheckboxState.Checked
                : vscode.TreeItemCheckboxState.Unchecked;
            this.command = {
                command: 'metaflow.openCapabilityDetails',
                title: 'View Capability Details',
                arguments: [{ layerIndex, repoId: options?.repoId }],
            };
        } else {
            this.contextValue = 'layerFolder';
            this.checkboxState = options?.branchToggleSummary?.checkboxState;
        }

        const qualifiers: string[] = [];
        if (options?.repoId && typeof layerIndex === 'number') {
            const repoDisplayLabel = options.repoLabel?.trim() || options.repoId;
            if (options?.showRepoLabelInDescription !== false) {
                qualifiers.push(repoDisplayLabel);
            }
            if ((options?.excludedCount ?? 0) > 0) {
                qualifiers.push(`${options!.excludedCount} excluded`);
            }
            if (options.repoDisabled) {
                qualifiers.push('repo disabled');
            }
        } else if (options?.toggleable === false && typeof layerIndex === 'number') {
            qualifiers.push('single-repo');
            qualifiers.push('fixed order');
        } else if ((options?.excludedCount ?? 0) > 0) {
            qualifiers.push(`${options!.excludedCount} excluded`);
        }
        if (options?.branchToggleSummary?.status === 'partially-enabled') {
            qualifiers.push(
                `${options.branchToggleSummary.enabledCount}/${options.branchToggleSummary.totalCount} enabled`,
            );
        }

        // When label was overridden to capability name, show configured path in description
        const labelOverridden = displayLabel !== label;
        const isBuiltInGithubRoot =
            options?.repoId === BUILT_IN_CAPABILITY_REPO_ID &&
            options?.path === BUILT_IN_CAPABILITY_LAYER_PATH;
        const showPath =
            options?.showPathInDescription !== false &&
            labelOverridden &&
            options?.path &&
            options.path !== '(root)' &&
            !isBuiltInGithubRoot;
        this.description = options?.summary
            ? formatSummaryDescription(
                  showPath ? options.path : undefined,
                  options.summary,
                  qualifiers,
              )
            : showPath
              ? options!.path!
              : qualifiers.length > 0
                ? `(${qualifiers.join(', ')})`
                : '';

        const contextLines: string[] = [];
        if (options?.repoLabel) {
            contextLines.push(`Repository: \`${options.repoLabel}\``);
        }
        if (options?.layerPath) {
            contextLines.push(`Layer: \`${options.layerPath}\``);
        }
        if ((options?.excludedCount ?? 0) > 0) {
            contextLines.push(`Excluded types: ${options!.excludedCount}`);
        }
        if (options?.branchToggleSummary) {
            contextLines.push(`Branch state: ${formatBranchStatus(options.branchToggleSummary)}`);
        }

        if (typeof layerIndex === 'number' && typeof enabled === 'boolean') {
            this.accessibilityInformation = {
                label: `${displayLabel} ${enabled ? 'enabled' : 'disabled'}`,
                role: 'checkbox',
            };
        } else if (options?.branchToggleSummary) {
            this.accessibilityInformation = {
                label: `${displayLabel} ${formatBranchStatus(options.branchToggleSummary)}`,
                role: 'checkbox',
            };
        }

        if (options?.itemId) {
            this.id = options.itemId;
        } else if (options?.path) {
            this.id = options.path;
        }

        if (
            options?.capabilityName ||
            options?.capabilityId ||
            options?.capabilityDescription ||
            options?.capabilityLicense
        ) {
            const capabilityName =
                options.capabilityName ?? options.capabilityId ?? 'Unknown capability';
            const capabilityLines: string[] = [];

            if (options.capabilityId) {
                capabilityLines.push(`Capability ID: \`${options.capabilityId}\``);
            }

            if (options.capabilityLicense) {
                capabilityLines.push(`License: \`${options.capabilityLicense}\``);
            }

            capabilityLines.push(...contextLines);
            if (options?.summary) {
                capabilityLines.push(...getSummaryTooltipLines(options.summary));
            }
            if (options?.scopeSummary) {
                capabilityLines.push(...getInstructionScopeTooltipLines(options.scopeSummary));
            }

            this.tooltip = buildMarkdownTooltip(
                `**${capabilityName}**`,
                capabilityLines,
                options.capabilityDescription ? `*${options.capabilityDescription}*` : undefined,
            );
        } else {
            const folderLines = [...contextLines];
            if (options?.summary) {
                folderLines.push(...getSummaryTooltipLines(options.summary));
            }
            if (options?.scopeSummary) {
                folderLines.push(...getInstructionScopeTooltipLines(options.scopeSummary));
            }
            if (folderLines.length > 0) {
                this.tooltip = buildMarkdownTooltip(`**${displayLabel}**`, folderLines);
            }
        }
    }
}

const ARTIFACT_TYPE_ORDER: ExcludableArtifactType[] = [
    'instructions',
    'prompts',
    'agents',
    'skills',
];

function buildArtifactTypeContextValue(artifactType: ExcludableArtifactType): string {
    return `layerArtifactType:${artifactType}`;
}

class ArtifactTypeLayerItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ExcludableArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string | undefined,
        excluded: boolean,
        injection: ArtifactInjectionState,
        options?: {
            repoLabel?: string;
            layerPath?: string;
            counts?: ArtifactSummaryCounts;
            hasChildren?: boolean;
            repoEnabled?: boolean;
            layerEnabled?: boolean;
        },
    ) {
        super(
            artifactType,
            options?.hasChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );
        this.id = buildLayerTreeItemId(
            'artifact',
            'tree',
            repoId,
            options?.layerPath ?? '.',
            artifactType,
        );
        this.contextValue = buildArtifactTypeContextValue(artifactType);
        this.checkboxState = excluded
            ? vscode.TreeItemCheckboxState.Unchecked
            : vscode.TreeItemCheckboxState.Checked;
        this.iconPath = new vscode.ThemeIcon('folder');
        const countLabel =
            options?.counts !== undefined ? String(options.counts.available) : undefined;
        const qualifiers = [
            injection.mode,
            ...(options?.repoEnabled === false ? ['repo disabled'] : []),
            ...(options?.layerEnabled === false ? ['capability disabled'] : []),
            ...(excluded ? ['excluded'] : []),
        ];
        this.description =
            countLabel !== undefined
                ? `(${countLabel}, ${qualifiers.join(', ')})`
                : `(${qualifiers.join(', ')})`;
        const detailLines = [
            `Status: ${excluded ? 'excluded from this layer' : 'included in this layer'}`,
            `Capability status: ${options?.layerEnabled === false ? 'disabled' : 'enabled'}`,
            `Repository status: ${options?.repoEnabled === false ? 'disabled' : 'enabled'}`,
            `Injection: ${injection.mode} (${formatInjectionSource(injection.source)})`,
        ];

        if (options?.repoLabel) {
            detailLines.push(`Repository: \`${options.repoLabel}\``);
        }

        if (options?.layerPath) {
            detailLines.push(`Layer: \`${options.layerPath}\``);
        }

        detailLines.push(
            'Toggle the checkbox to change whether this artifact type participates in the layer.',
        );

        this.tooltip = buildMarkdownTooltip(`**Artifact Type**: ${artifactType}`, detailLines);
    }
}

class ArtifactBrowseFolderItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly artifactType: ExcludableArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string | undefined,
        public readonly layerPath: string,
        public readonly browsePrefix: string,
        tooltip: vscode.MarkdownString,
        options?: {
            description?: string;
            folderPath?: string;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'layerArtifactBrowseFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = options?.description;
        this.tooltip = tooltip;

        if (options?.folderPath) {
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal Folder in Explorer',
                arguments: [vscode.Uri.file(options.folderPath)],
            };
        }
    }
}

class ArtifactBrowseFileItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly artifactType: ExcludableArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string | undefined,
        public readonly layerPath: string,
        public readonly browsePath: string,
        tooltip: vscode.MarkdownString,
        options?: {
            description?: string;
            sourcePath?: string;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'layerArtifactBrowseFile';
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = options?.description;
        this.tooltip = tooltip;

        if (options?.sourcePath) {
            this.command = {
                command: 'vscode.open',
                title: 'Open Source File',
                arguments: [vscode.Uri.file(options.sourcePath), { preview: false }],
            };
        }
    }
}

type LayerTreeItem =
    | LayerRepoItem
    | LayerItem
    | ArtifactTypeLayerItem
    | ArtifactBrowseFolderItem
    | ArtifactBrowseFileItem
    | LoadingLayerItem;

export class LayersTreeViewProvider implements vscode.TreeDataProvider<LayerTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<LayerTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _parentMap = new WeakMap<LayerTreeItem, LayerTreeItem | undefined>();
    private readonly parsedMetadataByPath = new Map<string, ParsedMetadata | null>();

    constructor(
        private state: ExtensionState,
        private readonly modeResolver: () => LayersViewMode = () =>
            vscode.workspace
                .getConfiguration('metaflow')
                .get<LayersViewMode>('layersViewMode', 'flat'),
    ) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: LayerTreeItem): vscode.TreeItem {
        return element;
    }

    private trackChildren<T extends LayerTreeItem>(
        items: T[],
        parent: LayerTreeItem | undefined,
    ): T[] {
        for (const item of items) {
            this._parentMap.set(item, parent);
        }
        return items;
    }

    private formatLayerLabel(layerPath: string, repoLabel?: string): string {
        if (layerPath !== '.') {
            return layerPath;
        }

        return repoLabel?.trim() || 'primary';
    }

    private normalizeLayerPath(layerPath: string): string {
        return layerPath === '.' ? '' : layerPath;
    }

    private normalizeLayerId(layerId: string): string {
        const normalized = layerId.replace(/\\/g, '/').replace(/\/+$/, '');
        return normalized === '' ? '.' : normalized;
    }

    private getParsedMetadata(filePath: string | undefined): ParsedMetadata | undefined {
        if (!filePath) {
            return undefined;
        }

        const normalizedPath = path.normalize(filePath);
        if (this.parsedMetadataByPath.has(normalizedPath)) {
            return this.parsedMetadataByPath.get(normalizedPath) ?? undefined;
        }

        try {
            const content = fs.readFileSync(normalizedPath, 'utf-8');
            const parsed = parseFrontmatter(content);
            const metadata: ParsedMetadata = {
                fields: parsed?.fields,
                heading: extractFirstMarkdownHeading(content),
            };
            this.parsedMetadataByPath.set(normalizedPath, metadata);
            return metadata;
        } catch {
            this.parsedMetadataByPath.set(normalizedPath, null);
            return undefined;
        }
    }

    private getBrowseFolderMetadata(
        artifactType: ExcludableArtifactType,
        folderPath: string | undefined,
        fallbackSlug: string,
    ): BrowseFolderMetadata {
        if (artifactType === 'skills' && folderPath) {
            const manifestPath = path.join(folderPath, 'SKILL.md');
            if (fs.existsSync(manifestPath)) {
                const metadata = this.getParsedMetadata(manifestPath);
                const explicitSlug = metadata?.fields?.name?.trim();
                const description = metadata?.fields?.description?.trim();
                const heading = explicitSlug
                    ? metadata?.heading?.replace(/\s+Skill$/i, '').trim()
                    : undefined;
                const displayLabel =
                    heading && heading.length > 0
                        ? heading
                        : explicitSlug
                          ? toDisplayTitleFromSlug(explicitSlug)
                          : fallbackSlug;

                return {
                    displayLabel,
                    description,
                    internalId: explicitSlug,
                };
            }
        }

        return { displayLabel: fallbackSlug };
    }

    private getLayerBrowseRecords(
        layerIndex: number,
        artifactType: ExcludableArtifactType,
        repoId?: string,
    ): BrowseRecord[] {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];
        if (!layerSource && typeof singleLayerPath !== 'string') {
            return [];
        }

        const layerPath = layerSource?.path ?? singleLayerPath ?? '.';
        const layerRepoId = layerSource?.repoId ?? repoId ?? 'primary';
        const normalizedLayerPath = normalizeRelativePath(layerPath);
        const availableRecords =
            this.state.treeSummaryCache?.availableRecords
                .filter(
                    (record: TreeSummaryRecord) =>
                        record.repoId === layerRepoId &&
                        record.artifactType === artifactType &&
                        pathStartsWith(record.repoRelativePath, normalizedLayerPath),
                )
                .map((record: TreeSummaryRecord) => ({
                    artifactPath: normalizeRelativePath(record.artifactPath),
                    absolutePath: record.absolutePath,
                })) ?? [];

        if (availableRecords.length > 0) {
            return availableRecords;
        }

        const normalizedLayerId = this.normalizeLayerId(
            layerSource ? `${layerSource.repoId}/${layerSource.path}` : (singleLayerPath ?? '.'),
        );

        return (this.state.effectiveFiles as EffectiveFile[])
            .filter(
                (file) =>
                    this.normalizeLayerId(file.sourceLayer || '') === normalizedLayerId &&
                    getArtifactType(file.relativePath) === artifactType,
            )
            .map((file) => ({
                artifactPath: normalizeRelativePath(getPathAfterArtifactType(file.relativePath)),
                absolutePath: getSourcePath(file),
            }));
    }

    private getFolderSourcePath(records: BrowseRecord[], prefix: string): string | undefined {
        const representative = records.find(
            (record) => record.absolutePath && pathStartsWith(record.artifactPath, prefix),
        );
        if (!representative?.absolutePath) {
            return undefined;
        }

        const artifactParts = normalizeRelativePath(representative.artifactPath)
            .split('/')
            .filter((part) => part !== '.');
        const prefixParts = normalizeRelativePath(prefix)
            .split('/')
            .filter((part) => part !== '.');
        if (prefixParts.length === 0 || prefixParts.length > artifactParts.length) {
            return undefined;
        }

        let folderPath = path.normalize(representative.absolutePath);
        const stepsUp = artifactParts.length - prefixParts.length;
        for (let index = 0; index < stepsUp; index += 1) {
            folderPath = path.dirname(folderPath);
        }

        return folderPath;
    }

    private getBrowseChildren(
        layerIndex: number,
        artifactType: ExcludableArtifactType,
        prefix: string,
        repoId?: string,
    ): Array<ArtifactBrowseFolderItem | ArtifactBrowseFileItem> {
        const config = this.state.config;
        if (!config) {
            return [];
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];
        const layerPath = layerSource?.path ?? singleLayerPath ?? '.';
        const layerRepoId = layerSource?.repoId ?? repoId;
        const repoMetadata = this.getRepoMetadataById();
        const repoLabel = layerSource
            ? (() => {
                  const repo = config.metadataRepos?.find(
                      (candidate: { id: string }) => candidate.id === layerSource.repoId,
                  );
                  return this.resolveRepoDisplayLabel(
                      layerSource.repoId,
                      repo?.name,
                      repo?.localPath,
                      repoMetadata.get(layerSource.repoId)?.name,
                  );
              })()
            : this.resolveRepoDisplayLabel(
                  'primary',
                  config.metadataRepo?.name,
                  config.metadataRepo?.localPath,
                  repoMetadata.get('primary')?.name,
              );

        const browseRecords = this.getLayerBrowseRecords(layerIndex, artifactType, repoId).filter(
            (record) => prefix === '.' || pathStartsWith(record.artifactPath, prefix),
        );
        const folderMap = new Map<string, BrowseRecord[]>();
        const fileRecords: BrowseRecord[] = [];

        for (const record of browseRecords) {
            const normalizedArtifactPath = normalizeRelativePath(record.artifactPath);
            const remainder =
                prefix === '.'
                    ? normalizedArtifactPath
                    : normalizedArtifactPath.slice(prefix.length + 1);

            if (!remainder || remainder === '.') {
                continue;
            }

            const [firstSegment, ...rest] = remainder.split('/');
            if (!firstSegment) {
                continue;
            }

            if (rest.length === 0) {
                fileRecords.push(record);
                continue;
            }

            const nextPrefix = prefix === '.' ? firstSegment : `${prefix}/${firstSegment}`;
            const subset = folderMap.get(nextPrefix) ?? [];
            subset.push(record);
            folderMap.set(nextPrefix, subset);
        }

        const folders = Array.from(folderMap.entries())
            .map(([nextPrefix, subset]) => {
                const segmentLabel = path.posix.basename(nextPrefix);
                const folderSourcePath = this.getFolderSourcePath(subset, nextPrefix);
                const metadata = this.getBrowseFolderMetadata(
                    artifactType,
                    folderSourcePath,
                    segmentLabel,
                );
                const descriptionBase =
                    metadata.internalId?.trim() &&
                    metadata.internalId.trim() !== metadata.displayLabel
                        ? metadata.internalId.trim()
                        : undefined;
                const tooltip = buildMarkdownTooltip(
                    `**${metadata.displayLabel}**`,
                    [
                        `Path: \`${artifactType}/${nextPrefix}\``,
                        ...(metadata.internalId?.trim() &&
                        metadata.internalId.trim() !== segmentLabel
                            ? [`Id: \`${metadata.internalId.trim()}\``]
                            : []),
                        ...(repoLabel ? [`Repository: \`${repoLabel}\``] : []),
                        `Layer: \`${layerPath}\``,
                    ],
                    metadata.description ? `*${metadata.description}*` : undefined,
                );

                return new ArtifactBrowseFolderItem(
                    metadata.displayLabel,
                    artifactType,
                    layerIndex,
                    layerRepoId,
                    layerPath,
                    nextPrefix,
                    tooltip,
                    {
                        description: descriptionBase,
                        folderPath: folderSourcePath,
                    },
                );
            })
            .sort((left, right) =>
                String(left.label).localeCompare(String(right.label), undefined, {
                    sensitivity: 'base',
                }),
            );

        const files = fileRecords
            .map((record) => {
                const normalizedArtifactPath = normalizeRelativePath(record.artifactPath);
                const fileName = path.posix.basename(normalizedArtifactPath);
                const metadata = this.getParsedMetadata(record.absolutePath);
                const displayLabel = metadata?.fields?.name?.trim() || fileName;
                const descriptionBase = displayLabel !== fileName ? fileName : undefined;
                const tooltip = buildMarkdownTooltip(
                    `**${displayLabel}**`,
                    [
                        `Path: \`${artifactType}/${normalizedArtifactPath}\``,
                        ...(repoLabel ? [`Repository: \`${repoLabel}\``] : []),
                        `Layer: \`${layerPath}\``,
                    ],
                    metadata?.fields?.description?.trim()
                        ? `*${metadata.fields.description.trim()}*`
                        : undefined,
                );

                return new ArtifactBrowseFileItem(
                    displayLabel,
                    artifactType,
                    layerIndex,
                    layerRepoId,
                    layerPath,
                    normalizedArtifactPath,
                    tooltip,
                    {
                        description: descriptionBase,
                        sourcePath: record.absolutePath,
                    },
                );
            })
            .sort((left, right) =>
                String(left.label).localeCompare(String(right.label), undefined, {
                    sensitivity: 'base',
                }),
            );

        return [...folders, ...files];
    }

    private getCapabilityMetadataByLayerId(): Map<
        string,
        { id?: string; name?: string; description?: string; license?: string }
    > {
        const capabilityByLayer = new Map<
            string,
            { id?: string; name?: string; description?: string; license?: string }
        >();

        for (const [layerId, metadata] of Object.entries(this.state.capabilityByLayer ?? {})) {
            capabilityByLayer.set(this.normalizeLayerId(layerId), metadata);
        }

        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            const normalized = this.normalizeLayerId(file.sourceLayer || '');
            if (!normalized || capabilityByLayer.has(normalized)) {
                continue;
            }

            if (
                file.sourceCapabilityId ||
                file.sourceCapabilityName ||
                file.sourceCapabilityDescription ||
                file.sourceCapabilityLicense
            ) {
                capabilityByLayer.set(normalized, {
                    id: file.sourceCapabilityId,
                    name: file.sourceCapabilityName,
                    description: file.sourceCapabilityDescription,
                    license: file.sourceCapabilityLicense,
                });
            }
        }

        return capabilityByLayer;
    }

    private getProjectedConfig(): ExtensionState['config'] {
        const config = this.state.config;
        return config ? projectConfigForProfile(config) : undefined;
    }

    private getLayerEntries(): LayerEntry[] {
        const config = this.getProjectedConfig();
        if (!config) {
            return [];
        }

        const capabilityByLayer = this.getCapabilityMetadataByLayerId();

        if (config.metadataRepos && config.layerSources) {
            const repoEnabled = new Map(
                config.metadataRepos.map((repo) => [repo.id, repo.enabled !== false]),
            );
            const repoMetadataForLabels = this.getRepoMetadataById();
            const repoLabels = new Map(
                config.metadataRepos.map((repo) => [
                    repo.id,
                    this.resolveRepoDisplayLabel(
                        repo.id,
                        repo.name,
                        repo.localPath,
                        repoMetadataForLabels.get(repo.id)?.name,
                    ),
                ]),
            );

            const entries: LayerEntry[] = config.layerSources.map((ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                const layerId = `${ls.repoId}/${ls.path}`;
                const capability = capabilityByLayer.get(this.normalizeLayerId(layerId));
                return {
                    label: this.formatLayerLabel(ls.path, repoLabels.get(ls.repoId)),
                    layerIndex: i,
                    enabled: isRepoEnabled && isLayerEnabled,
                    repoId: ls.repoId,
                    repoLabel: repoLabels.get(ls.repoId) || ls.repoId,
                    repoDisabled: !isRepoEnabled,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(ls.path),
                    capability,
                };
            });

            if (isBuiltInCapabilityActive(this.state.builtInCapability)) {
                const builtInLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`;
                const builtInCapability = capabilityByLayer.get(
                    this.normalizeLayerId(builtInLayerId),
                );
                const builtInManifestName = this.getRepoMetadataById()
                    .get(BUILT_IN_CAPABILITY_REPO_ID)
                    ?.name?.trim();
                const builtInDisplayName =
                    builtInManifestName ||
                    resolveBuiltInCapabilityDisplayName(
                        builtInCapability?.name,
                        this.state.builtInCapability.sourceDisplayName,
                    );
                entries.push({
                    label: builtInDisplayName,
                    layerIndex: config.layerSources.length,
                    enabled: this.state.builtInCapability.layerEnabled,
                    repoId: BUILT_IN_CAPABILITY_REPO_ID,
                    repoLabel: builtInDisplayName,
                    repoDisabled: false,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(BUILT_IN_CAPABILITY_LAYER_PATH),
                    capability: builtInCapability,
                });
            }

            return entries;
        }

        if (config.layers) {
            const singleRepoManifestName = this.getRepoMetadataById().get('primary')?.name;
            const singleRepoLabel = this.resolveRepoDisplayLabel(
                'primary',
                config.metadataRepo?.name,
                config.metadataRepo?.localPath,
                singleRepoManifestName,
            );
            const entries: LayerEntry[] = config.layers.map((layer, i) => {
                const normalizedLayerId = this.normalizeLayerId(layer);
                const capability = capabilityByLayer.get(normalizedLayerId);
                return {
                    label: this.formatLayerLabel(layer, singleRepoLabel),
                    layerIndex: i,
                    enabled: true,
                    repoLabel: singleRepoLabel,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(layer),
                    capability,
                };
            });

            if (isBuiltInCapabilityActive(this.state.builtInCapability)) {
                const builtInLayerId = `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`;
                const builtInCapability = capabilityByLayer.get(
                    this.normalizeLayerId(builtInLayerId),
                );
                const builtInManifestName = this.getRepoMetadataById()
                    .get(BUILT_IN_CAPABILITY_REPO_ID)
                    ?.name?.trim();
                const builtInDisplayName =
                    builtInManifestName ||
                    resolveBuiltInCapabilityDisplayName(
                        builtInCapability?.name,
                        this.state.builtInCapability.sourceDisplayName,
                    );
                entries.push({
                    label: builtInDisplayName,
                    layerIndex: config.layers.length,
                    enabled: this.state.builtInCapability.layerEnabled,
                    repoId: BUILT_IN_CAPABILITY_REPO_ID,
                    repoLabel: builtInDisplayName,
                    repoDisabled: false,
                    toggleable: true,
                    normalizedPath: this.normalizeLayerPath(BUILT_IN_CAPABILITY_LAYER_PATH),
                    capability: builtInCapability,
                });
            }

            return entries;
        }

        return [];
    }

    private getExcludedCount(layerIndex: number): number {
        const ls = this.getProjectedConfig()?.layerSources?.[layerIndex];
        return ls?.excludedTypes?.length ?? 0;
    }

    private getLayerAvailability(
        layerIndex: number,
        repoId?: string,
    ): LayerAvailability | undefined {
        const config = this.getProjectedConfig();
        if (!config) {
            return undefined;
        }

        const layerSource = config.layerSources?.[layerIndex];
        if (layerSource) {
            const repoEnabled =
                config.metadataRepos?.find(
                    (repo: { id: string; enabled?: boolean }) => repo.id === layerSource.repoId,
                )?.enabled !== false;
            const layerEnabled = layerSource.enabled !== false;
            return {
                repoEnabled,
                layerEnabled,
            };
        }

        if (typeof config.layers?.[layerIndex] === 'string') {
            return {
                repoEnabled: true,
                layerEnabled: true,
            };
        }

        if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
            return {
                repoEnabled: true,
                layerEnabled: this.state.builtInCapability.layerEnabled,
            };
        }

        return undefined;
    }

    private getBranchToggleSummary(
        entries: LayerEntry[],
        prefix: string,
        repoId?: string,
    ): BranchToggleSummary | undefined {
        const branchEntries = entries.filter((entry) => {
            if (repoId && entry.repoId !== repoId) {
                return false;
            }

            if (!prefix) {
                return true;
            }

            return entry.normalizedPath === prefix || entry.normalizedPath.startsWith(prefix + '/');
        });

        return summarizeBranchToggle(branchEntries);
    }

    private summarizePath(repoId: string | undefined, layerPath: string): ArtifactSummary {
        return summarizeLayerPrefix(this.state.treeSummaryCache, repoId ?? 'primary', layerPath);
    }

    private getRepoMetadataById(): Map<string, { name?: string; description?: string }> {
        return new Map(Object.entries(this.state.repoMetadataById ?? {}));
    }

    /**
     * Resolve a human-readable display label for a metadata repository.
     * Priority: explicit config name → METAFLOW.md name → folder basename → repo id.
     */
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

    private getTreeChildrenForPrefix(
        entries: LayerEntry[],
        prefix: string,
        repoId?: string,
        mode?: LayersViewMode,
    ): LayerItem[] {
        const children = new Map<string, { path: string; label: string }>();
        const rootEntry = entries.find((entry) => entry.normalizedPath === '');
        const resolvedMode = mode ?? 'tree';

        for (const entry of entries) {
            if (entry.normalizedPath === '') {
                continue;
            }

            if (prefix && !entry.normalizedPath.startsWith(prefix + '/')) {
                continue;
            }

            const remainder = prefix
                ? entry.normalizedPath.slice(prefix.length + 1)
                : entry.normalizedPath;
            const [segment] = remainder.split('/');
            if (!segment) {
                continue;
            }

            const childPath = prefix ? `${prefix}/${segment}` : segment;
            if (!children.has(childPath)) {
                children.set(childPath, { path: childPath, label: segment });
            }
        }

        const folderAndLayerItems = Array.from(children.values())
            .map((node) => {
                const matchingEntry = entries.find((entry) => entry.normalizedPath === node.path);
                const hasChildren = entries.some((entry) =>
                    entry.normalizedPath.startsWith(node.path + '/'),
                );
                const hasArtifactTypeChildren =
                    mode === 'tree' &&
                    typeof matchingEntry?.layerIndex === 'number' &&
                    this.getActiveTypesForLayer(matchingEntry.layerIndex).size > 0;
                const itemRepoId = matchingEntry?.repoId ?? repoId;
                const itemPath = node.path || '.';
                const branchToggleSummary =
                    typeof matchingEntry?.layerIndex === 'number'
                        ? undefined
                        : this.getBranchToggleSummary(entries, node.path, itemRepoId);
                const itemId = buildLayerTreeItemId(
                    typeof matchingEntry?.layerIndex === 'number' ? 'layer' : 'folder',
                    resolvedMode,
                    itemRepoId,
                    itemPath,
                );
                return new LayerItem(
                    node.label,
                    matchingEntry?.enabled,
                    matchingEntry?.layerIndex,
                    {
                        itemId,
                        repoId: itemRepoId,
                        repoLabel: matchingEntry?.repoLabel,
                        showRepoLabelInDescription: false,
                        repoDisabled: matchingEntry?.repoDisabled,
                        toggleable: matchingEntry?.toggleable,
                        hasChildren: hasChildren || hasArtifactTypeChildren,
                        path: node.path,
                        layerPath: node.path,
                        showPathInDescription: false,
                        excludedCount:
                            typeof matchingEntry?.layerIndex === 'number'
                                ? this.getExcludedCount(matchingEntry.layerIndex)
                                : undefined,
                        capabilityName: matchingEntry?.capability?.name,
                        capabilityId: matchingEntry?.capability?.id,
                        capabilityDescription: matchingEntry?.capability?.description,
                        capabilityLicense: matchingEntry?.capability?.license,
                        summary: this.summarizePath(itemRepoId ?? 'primary', node.path || '.'),
                        scopeSummary: summarizeLayerInstructionScope(
                            this.state.treeSummaryCache,
                            itemRepoId ?? 'primary',
                            node.path || '.',
                        ),
                        branchToggleSummary,
                    },
                );
            })
            .sort((a, b) =>
                String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }),
            );

        if (!prefix && rootEntry) {
            const rootLabel = entries[0]?.repoId ? 'root' : rootEntry.label;
            const rootHasArtifactChildren =
                mode === 'tree' &&
                typeof rootEntry.layerIndex === 'number' &&
                this.getActiveTypesForLayer(rootEntry.layerIndex).size > 0;
            const rootRepoId = rootEntry.repoId ?? repoId;
            const rootItemId = buildLayerTreeItemId(
                typeof rootEntry.layerIndex === 'number' ? 'layer' : 'folder',
                resolvedMode,
                rootRepoId,
                '.',
            );
            folderAndLayerItems.unshift(
                new LayerItem(rootLabel, rootEntry.enabled, rootEntry.layerIndex, {
                    itemId: rootItemId,
                    repoId: rootRepoId,
                    repoLabel: rootEntry.repoLabel,
                    showRepoLabelInDescription: false,
                    repoDisabled: rootEntry.repoDisabled,
                    toggleable: rootEntry.toggleable,
                    hasChildren: rootHasArtifactChildren,
                    path: '(root)',
                    layerPath: '.',
                    showPathInDescription: false,
                    excludedCount:
                        typeof rootEntry.layerIndex === 'number'
                            ? this.getExcludedCount(rootEntry.layerIndex)
                            : undefined,
                    capabilityName: rootEntry.capability?.name,
                    capabilityId: rootEntry.capability?.id,
                    capabilityDescription: rootEntry.capability?.description,
                    capabilityLicense: rootEntry.capability?.license,
                    summary: this.summarizePath(rootRepoId ?? 'primary', '.'),
                    scopeSummary: summarizeLayerInstructionScope(
                        this.state.treeSummaryCache,
                        rootRepoId ?? 'primary',
                        '.',
                    ),
                }),
            );
        }

        return folderAndLayerItems;
    }

    /**
     * Computes the set of artifact types that are available for browsing or toggling
     * for a given layer source. Returns an empty set only for unknown layers.
     */
    private getActiveTypesForLayer(layerIndex: number): Set<ExcludableArtifactType> {
        const config = this.getProjectedConfig();
        if (!config) {
            return new Set();
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];

        if (!layerSource && typeof singleLayerPath !== 'string') {
            return new Set();
        }

        const layerId = layerSource
            ? `${layerSource.repoId}/${layerSource.path}`
            : singleLayerPath!;
        const normalizedLayerId = this.normalizeLayerId(layerId);

        const result = new Set<ExcludableArtifactType>();
        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            if (this.normalizeLayerId(file.sourceLayer) === normalizedLayerId) {
                const type = getArtifactType(file.relativePath);
                if (type !== 'other') {
                    result.add(type as ExcludableArtifactType);
                }
            }
        }
        for (const t of layerSource?.excludedTypes ?? []) {
            result.add(t);
        }
        return result;
    }

    /**
     * Returns ArtifactTypeLayerItems for a given layer source.
     * These remain visible in tree mode even when the repository or layer is disabled,
     * so users can inspect capability contents before re-enabling them.
     */
    private getArtifactTypeChildren(layerIndex: number, repoId?: string): ArtifactTypeLayerItem[] {
        const config = this.getProjectedConfig();
        if (!config) {
            return [];
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];
        if (!layerSource && typeof singleLayerPath !== 'string') {
            return [];
        }

        const activeTypes = this.getActiveTypesForLayer(layerIndex);
        if (activeTypes.size === 0) {
            return [];
        }
        const availability = this.getLayerAvailability(layerIndex, repoId);
        const excludedTypes = layerSource?.excludedTypes ?? [];
        const repoMetadata = this.getRepoMetadataById();
        const repoLabel = layerSource
            ? (() => {
                  const repo = config.metadataRepos?.find(
                      (r: { id: string }) => r.id === layerSource.repoId,
                  );
                  return this.resolveRepoDisplayLabel(
                      layerSource.repoId,
                      repo?.name,
                      repo?.localPath,
                      repoMetadata.get(layerSource.repoId)?.name,
                  );
              })()
            : this.resolveRepoDisplayLabel(
                  'primary',
                  config.metadataRepo?.name,
                  config.metadataRepo?.localPath,
                  repoMetadata.get('primary')?.name,
              );
        const layerPath = layerSource?.path ?? singleLayerPath;
        const layerRepoId = layerSource?.repoId ?? repoId ?? 'primary';
        const layerSummary = summarizeLayerPrefix(
            this.state.treeSummaryCache,
            layerRepoId,
            layerPath ?? '.',
        );
        return ARTIFACT_TYPE_ORDER.filter((type) => activeTypes.has(type))
            .map((type) => ({
                type,
                hasChildren: this.getLayerBrowseRecords(layerIndex, type, repoId).length > 0,
            }))
            .map(
                ({ type, hasChildren }) =>
                    new ArtifactTypeLayerItem(
                        type,
                        layerIndex,
                        layerSource?.repoId ?? repoId,
                        excludedTypes.includes(type),
                        resolveArtifactInjectionState(config, layerIndex, type),
                        {
                            repoLabel,
                            layerPath,
                            counts: layerSummary.byType[type],
                            hasChildren,
                            repoEnabled: availability?.repoEnabled,
                            layerEnabled: availability?.layerEnabled,
                        },
                    ),
            );
    }

    getChildren(element?: LayerTreeItem): LayerTreeItem[] {
        if (this.state.isLoading && !this.state.config) {
            return element ? [] : [new LoadingLayerItem()];
        }

        const entries = this.getLayerEntries();
        const projectedConfig = this.getProjectedConfig();
        if (entries.length === 0) {
            return [];
        }

        const mode = this.modeResolver();
        if (mode === 'flat') {
            if (element) {
                return [];
            }

            return entries.map(
                (entry) =>
                    new LayerItem(entry.label, entry.enabled, entry.layerIndex, {
                        itemId: buildLayerTreeItemId(
                            'layer',
                            'flat',
                            entry.repoId,
                            entry.normalizedPath || '.',
                        ),
                        repoId: entry.repoId,
                        repoLabel: entry.repoLabel,
                        showRepoLabelInDescription: true,
                        repoDisabled: entry.repoDisabled,
                        toggleable: entry.toggleable,
                        hasChildren: false,
                        path: entry.normalizedPath || '(root)',
                        layerPath: entry.normalizedPath || '.',
                        showPathInDescription: true,
                        excludedCount: this.getExcludedCount(entry.layerIndex),
                        capabilityName: entry.capability?.name,
                        capabilityId: entry.capability?.id,
                        capabilityDescription: entry.capability?.description,
                        capabilityLicense: entry.capability?.license,
                        summary: this.summarizePath(
                            entry.repoId ?? 'primary',
                            entry.normalizedPath || '.',
                        ),
                        scopeSummary: summarizeLayerInstructionScope(
                            this.state.treeSummaryCache,
                            entry.repoId ?? 'primary',
                            entry.normalizedPath || '.',
                        ),
                    }),
            );
        }

        if (element instanceof LayerRepoItem) {
            const repoEntries = entries.filter((entry) => entry.repoId === element.repoId);
            return this.trackChildren(
                this.getTreeChildrenForPrefix(repoEntries, '', element.repoId, mode),
                element,
            );
        }

        if (element instanceof LayerItem) {
            const parentPath = element.pathKey === '(root)' ? '' : element.pathKey || '';
            const repoEntries = element.repoId
                ? entries.filter((entry) => entry.repoId === element.repoId)
                : entries.filter((entry) => entry.repoId === undefined);

            // A node can be both a concrete layer (has layerIndex) and a folder with child layers.
            // In that case, expose both descendants and artifact-type toggles.
            const folderChildren = this.getTreeChildrenForPrefix(
                repoEntries,
                parentPath,
                element.repoId,
                mode,
            ).filter((child) => child.pathKey !== '(root)');

            if (typeof element.layerIndex === 'number' && mode === 'tree') {
                const artifactChildren = this.getArtifactTypeChildren(
                    element.layerIndex,
                    element.repoId,
                );
                return this.trackChildren([...folderChildren, ...artifactChildren], element);
            }

            return this.trackChildren(folderChildren, element);
        }

        if (element instanceof ArtifactTypeLayerItem) {
            return this.trackChildren(
                this.getBrowseChildren(
                    element.layerIndex,
                    element.artifactType,
                    '.',
                    element.repoId,
                ),
                element,
            );
        }

        if (element instanceof ArtifactBrowseFolderItem) {
            return this.trackChildren(
                this.getBrowseChildren(
                    element.layerIndex,
                    element.artifactType,
                    element.browsePrefix,
                    element.repoId,
                ),
                element,
            );
        }

        if (projectedConfig?.metadataRepos && projectedConfig.layerSources) {
            const repoOrder = new Map(
                projectedConfig.metadataRepos.map((repo, idx) => [repo.id, idx]),
            );
            const repoDisabled = new Map(
                projectedConfig.metadataRepos.map((repo) => [repo.id, repo.enabled === false]),
            );
            const repoRoots = new Map(
                projectedConfig.metadataRepos.map((repo) => [repo.id, repo.localPath]),
            );
            const repoMetadataById = this.getRepoMetadataById();
            const repoLabels = new Map(
                projectedConfig.metadataRepos.map((repo) => [
                    repo.id,
                    this.resolveRepoDisplayLabel(
                        repo.id,
                        repo.name,
                        repo.localPath,
                        repoMetadataById.get(repo.id)?.name,
                    ),
                ]),
            );

            if (isBuiltInCapabilityActive(this.state.builtInCapability)) {
                const builtInEntry = entries.find(
                    (entry) => entry.repoId === BUILT_IN_CAPABILITY_REPO_ID,
                );
                repoOrder.set(BUILT_IN_CAPABILITY_REPO_ID, Number.MAX_SAFE_INTEGER);
                repoDisabled.set(BUILT_IN_CAPABILITY_REPO_ID, false);
                repoLabels.set(
                    BUILT_IN_CAPABILITY_REPO_ID,
                    builtInEntry?.repoLabel ??
                        resolveBuiltInCapabilityDisplayName(
                            undefined,
                            this.state.builtInCapability.sourceDisplayName,
                        ),
                );
            }

            const repoIds = Array.from(
                new Set(
                    entries
                        .map((entry) => entry.repoId)
                        .filter((id): id is string => typeof id === 'string'),
                ),
            );
            return this.trackChildren(
                repoIds
                    .sort(
                        (a, b) =>
                            (repoOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
                            (repoOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
                    )
                    .map(
                        (repoId) =>
                            new LayerRepoItem(
                                repoLabels.get(repoId) || repoId,
                                repoId,
                                repoDisabled.get(repoId) === true,
                                summarizeRepo(this.state.treeSummaryCache, repoId),
                                summarizeRepoInstructionScope(this.state.treeSummaryCache, repoId),
                                {
                                    title: repoMetadataById.get(repoId)?.name,
                                    description: repoMetadataById.get(repoId)?.description,
                                    localPath: repoRoots.get(repoId),
                                    builtIn: repoId === BUILT_IN_CAPABILITY_REPO_ID,
                                },
                            ),
                    ),
                undefined,
            );
        }

        return this.trackChildren(this.getTreeChildrenForPrefix(entries, ''), undefined);
    }

    getParent(element: LayerTreeItem): LayerTreeItem | undefined {
        return this._parentMap.get(element);
    }
}
