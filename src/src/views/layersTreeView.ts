/**
 * Layers TreeView provider.
 *
 * Displays layers in precedence order with enabled/disabled state.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    ArtifactType,
    discoverLayersInRepo,
    EffectiveFile,
    getArtifactType,
    loadRepoManifestForRoot,
    parseFrontmatter,
} from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    isBuiltInCapabilityActive,
    normalizeBuiltInLayerPath,
    resolveBuiltInCapabilityDisplayName,
    resolveBuiltInLayerEnabled,
    resolveBuiltInRepoEnabled,
} from '../builtInCapability';
import {
    ensureMultiRepoConfig,
    projectConfigForProfile,
    readManagedViewsState,
} from '../commands/commandHelpers';
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
import {
    buildCapabilityGovernanceProjection,
    buildRepoGovernanceProjection,
    type CapabilityGovernanceProjection,
    type RepoGovernanceProjection,
} from '../governanceSignals';
import type { ExpandAllStrategy, StagedExpandPlan } from './stagedTreeExpand';

type CapabilityArtifactType = Exclude<ArtifactType, 'other'>;

const KNOWN_ARTIFACT_TYPES = new Set<CapabilityArtifactType>([
    'instructions',
    'prompts',
    'agents',
    'skills',
]);
const RESERVED_LAYER_TERMINAL_SEGMENTS = new Set<string>([
    ...KNOWN_ARTIFACT_TYPES,
    'hooks',
    'chatmodes',
    '.github',
    '.agents',
    '.claude',
    '.codex',
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

interface DirectoryManifestMetadata {
    name?: string;
    description?: string;
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

function normalizeSearchQuery(value: string | undefined): string | undefined {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : undefined;
}

function projectBuiltInCapabilityConfig(
    config: ExtensionState['config'],
    builtInCapability: ExtensionState['builtInCapability'],
    repoMetadataById: Record<string, { name?: string; description?: string }> | undefined,
): ExtensionState['config'] {
    if (!config || !isBuiltInCapabilityActive(builtInCapability) || !builtInCapability.sourceRoot) {
        return config;
    }

    const projected = JSON.parse(JSON.stringify(config)) as NonNullable<ExtensionState['config']>;
    const multiRepoConfig = ensureMultiRepoConfig(projected);
    const builtInRepoLabel =
        repoMetadataById?.[BUILT_IN_CAPABILITY_REPO_ID]?.name?.trim() ||
        resolveBuiltInCapabilityDisplayName(undefined, builtInCapability.sourceDisplayName);
    const builtInRepoEnabled = resolveBuiltInRepoEnabled(builtInCapability);
    const builtInLayerPaths = Array.from(
        new Set(
            discoverLayersInRepo(builtInCapability.sourceRoot).map((layerPath) =>
                normalizeBuiltInLayerPath(layerPath),
            ),
        ),
    );
    if (builtInLayerPaths.length === 0) {
        builtInLayerPaths.push(BUILT_IN_CAPABILITY_LAYER_PATH);
    }

    builtInLayerPaths.sort((left, right) => {
        if (left === BUILT_IN_CAPABILITY_LAYER_PATH) {
            return -1;
        }
        if (right === BUILT_IN_CAPABILITY_LAYER_PATH) {
            return 1;
        }
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
    });

    multiRepoConfig.metadataRepos = multiRepoConfig.metadataRepos.filter(
        (repo) => repo.id !== BUILT_IN_CAPABILITY_REPO_ID,
    );
    multiRepoConfig.metadataRepos.push({
        id: BUILT_IN_CAPABILITY_REPO_ID,
        name: builtInRepoLabel,
        localPath: builtInCapability.sourceRoot,
        enabled: builtInRepoEnabled,
    });

    multiRepoConfig.layerSources = multiRepoConfig.layerSources.filter(
        (layer) => layer.repoId !== BUILT_IN_CAPABILITY_REPO_ID,
    );
    for (const layerPath of builtInLayerPaths) {
        multiRepoConfig.layerSources.push({
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            path: layerPath,
            enabled: resolveBuiltInLayerEnabled(builtInCapability, layerPath),
        });
    }

    // .filter() above created new arrays — sync references back to the returned config.
    projected.metadataRepos = multiRepoConfig.metadataRepos;
    projected.layerSources = multiRepoConfig.layerSources;

    return projected;
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

function isReservedArtifactContainerLayerPath(layerPath: string): boolean {
    const normalized = normalizeRelativePath(layerPath);
    if (normalized === '.') {
        return false;
    }

    const segments = normalized.split('/').filter(Boolean);
    const terminalSegment = segments[segments.length - 1];
    return RESERVED_LAYER_TERMINAL_SEGMENTS.has(terminalSegment);
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
    const typeIndex = displayParts.findIndex((part): part is CapabilityArtifactType =>
        KNOWN_ARTIFACT_TYPES.has(part as CapabilityArtifactType),
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
    mode: 'settings' | 'synchronize' | 'plugin';
    source: ArtifactInjectionSource;
}

const DEFAULT_ARTIFACT_INJECTION_MODE: Record<
    CapabilityArtifactType,
    'settings' | 'synchronize' | 'plugin'
> = {
    instructions: 'plugin',
    prompts: 'settings',
    agents: 'plugin',
    skills: 'plugin',
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
    artifactType: CapabilityArtifactType,
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
        experimental?: boolean;
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
    artifactType?: CapabilityArtifactType,
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
            governance?: RepoGovernanceProjection;
        },
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.id = buildLayerTreeItemId('repo', 'tree', repoId, '.');
        this.contextValue = 'layerRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        this.checkboxState = repoDisabled
            ? vscode.TreeItemCheckboxState.Unchecked
            : vscode.TreeItemCheckboxState.Checked;
        this.description = formatSummaryDescription(undefined, summary, [
            ...(repoDisabled ? ['disabled'] : []),
            ...(options?.governance?.descriptionQualifiers ?? []),
        ]);
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
        detailLines.push(...(options?.governance?.tooltipLines ?? []));

        this.tooltip = buildMarkdownTooltip(
            `**${options?.title?.trim() || label}**`,
            detailLines,
            options?.description ? `*${options.description}*` : undefined,
        );
        this.accessibilityInformation = {
            label: `${label} ${repoDisabled ? 'disabled' : 'enabled'}`,
            role: 'checkbox',
        };
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
            capabilityName?: string;
            capabilityId?: string;
            capabilityDescription?: string;
            capabilityLicense?: string;
            capabilityExperimental?: boolean;
            folderDescription?: string;
            summary?: ArtifactSummary;
            scopeSummary?: InstructionScopeSummary;
            branchToggleSummary?: BranchToggleSummary;
            governance?: CapabilityGovernanceProjection;
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
                arguments: [{ layerIndex, repoId: options?.repoId, layerPath: options?.layerPath }],
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
            if (options.repoDisabled) {
                qualifiers.push('repo disabled');
            }
        } else if (options?.toggleable === false && typeof layerIndex === 'number') {
            qualifiers.push('single-repo');
            qualifiers.push('fixed order');
        }
        if (options?.branchToggleSummary?.status === 'partially-enabled') {
            qualifiers.push(
                `${options.branchToggleSummary.enabledCount}/${options.branchToggleSummary.totalCount} enabled`,
            );
        }
        if (typeof layerIndex === 'number') {
            qualifiers.push(...(options?.governance?.descriptionFlags ?? []));
            if (options?.capabilityExperimental) {
                qualifiers.push('experimental');
            }
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
        if (options?.branchToggleSummary) {
            contextLines.push(`Branch state: ${formatBranchStatus(options.branchToggleSummary)}`);
        }
        if (options?.governance?.summary) {
            contextLines.push(options.governance.summary);
        }
        contextLines.push(...(options?.governance?.detailLines ?? []));

        if (typeof layerIndex === 'number' && typeof enabled === 'boolean') {
            this.accessibilityInformation = {
                label: `${displayLabel}${options?.capabilityExperimental ? ' experimental' : ''} ${enabled ? 'enabled' : 'disabled'}`,
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
            if (options.capabilityExperimental) {
                capabilityLines.push('Status: Experimental');
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
                this.tooltip = buildMarkdownTooltip(
                    `**${displayLabel}**`,
                    folderLines,
                    options?.folderDescription ? `*${options.folderDescription}*` : undefined,
                );
            }
        }
    }
}

const ARTIFACT_TYPE_ORDER: CapabilityArtifactType[] = [
    'instructions',
    'prompts',
    'agents',
    'skills',
];

function buildArtifactTypeContextValue(artifactType: CapabilityArtifactType): string {
    return `layerArtifactType:${artifactType}`;
}

function formatArtifactTypeCountLabel(counts: ArtifactSummaryCounts | undefined): string | undefined {
    if (!counts) {
        return undefined;
    }

    if (counts.active > 0 || counts.available > 0) {
        return `${counts.active}/${counts.available}`;
    }

    return String(counts.available);
}

class ArtifactTypeLayerItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: CapabilityArtifactType,
        public readonly layerIndex: number,
        public readonly repoId: string | undefined,
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
        this.iconPath = new vscode.ThemeIcon('folder');
        const countLabel = formatArtifactTypeCountLabel(options?.counts);
        const qualifiers = [
            injection.mode,
            ...(options?.repoEnabled === false ? ['repo disabled'] : []),
            ...(options?.layerEnabled === false ? ['capability disabled'] : []),
        ];
        this.description =
            countLabel !== undefined
                ? `(${countLabel}, ${qualifiers.join(', ')})`
                : `(${qualifiers.join(', ')})`;
        const detailLines = [
            'Status: available in this capability',
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

        this.tooltip = buildMarkdownTooltip(`**Artifact Type**: ${artifactType}`, detailLines);
    }
}

class ArtifactBrowseFolderItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly artifactType: CapabilityArtifactType,
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
        public readonly artifactType: CapabilityArtifactType,
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
    private readonly directoryManifestByPath = new Map<string, DirectoryManifestMetadata | null>();
    private searchQuery: string | undefined;
    private searchVersion = 0;

    constructor(
        private state: ExtensionState,
        private readonly modeResolver: () => LayersViewMode = () =>
            readManagedViewsState(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath)
                .layersViewMode,
    ) {
        state.onDidChange.event(() => {
            this.directoryManifestByPath.clear();
            this._onDidChangeTreeData.fire(undefined);
        });
    }

    refresh(): void {
        this.directoryManifestByPath.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    setSearchQuery(value: string | undefined): void {
        const normalized = normalizeSearchQuery(value);
        if (normalized === this.searchQuery) {
            return;
        }

        this.searchQuery = normalized;
        this.searchVersion += 1;
        this._onDidChangeTreeData.fire(undefined);
    }

    getSearchQuery(): string | undefined {
        return this.searchQuery;
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

    private getSearchableText(element: LayerTreeItem): string {
        if (element instanceof LayerRepoItem) {
            return [element.label, element.repoId, element.description]
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
                .toLowerCase();
        }

        if (element instanceof LayerItem) {
            return [
                element.label,
                element.repoId,
                element.pathKey,
                element.layerPath,
                element.description,
            ]
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
                .toLowerCase();
        }

        if (element instanceof ArtifactTypeLayerItem) {
            return [element.label, element.artifactType, element.description]
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
                .toLowerCase();
        }

        if (element instanceof ArtifactBrowseFolderItem) {
            return [element.label, element.artifactType, element.browsePrefix, element.description]
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
                .toLowerCase();
        }

        if (element instanceof ArtifactBrowseFileItem) {
            return [element.label, element.artifactType, element.browsePath, element.description]
                .filter((value): value is string => typeof value === 'string')
                .join(' ')
                .toLowerCase();
        }

        return String(element.label ?? '').toLowerCase();
    }

    private matchesSearch(element: LayerTreeItem): boolean {
        if (!this.searchQuery) {
            return true;
        }

        return this.getSearchableText(element).includes(this.searchQuery);
    }

    private applySearchPresentation<T extends LayerTreeItem>(element: T): T {
        if (element.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
            element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }

        if (typeof element.id === 'string' && element.id.length > 0) {
            element.id = `${element.id}|search:${this.searchVersion}`;
        }

        return element;
    }

    private getSearchFilteredChildren(element?: LayerTreeItem): LayerTreeItem[] {
        const children = this.getChildrenCore(element);
        if (!this.searchQuery) {
            return children;
        }

        return children.filter((child) => {
            const descendantMatches =
                child.collapsibleState === vscode.TreeItemCollapsibleState.None
                    ? []
                    : this.getSearchFilteredChildren(child);
            const include = this.matchesSearch(child) || descendantMatches.length > 0;

            if (include && descendantMatches.length > 0) {
                this.applySearchPresentation(child);
            }

            return include;
        });
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
        artifactType: CapabilityArtifactType,
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
        artifactType: CapabilityArtifactType,
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
        artifactType: CapabilityArtifactType,
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
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
            experimental?: boolean;
        }
    > {
        const capabilityByLayer = new Map<
            string,
            {
                id?: string;
                name?: string;
                description?: string;
                license?: string;
                experimental?: boolean;
            }
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
                file.sourceCapabilityLicense ||
                file.sourceCapabilityExperimental
            ) {
                capabilityByLayer.set(normalized, {
                    id: file.sourceCapabilityId,
                    name: file.sourceCapabilityName,
                    description: file.sourceCapabilityDescription,
                    license: file.sourceCapabilityLicense,
                    experimental: file.sourceCapabilityExperimental,
                });
            }
        }

        return capabilityByLayer;
    }

    private getProjectedConfig(): ExtensionState['config'] {
        const config = this.state.config;
        if (!config) {
            return undefined;
        }

        const projected = projectBuiltInCapabilityConfig(
            projectConfigForProfile(config),
            this.state.builtInCapability,
            this.state.repoMetadataById,
        );

        if (
            !projected ||
            !isBuiltInCapabilityActive(this.state.builtInCapability) ||
            !this.state.builtInCapability.sourceRoot ||
            projected.metadataRepos?.some((repo) => repo.id === BUILT_IN_CAPABILITY_REPO_ID)
        ) {
            return projected;
        }

        const fallback = JSON.parse(JSON.stringify(projected)) as NonNullable<
            ExtensionState['config']
        >;
        const multiRepoConfig = ensureMultiRepoConfig(fallback);
        const builtInRepoLabel =
            this.state.repoMetadataById?.[BUILT_IN_CAPABILITY_REPO_ID]?.name?.trim() ||
            resolveBuiltInCapabilityDisplayName(
                undefined,
                this.state.builtInCapability.sourceDisplayName,
            );
        multiRepoConfig.metadataRepos.push({
            id: BUILT_IN_CAPABILITY_REPO_ID,
            name: builtInRepoLabel,
            localPath: this.state.builtInCapability.sourceRoot,
            enabled: true,
        });
        multiRepoConfig.layerSources.push({
            repoId: BUILT_IN_CAPABILITY_REPO_ID,
            path: BUILT_IN_CAPABILITY_LAYER_PATH,
            enabled: resolveBuiltInLayerEnabled(
                this.state.builtInCapability,
                BUILT_IN_CAPABILITY_LAYER_PATH,
            ),
        });
        return fallback;
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

            const entries = config.layerSources.reduce<LayerEntry[]>((acc, ls, i) => {
                const isRepoEnabled = repoEnabled.get(ls.repoId) !== false;
                const isLayerEnabled = ls.enabled !== false;
                const layerId = `${ls.repoId}/${ls.path}`;
                const capability = capabilityByLayer.get(this.normalizeLayerId(layerId));
                const normalizedPath = this.normalizeLayerPath(ls.path);
                if (isReservedArtifactContainerLayerPath(normalizedPath)) {
                    return acc;
                }
                const summary = this.state.treeSummaryCache
                    ? this.summarizePath(ls.repoId, normalizedPath)
                    : undefined;
                const hasRenderableContent =
                    capability !== undefined ||
                    !this.state.treeSummaryCache ||
                    (summary?.totalAvailable ?? 0) > 0;

                if (!hasRenderableContent) {
                    return acc;
                }

                acc.push({
                    label: this.formatLayerLabel(ls.path, repoLabels.get(ls.repoId)),
                    layerIndex: i,
                    enabled: isRepoEnabled && isLayerEnabled,
                    repoId: ls.repoId,
                    repoLabel: repoLabels.get(ls.repoId) || ls.repoId,
                    repoDisabled: !isRepoEnabled,
                    toggleable: true,
                    normalizedPath,
                    capability,
                });

                return acc;
            }, []);

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
            const entries = config.layers.reduce<LayerEntry[]>((acc, layer, i) => {
                const normalizedLayerId = this.normalizeLayerId(layer);
                const capability = capabilityByLayer.get(normalizedLayerId);
                const normalizedPath = this.normalizeLayerPath(layer);
                if (isReservedArtifactContainerLayerPath(normalizedPath)) {
                    return acc;
                }
                const summary = this.state.treeSummaryCache
                    ? this.summarizePath('primary', normalizedPath)
                    : undefined;
                const hasRenderableContent =
                    capability !== undefined ||
                    !this.state.treeSummaryCache ||
                    (summary?.totalAvailable ?? 0) > 0;

                if (!hasRenderableContent) {
                    return acc;
                }

                acc.push({
                    label: this.formatLayerLabel(layer, singleRepoLabel),
                    layerIndex: i,
                    enabled: true,
                    repoLabel: singleRepoLabel,
                    toggleable: true,
                    normalizedPath,
                    capability,
                });

                return acc;
            }, []);

            return entries;
        }

        return [];
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

    private resolveRepoRootPath(repoId: string | undefined): string | undefined {
        if (!repoId) {
            return undefined;
        }

        if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
            return this.state.builtInCapability.sourceRoot
                ? path.normalize(this.state.builtInCapability.sourceRoot)
                : undefined;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const configuredPath =
            repoId === 'primary'
                ? this.state.config?.metadataRepo?.localPath
                : this.state.config?.metadataRepos?.find((repo) => repo.id === repoId)?.localPath;

        if (!configuredPath) {
            return undefined;
        }

        if (path.isAbsolute(configuredPath)) {
            return path.normalize(configuredPath);
        }

        if (!workspaceRoot) {
            return undefined;
        }

        return path.normalize(path.join(workspaceRoot, configuredPath));
    }

    private getDirectoryManifestMetadata(
        folderPath: string | undefined,
    ): DirectoryManifestMetadata | undefined {
        if (!folderPath) {
            return undefined;
        }

        const normalizedPath = path.normalize(folderPath);
        const cached = this.directoryManifestByPath.get(normalizedPath);
        if (cached !== undefined) {
            return cached ?? undefined;
        }

        const manifest = loadRepoManifestForRoot(normalizedPath);
        const metadata =
            manifest?.name?.trim() || manifest?.description?.trim()
                ? {
                      name: manifest.name?.trim() || undefined,
                      description: manifest.description?.trim() || undefined,
                  }
                : undefined;

        this.directoryManifestByPath.set(normalizedPath, metadata ?? null);
        return metadata;
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
            let childPath: string | undefined;
            let childLabel: string | undefined;

            if (
                !prefix &&
                repoId === BUILT_IN_CAPABILITY_REPO_ID &&
                remainder.startsWith('capabilities/')
            ) {
                const hiddenPrefixRemainder = remainder.slice('capabilities/'.length);
                const [segment] = hiddenPrefixRemainder.split('/');
                if (segment) {
                    childPath = `capabilities/${segment}`;
                    childLabel = segment;
                }
            } else {
                const [segment] = remainder.split('/');
                if (segment) {
                    childPath = prefix ? `${prefix}/${segment}` : segment;
                    childLabel = segment;
                }
            }

            if (!childPath || !childLabel) {
                continue;
            }

            if (!children.has(childPath)) {
                children.set(childPath, { path: childPath, label: childLabel });
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
                const itemRepoLabel =
                    matchingEntry?.repoLabel ??
                    entries.find(
                        (entry) =>
                            entry.repoId === itemRepoId &&
                            (entry.normalizedPath === node.path ||
                                entry.normalizedPath.startsWith(`${node.path}/`)),
                    )?.repoLabel;
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
                const folderSourcePath =
                    typeof matchingEntry?.layerIndex === 'number' || !itemRepoId
                        ? undefined
                        : (() => {
                              const repoRootPath = this.resolveRepoRootPath(itemRepoId);
                              return repoRootPath
                                  ? path.join(repoRootPath, ...node.path.split('/').filter(Boolean))
                                  : undefined;
                          })();
                const directoryMetadata =
                    typeof matchingEntry?.layerIndex === 'number'
                        ? undefined
                        : this.getDirectoryManifestMetadata(folderSourcePath);
                const displayLabel =
                    typeof matchingEntry?.layerIndex === 'number'
                        ? node.label
                        : directoryMetadata?.name?.trim() || node.label;
                return new LayerItem(
                    displayLabel,
                    matchingEntry?.enabled,
                    matchingEntry?.layerIndex,
                    {
                        itemId,
                        repoId: itemRepoId,
                        repoLabel: itemRepoLabel,
                        showRepoLabelInDescription: false,
                        repoDisabled: matchingEntry?.repoDisabled,
                        toggleable: matchingEntry?.toggleable,
                        hasChildren: hasChildren || hasArtifactTypeChildren,
                        path: node.path,
                        layerPath: node.path,
                        showPathInDescription: false,
                        capabilityName: matchingEntry?.capability?.name,
                        capabilityId: matchingEntry?.capability?.id,
                        capabilityDescription: matchingEntry?.capability?.description,
                        capabilityLicense: matchingEntry?.capability?.license,
                        capabilityExperimental: matchingEntry?.capability?.experimental,
                        folderDescription: directoryMetadata?.description,
                        summary: this.summarizePath(itemRepoId ?? 'primary', node.path || '.'),
                        scopeSummary: summarizeLayerInstructionScope(
                            this.state.treeSummaryCache,
                            itemRepoId ?? 'primary',
                            node.path || '.',
                        ),
                        branchToggleSummary,
                        governance:
                            typeof matchingEntry?.layerIndex === 'number'
                                ? buildCapabilityGovernanceProjection(
                                      itemRepoId,
                                      matchingEntry?.normalizedPath || node.path || '.',
                                      {
                                          governanceContract: this.state.governanceContract,
                                          governanceContractErrors:
                                              this.state.governanceContractErrors,
                                          governanceCompliance: this.state.governanceCompliance,
                                      },
                                  )
                                : undefined,
                    },
                );
            })
            .sort((a, b) =>
                String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }),
            );

        if (!prefix && rootEntry) {
            const rootLabel = entries[0]?.repoId ? 'root' : rootEntry.label;
            const rootHasDescendantLayers = entries.some((entry) => entry.normalizedPath !== '');
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
                    hasChildren: rootHasDescendantLayers || rootHasArtifactChildren,
                    path: '(root)',
                    layerPath: '.',
                    showPathInDescription: false,
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
                    governance:
                        typeof rootEntry.layerIndex === 'number'
                            ? buildCapabilityGovernanceProjection(rootRepoId, '.', {
                                  governanceContract: this.state.governanceContract,
                                  governanceContractErrors: this.state.governanceContractErrors,
                                  governanceCompliance: this.state.governanceCompliance,
                              })
                            : undefined,
                }),
            );
        }

        return folderAndLayerItems;
    }

    /**
     * Computes the set of artifact types that are available for browsing
     * for a given layer source. Returns an empty set only for unknown layers.
     */
    private getActiveTypesForLayer(layerIndex: number): Set<CapabilityArtifactType> {
        const config = this.getProjectedConfig();
        if (!config) {
            return new Set();
        }

        const layerSource = config.layerSources?.[layerIndex];
        const singleLayerPath = config.layers?.[layerIndex];

        if (!layerSource && typeof singleLayerPath !== 'string') {
            return new Set();
        }

        const layerRepoId = layerSource?.repoId ?? 'primary';
        const layerPath = layerSource?.path ?? singleLayerPath ?? '.';
        const normalizedLayerPath = normalizeRelativePath(layerPath);
        const layerId = layerSource
            ? `${layerRepoId}/${layerPath}`
            : singleLayerPath!;
        const normalizedLayerId = this.normalizeLayerId(layerId);

        const result = new Set<CapabilityArtifactType>();
        for (const file of this.state.effectiveFiles as EffectiveFile[]) {
            if (this.normalizeLayerId(file.sourceLayer) === normalizedLayerId) {
                const type = getArtifactType(file.relativePath);
                if (type !== 'other') {
                    result.add(type as CapabilityArtifactType);
                }
            }
        }
        for (const record of this.state.treeSummaryCache?.availableRecords ?? []) {
            if (
                record.repoId === layerRepoId &&
                pathStartsWith(record.repoRelativePath, normalizedLayerPath)
            ) {
                result.add(record.artifactType);
            }
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

    private getChildrenCore(element?: LayerTreeItem): LayerTreeItem[] {
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
                        capabilityName: entry.capability?.name,
                        capabilityId: entry.capability?.id,
                        capabilityDescription: entry.capability?.description,
                        capabilityLicense: entry.capability?.license,
                        capabilityExperimental: entry.capability?.experimental,
                        summary: this.summarizePath(
                            entry.repoId ?? 'primary',
                            entry.normalizedPath || '.',
                        ),
                        scopeSummary: summarizeLayerInstructionScope(
                            this.state.treeSummaryCache,
                            entry.repoId ?? 'primary',
                            entry.normalizedPath || '.',
                        ),
                        governance: buildCapabilityGovernanceProjection(
                            entry.repoId,
                            entry.normalizedPath || '.',
                            {
                                governanceContract: this.state.governanceContract,
                                governanceContractErrors: this.state.governanceContractErrors,
                                governanceCompliance: this.state.governanceCompliance,
                            },
                        ),
                    }),
            );
        }

        if (element instanceof LayerRepoItem) {
            const repoEntries = entries.filter((entry) => entry.repoId === element.repoId);
            const repoChildren = this.getTreeChildrenForPrefix(
                repoEntries,
                '',
                element.repoId,
                mode,
            );
            if (mode === 'tree' && repoEntries.some((entry) => entry.normalizedPath === '')) {
                if (element.repoId === BUILT_IN_CAPABILITY_REPO_ID) {
                    return this.trackChildren(repoChildren, element);
                }

                const rootLayer = repoChildren.find((child) => child.pathKey === '(root)');
                if (rootLayer) {
                    return this.trackChildren([rootLayer], element);
                }
            }

            return this.trackChildren(repoChildren, element);
        }

        if (element instanceof LayerItem) {
            const parentPath = element.pathKey === '(root)' ? '' : element.pathKey || '';
            const repoEntries = element.repoId
                ? entries.filter((entry) => entry.repoId === element.repoId)
                : entries.filter((entry) => entry.repoId === undefined);

            // Branch nodes stay structural; leaf capability nodes expose artifact-type browse rows.
            const folderChildren = this.getTreeChildrenForPrefix(
                repoEntries,
                parentPath,
                element.repoId,
                mode,
            ).filter((child) => child.pathKey !== '(root)');

            if (typeof element.layerIndex === 'number' && mode === 'tree') {
                const builtInRootLayer =
                    element.repoId === BUILT_IN_CAPABILITY_REPO_ID &&
                    element.layerPath === BUILT_IN_CAPABILITY_LAYER_PATH;
                const artifactChildren = this.getArtifactTypeChildren(
                    element.layerIndex,
                    element.repoId,
                );

                if (builtInRootLayer) {
                    return this.trackChildren(artifactChildren, element);
                }

                return this.trackChildren(
                    folderChildren.length > 0 ? folderChildren : artifactChildren,
                    element,
                );
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
                repoDisabled.set(
                    BUILT_IN_CAPABILITY_REPO_ID,
                    !resolveBuiltInRepoEnabled(this.state.builtInCapability),
                );
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
                                    governance: buildRepoGovernanceProjection(repoId, {
                                        governanceContract: this.state.governanceContract,
                                        governanceContractErrors:
                                            this.state.governanceContractErrors,
                                        governanceCompliance: this.state.governanceCompliance,
                                    }),
                                },
                            ),
                    ),
                undefined,
            );
        }

        return this.trackChildren(this.getTreeChildrenForPrefix(entries, ''), undefined);
    }

    getChildren(element?: LayerTreeItem): LayerTreeItem[] {
        return this.searchQuery
            ? this.getSearchFilteredChildren(element)
            : this.getChildrenCore(element);
    }

    getExpandAllStrategy(): ExpandAllStrategy {
        return this.modeResolver() === 'tree' ? 'staged' : 'recursive';
    }

    getStagedExpandPlan(): StagedExpandPlan<LayerTreeItem> {
        if (this.getExpandAllStrategy() !== 'staged') {
            return { stageOne: [], stageTwo: [] };
        }

        const stages: LayerTreeItem[][] = [];
        const seenByStage: Set<string>[] = [];
        let currentLevel = this.getChildren().filter((node) =>
            this.shouldAutoExpandLayerNode(node),
        );

        while (currentLevel.length > 0) {
            const stageIndex = stages.length;
            stages.push([]);
            seenByStage.push(new Set<string>());

            for (const node of currentLevel) {
                this.appendExpandPlanNode(stages[stageIndex], seenByStage[stageIndex], node);
            }

            currentLevel = currentLevel
                .flatMap((node) => this.getChildren(node))
                .filter((node) => this.shouldAutoExpandLayerNode(node));
        }

        return {
            stageOne: stages[0] ?? [],
            stageTwo: stages[1] ?? [],
            stages,
        };
    }

    private shouldAutoExpandLayerNode(node: LayerTreeItem): boolean {
        if (node.collapsibleState === vscode.TreeItemCollapsibleState.None) {
            return false;
        }

        if (node instanceof LayerRepoItem) {
            return true;
        }

        if (node instanceof LayerItem) {
            return typeof node.layerIndex !== 'number';
        }

        return false;
    }

    private getExpandPlanAncestors(
        node: LayerTreeItem,
        ancestors: LayerTreeItem[],
    ): LayerTreeItem[] {
        if (ancestors.length > 0) {
            return ancestors;
        }

        const resolved: LayerTreeItem[] = [];
        let current = this.getParent(node);
        while (current) {
            resolved.unshift(current);
            current = this.getParent(current);
        }
        return resolved;
    }

    getParent(element: LayerTreeItem): LayerTreeItem | undefined {
        return this._parentMap.get(element);
    }

    private appendExpandPlanNode(
        target: LayerTreeItem[],
        seen: Set<string>,
        node: LayerTreeItem,
    ): void {
        if (node.collapsibleState === vscode.TreeItemCollapsibleState.None) {
            return;
        }

        const key = typeof node.id === 'string' ? node.id : undefined;
        if (key && seen.has(key)) {
            return;
        }

        if (key) {
            seen.add(key);
        }
        target.push(node);
    }
}
