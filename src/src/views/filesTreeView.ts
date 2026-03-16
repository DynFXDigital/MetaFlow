/**
 * Files TreeView provider.
 *
 * Shows effective files grouped by artifact type (instructions, prompts, agents, skills).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EffectiveFile, getArtifactType, ArtifactType, parseFrontmatter } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';
import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BUILT_IN_CAPABILITY_REPO_ID,
    isBuiltInCapabilityActive,
    resolveBuiltInCapabilityDisplayName,
} from '../builtInCapability';
import { resolveRepoDisplayLabel } from '../repoDisplayLabel';
import {
    assessInstructionScope,
    ArtifactSummaryCounts,
    ArtifactSummary,
    formatSummaryDescription,
    getInstructionScopeTooltipLines,
    getSummaryTooltipLines,
    summarizeArtifactInstructionScope,
    summarizeArtifactPrefix,
    summarizeDisplayInstructionScope,
    summarizeDisplayPrefix,
    summarizeRepoInstructionScope,
    summarizeRepo,
    SummaryArtifactType,
} from '../treeSummary';

interface SourceRoot {
    rootPath: string;
    label: string;
    diskLabel: string;
    repoId: string;
}

interface CapabilityMetadata {
    id?: string;
    name?: string;
    description?: string;
    license?: string;
}

interface FolderTooltipMetadata {
    title: string;
    description?: string;
    details: string[];
}

interface SkillFolderMetadata {
    slug: string;
    displayLabel: string;
}

type FilesViewMode = 'unified' | 'repoTree';

// ArtifactType and getArtifactType are imported from @metaflow/engine.
export type { ArtifactType } from '@metaflow/engine';

const KNOWN_TYPES: ReadonlySet<string> = new Set(['instructions', 'prompts', 'agents', 'skills']);
const TYPE_ORDER: ArtifactType[] = ['instructions', 'prompts', 'agents', 'skills', 'other'];

const toPosixPath = (value: string): string => value.replace(/\\/g, '/');
const isPathWithin = (targetPath: string, parentPath: string): boolean => {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedParent = path.normalize(parentPath);
    return (
        normalizedTarget === normalizedParent ||
        normalizedTarget.startsWith(normalizedParent + path.sep)
    );
};
const sortByLabel = <T extends vscode.TreeItem>(items: T[]): T[] =>
    [...items].sort((a, b) =>
        String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }),
    );
const normalizeIdentity = (value: string): string => value.trim().toLowerCase();

function toDisplayRelativePath(relativePath: string): string {
    const parts = toPosixPath(relativePath).split('/').filter(Boolean);
    const githubIndex = parts.indexOf('.github');
    if (githubIndex === -1) {
        return parts.join('/');
    }

    const displayParts = [...parts.slice(0, githubIndex), ...parts.slice(githubIndex + 1)];
    return displayParts.join('/');
}

/** Full hierarchy display path: layer-relative dirs + artifact path, with .github stripped. */
function getDisplayPathForRepoTree(file: EffectiveFile): string {
    const layerPath = getLayerDisplayPath(file);
    const normalizedLayerPath = layerPath === '.' ? '' : layerPath;
    const artifactPath = toDisplayRelativePath(file.relativePath);
    const combined = [normalizedLayerPath, artifactPath].filter(Boolean).join('/');
    // Strip .github segments from the composite path so layers rooted at .github
    // (e.g. the built-in capability) display their artifact type folders directly.
    return toDisplayRelativePath(combined);
}

/**
 * Returns the path of a file relative to its artifact-type segment.
 * Works for both flat paths (instructions/foo.md → foo.md) and deep
 * hierarchy paths (capabilities/devtools/instructions/foo.md → foo.md).
 */
function getPathAfterArtifactType(file: EffectiveFile): string {
    const displayPath = toDisplayRelativePath(file.relativePath);
    const parts = displayPath.split('/').filter(Boolean);
    const typeIndex = parts.findIndex((p) => KNOWN_TYPES.has(p));
    if (typeIndex === -1) {
        return displayPath;
    }
    return parts.slice(typeIndex + 1).join('/');
}

function getLayerDisplayPath(file: EffectiveFile): string {
    const sourceLayer = toPosixPath(file.sourceLayer || '').replace(/^\/|\/$/g, '');
    const sourceRepo = toPosixPath(file.sourceRepo || '').replace(/^\/|\/$/g, '');

    if (sourceRepo && sourceLayer.startsWith(sourceRepo + '/')) {
        return sourceLayer.slice(sourceRepo.length + 1);
    }

    return sourceLayer;
}

function getDisplayLayerLabel(file: EffectiveFile, sourceLabel: string): string {
    const layerPath = getLayerDisplayPath(file);
    return layerPath === '.' ? sourceLabel : layerPath;
}

function getClassificationLabel(classification: EffectiveFile['classification']): string {
    return classification === 'settings' ? 'settings' : 'synchronized';
}

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

function buildFileItemTooltip(
    file: EffectiveFile,
    sourceLabel: string,
    displayLayerLabel: string,
    frontmatterFields?: Record<string, string>,
): vscode.MarkdownString {
    const fileName = path.posix.basename(toPosixPath(file.relativePath));
    const fm = frontmatterFields;

    const title = `**${fm?.name?.trim() || fileName}**`;
    const description = fm?.description?.trim() ? `*${fm.description.trim()}*` : undefined;

    const details: string[] = [];

    if (fm?.applyTo?.trim()) {
        details.push(`Applies to: \`${fm.applyTo.trim()}\``);
    }

    if (getArtifactType(file.relativePath) === 'instructions') {
        const scopeAssessment = assessInstructionScope(fm?.applyTo);
        details.push(`Scope risk: ${scopeAssessment.level}`);
        details.push(`Scope rationale: ${scopeAssessment.reason}`);
    }

    details.push(`Path: \`${file.relativePath}\``);
    details.push(`Source: ${sourceLabel}`);
    details.push(`Source Path: \`${file.sourcePath}\``);
    details.push(`Layer: ${displayLayerLabel}`);
    details.push(`Realization: ${getClassificationLabel(file.classification)}`);

    if (file.sourceCapabilityName || file.sourceCapabilityId) {
        details.push(`Capability: ${file.sourceCapabilityName ?? file.sourceCapabilityId}`);
        if (file.sourceCapabilityName && file.sourceCapabilityId) {
            details.push(`Capability ID: \`${file.sourceCapabilityId}\``);
        }
        if (file.sourceCapabilityDescription) {
            details.push(`Capability Description: ${file.sourceCapabilityDescription}`);
        }
        if (file.sourceCapabilityLicense) {
            details.push(`Capability License: \`${file.sourceCapabilityLicense}\``);
        }
    }

    return buildMarkdownTooltip(title, details, description);
}

type FileTreeNode = RepoItem | ArtifactTypeItem | FolderItem | FileItem | LoadingFileItem;

class RepoItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string,
        public readonly files: EffectiveFile[],
        summary: ArtifactSummary,
        scopeTooltipLines: string[],
        descriptionBase?: string,
        repoPath?: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'effectiveRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        this.description = formatSummaryDescription(descriptionBase, summary);
        if (repoPath) {
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal Repository in Explorer',
                arguments: [vscode.Uri.file(repoPath)],
            };
        }
        const details = [];
        if (repoPath) {
            details.push(`Repository: \`${repoPath}\``);
        }
        details.push(...getSummaryTooltipLines(summary));
        details.push(...scopeTooltipLines);
        this.tooltip = buildMarkdownTooltip(`**${label}**`, details);
    }
}

class ArtifactTypeItem extends vscode.TreeItem {
    readonly showSourceLabelInFileDescription: boolean;

    constructor(
        public readonly artifactType: ArtifactType,
        public readonly files: EffectiveFile[],
        options?: {
            showSourceLabelInFileDescription?: boolean;
            counts?: ArtifactSummaryCounts;
        },
    ) {
        super(artifactType, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'artifactTypeFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        const active = files.length;
        const available = options?.counts?.available ?? 0;
        this.description =
            available > 0
                ? `${active}/${available} file${available !== 1 ? 's' : ''}`
                : `${active} file${active !== 1 ? 's' : ''}`;
        this.showSourceLabelInFileDescription = options?.showSourceLabelInFileDescription !== false;
    }
}

class FolderItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly files: EffectiveFile[],
        public readonly prefix: string,
        public readonly folderSourcePath?: string,
        public readonly repoId?: string,
        public readonly artifactType?: ArtifactType,
        summary?: ArtifactSummary,
        descriptionBase?: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'effectiveFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        if (summary) {
            this.description = formatSummaryDescription(descriptionBase, summary);
        }
        if (folderSourcePath) {
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal Folder in Explorer',
                arguments: [vscode.Uri.file(folderSourcePath)],
            };
            // tooltip resolved lazily via resolveTreeItem
        }
    }
}

class FileItem extends vscode.TreeItem {
    readonly file: EffectiveFile;
    readonly sourceLabel: string;
    readonly displayLayerLabel: string;

    constructor(
        file: EffectiveFile,
        sourceLabel: string,
        displayLayerLabel: string,
        options?: {
            showSourceLabelInDescription?: boolean;
        },
    ) {
        super(
            path.posix.basename(toPosixPath(file.relativePath)),
            vscode.TreeItemCollapsibleState.None,
        );
        this.file = file;
        this.sourceLabel = sourceLabel;
        this.displayLayerLabel = displayLayerLabel;
        const classificationLabel = getClassificationLabel(file.classification);
        this.description =
            options?.showSourceLabelInDescription === false
                ? `(${classificationLabel})`
                : `${sourceLabel} (${classificationLabel})`;
        this.contextValue = 'effectiveFile';
        this.iconPath =
            file.classification === 'settings'
                ? new vscode.ThemeIcon('symbol-reference')
                : new vscode.ThemeIcon('file');
        this.command = {
            command: 'vscode.open',
            title: 'Open Source File',
            arguments: [vscode.Uri.file(file.sourcePath), { preview: false }],
        };
        // tooltip resolved lazily via resolveTreeItem to include front-matter
    }
}

class LoadingFileItem extends vscode.TreeItem {
    constructor() {
        super('Loading...', vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'loading';
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.description = 'MetaFlow';
    }
}

export class FilesTreeViewProvider implements vscode.TreeDataProvider<FileTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _parentMap = new WeakMap<FileTreeNode, FileTreeNode | undefined>();

    constructor(
        private state: ExtensionState,
        private readonly modeResolver: () => FilesViewMode = () =>
            vscode.workspace
                .getConfiguration('metaflow')
                .get<FilesViewMode>('filesViewMode', 'unified'),
    ) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: FileTreeNode): vscode.TreeItem {
        return element;
    }

    async resolveTreeItem(
        item: vscode.TreeItem,
        element: FileTreeNode,
        token: vscode.CancellationToken,
    ): Promise<vscode.TreeItem> {
        if (element instanceof FileItem) {
            let frontmatterFields: Record<string, string> | undefined;
            try {
                if (!token.isCancellationRequested) {
                    const content = await fs.promises.readFile(element.file.sourcePath, 'utf-8');
                    const parsed = parseFrontmatter(content);
                    frontmatterFields = parsed?.fields;
                }
            } catch {
                // File unreadable – proceed with basic tooltip
            }
            item.tooltip = buildFileItemTooltip(
                element.file,
                element.sourceLabel,
                element.displayLayerLabel,
                frontmatterFields,
            );
        } else if (element instanceof FolderItem && element.folderSourcePath) {
            const roots = this.getSourceRoots();
            const skillManifestPath = path.join(element.folderSourcePath, 'SKILL.md');
            const { summaryLines, scopeLines } = this.getFolderTooltipContext(element);
            const capabilityTooltip = this.getCapabilityFolderTooltipMetadata(element, roots);
            let usedSkillTooltip = false;
            try {
                if (!token.isCancellationRequested) {
                    const content = await fs.promises.readFile(skillManifestPath, 'utf-8');
                    const parsed = parseFrontmatter(content);
                    if (parsed) {
                        const fm = parsed.fields;
                        const title = `**${String(element.label)}**`;
                        const description = fm.description?.trim()
                            ? `*${fm.description.trim()}*`
                            : undefined;
                        const details = [`Path: \`${element.folderSourcePath}\``];
                        if (
                            fm.name?.trim() &&
                            normalizeIdentity(fm.name) !== normalizeIdentity(String(element.label))
                        ) {
                            details.push(`Id: \`${fm.name.trim()}\``);
                        }
                        item.tooltip = buildMarkdownTooltip(
                            title,
                            [...details, ...summaryLines, ...scopeLines],
                            description,
                        );
                        usedSkillTooltip = true;
                    }
                }
            } catch {
                // No SKILL.md or unreadable
            }
            if (usedSkillTooltip) {
                return item;
            }
            if (capabilityTooltip) {
                item.tooltip = buildMarkdownTooltip(
                    capabilityTooltip.title,
                    [...capabilityTooltip.details, ...summaryLines, ...scopeLines],
                    capabilityTooltip.description,
                );
            } else {
                item.tooltip = buildMarkdownTooltip(`**${String(element.label)}**`, [
                    `Folder: \`${element.folderSourcePath}\``,
                    ...summaryLines,
                    ...scopeLines,
                ]);
            }
        }
        return item;
    }

    private trackChildren<T extends FileTreeNode>(
        items: T[],
        parent: FileTreeNode | undefined,
    ): T[] {
        for (const item of items) {
            this._parentMap.set(item, parent);
        }
        return items;
    }

    private getSourceRoots(): SourceRoot[] {
        const config = this.state.config;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const roots: SourceRoot[] = [];

        // Built-in capability source root is independent of config
        if (
            isBuiltInCapabilityActive(this.state.builtInCapability) &&
            this.state.builtInCapability.sourceRoot
        ) {
            const builtInCapabilityName = resolveBuiltInCapabilityDisplayName(
                this.state.capabilityByLayer?.[
                    `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`
                ]?.name,
                this.state.builtInCapability.sourceDisplayName,
            );
            roots.push({
                rootPath: path.normalize(this.state.builtInCapability.sourceRoot),
                label: builtInCapabilityName,
                diskLabel: path.basename(path.normalize(this.state.builtInCapability.sourceRoot)),
                repoId: BUILT_IN_CAPABILITY_REPO_ID,
            });
        }

        if (!config || !workspaceRoot) {
            return roots.sort((a, b) => b.rootPath.length - a.rootPath.length);
        }

        const toAbsolute = (p: string): string => {
            if (path.isAbsolute(p)) {
                return path.normalize(p);
            }
            return path.normalize(path.join(workspaceRoot, p));
        };

        const toFallbackLabel = (p: string): string => {
            const posix = toPosixPath(p);
            const base = posix.split('/').filter(Boolean).pop();
            return base || posix || p;
        };

        if (config.metadataRepo?.localPath) {
            roots.push({
                rootPath: toAbsolute(config.metadataRepo.localPath),
                label:
                    resolveRepoDisplayLabel(
                        'primary',
                        config.metadataRepo.name,
                        config.metadataRepo.localPath,
                        this.state.repoMetadataById?.primary?.name,
                    ) || toFallbackLabel(config.metadataRepo.localPath),
                diskLabel: toFallbackLabel(config.metadataRepo.localPath),
                repoId: 'primary',
            });
        }

        if (config.metadataRepos) {
            for (const repo of config.metadataRepos) {
                if (!repo.localPath) {
                    continue;
                }
                roots.push({
                    rootPath: toAbsolute(repo.localPath),
                    label:
                        resolveRepoDisplayLabel(
                            repo.id,
                            repo.name,
                            repo.localPath,
                            this.state.repoMetadataById?.[repo.id]?.name,
                        ) || toFallbackLabel(repo.localPath),
                    diskLabel: toFallbackLabel(repo.localPath),
                    repoId: repo.id,
                });
            }
        }

        return roots.sort((a, b) => b.rootPath.length - a.rootPath.length);
    }

    private getSourceRoot(file: EffectiveFile, roots: SourceRoot[]): SourceRoot | undefined {
        const normalizedSource = path.normalize(file.sourcePath);
        return roots.find((root) => isPathWithin(normalizedSource, root.rootPath));
    }

    private normalizeLayerId(layerId: string): string {
        const normalized = layerId.replace(/\\/g, '/').replace(/\/+$/, '');
        return normalized === '' ? '.' : normalized;
    }

    private getCapabilityMetadataByLayerId(): Map<string, CapabilityMetadata> {
        const capabilityByLayer = new Map<string, CapabilityMetadata>();

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

    private getRepoIdForFile(file: EffectiveFile, roots: SourceRoot[]): string | undefined {
        const rootRepoId = this.getSourceRoot(file, roots)?.repoId;
        if (rootRepoId) {
            return rootRepoId;
        }

        const sourceRepo = typeof file.sourceRepo === 'string' ? file.sourceRepo.trim() : '';
        if (sourceRepo && !path.isAbsolute(sourceRepo)) {
            return sourceRepo;
        }

        const sourceLayer = typeof file.sourceLayer === 'string' ? file.sourceLayer.trim() : '';
        if (sourceLayer && !path.isAbsolute(sourceLayer)) {
            const [repoId] = sourceLayer.split('/');
            if (repoId) {
                return repoId;
            }
        }

        return undefined;
    }

    private getRepoNodeLabel(
        repoId: string | undefined,
        root: SourceRoot | undefined,
        representative: EffectiveFile,
    ): string {
        if (root?.label) {
            return root.label;
        }

        if (repoId === BUILT_IN_CAPABILITY_REPO_ID) {
            return resolveBuiltInCapabilityDisplayName(
                this.state.capabilityByLayer?.[
                    `${BUILT_IN_CAPABILITY_REPO_ID}/${BUILT_IN_CAPABILITY_LAYER_PATH}`
                ]?.name,
                this.state.builtInCapability.sourceDisplayName,
            );
        }

        const config = this.state.config;
        if (repoId === 'primary' && config?.metadataRepo) {
            return resolveRepoDisplayLabel(
                'primary',
                config.metadataRepo.name,
                config.metadataRepo.localPath,
                this.state.repoMetadataById?.primary?.name,
            );
        }

        const repoConfig = config?.metadataRepos?.find((repo) => repo.id === repoId);
        if (repoConfig) {
            return resolveRepoDisplayLabel(
                repoConfig.id,
                repoConfig.name,
                repoConfig.localPath,
                this.state.repoMetadataById?.[repoConfig.id]?.name,
            );
        }

        return (
            this.getSourceLabel(representative, root ? [root] : []) || representative.sourceLayer
        );
    }

    private buildDescriptionBase(
        label: string,
        values: Array<string | undefined>,
    ): string | undefined {
        const normalizedLabel = normalizeIdentity(label);
        const unique: string[] = [];

        for (const value of values) {
            const trimmed = value?.trim();
            if (!trimmed) {
                continue;
            }

            const normalized = normalizeIdentity(trimmed);
            if (
                normalized === normalizedLabel ||
                unique.some((existing) => normalizeIdentity(existing) === normalized)
            ) {
                continue;
            }

            unique.push(trimmed);
        }

        return unique.length > 0 ? unique.join(', ') : undefined;
    }

    private getSkillFolderMetadata(
        folderSourcePath: string | undefined,
        fallbackSlug: string,
    ): SkillFolderMetadata | undefined {
        if (!folderSourcePath) {
            return undefined;
        }

        const skillManifestPath = path.join(folderSourcePath, 'SKILL.md');
        if (!fs.existsSync(skillManifestPath)) {
            return undefined;
        }

        try {
            const content = fs.readFileSync(skillManifestPath, 'utf-8');
            const parsed = parseFrontmatter(content);
            const explicitSlug = parsed?.fields?.name?.trim();
            const slug = explicitSlug || fallbackSlug;
            const heading = explicitSlug
                ? extractFirstMarkdownHeading(content)
                      ?.replace(/\s+Skill$/i, '')
                      .trim()
                : undefined;
            const displayLabel =
                heading && heading.length > 0
                    ? heading
                    : explicitSlug
                      ? toDisplayTitleFromSlug(slug)
                      : fallbackSlug;

            return {
                slug,
                displayLabel,
            };
        } catch {
            return {
                slug: fallbackSlug,
                displayLabel: toDisplayTitleFromSlug(fallbackSlug),
            };
        }
    }

    private getCapabilityMetadataForPrefix(
        repoId: string | undefined,
        prefix: string,
        files: EffectiveFile[],
    ): CapabilityMetadata | undefined {
        if (!repoId) {
            return undefined;
        }

        const capability = this.getCapabilityMetadataByLayerId().get(
            this.normalizeLayerId(`${repoId}/${prefix}`),
        );
        if (capability) {
            return capability;
        }

        const representative = files[0];
        if (!representative) {
            return undefined;
        }

        const normalizedPrefix = this.normalizeLayerId(`${repoId}/${prefix}`);
        const representativeLayerId = this.normalizeLayerId(representative.sourceLayer || '');
        if (representativeLayerId !== normalizedPrefix) {
            return undefined;
        }

        const allFilesShareLayer = files.every(
            (file) => this.normalizeLayerId(file.sourceLayer || '') === normalizedPrefix,
        );
        if (!allFilesShareLayer) {
            return undefined;
        }

        if (
            representative.sourceCapabilityId ||
            representative.sourceCapabilityName ||
            representative.sourceCapabilityDescription ||
            representative.sourceCapabilityLicense
        ) {
            return {
                id: representative.sourceCapabilityId,
                name: representative.sourceCapabilityName,
                description: representative.sourceCapabilityDescription,
                license: representative.sourceCapabilityLicense,
            };
        }

        return undefined;
    }

    private getSourceLabel(file: EffectiveFile, roots: SourceRoot[]): string {
        return this.getSourceRoot(file, roots)?.label || file.sourceLayer;
    }

    private getFolderTooltipContext(element: FolderItem): {
        summaryLines: string[];
        scopeLines: string[];
    } {
        const summaryLines = element.repoId
            ? getSummaryTooltipLines(
                  summarizeDisplayPrefix(
                      this.state.treeSummaryCache,
                      element.repoId,
                      element.prefix,
                  ),
              )
            : element.artifactType && element.artifactType !== 'other'
              ? getSummaryTooltipLines(
                    summarizeArtifactPrefix(
                        this.state.treeSummaryCache,
                        element.artifactType,
                        element.prefix,
                    ),
                )
              : [];
        const scopeLines = element.repoId
            ? getInstructionScopeTooltipLines(
                  summarizeDisplayInstructionScope(
                      this.state.treeSummaryCache,
                      element.repoId,
                      element.prefix,
                  ),
              )
            : element.artifactType === 'instructions'
              ? getInstructionScopeTooltipLines(
                    summarizeArtifactInstructionScope(this.state.treeSummaryCache, element.prefix),
                )
              : [];

        return { summaryLines, scopeLines };
    }

    private getCapabilityFolderTooltipMetadata(
        element: FolderItem,
        roots: SourceRoot[],
    ): FolderTooltipMetadata | undefined {
        const capability = this.getCapabilityMetadataForPrefix(
            element.repoId,
            element.prefix,
            element.files,
        );
        if (!capability) {
            return undefined;
        }

        const representative = element.files[0];
        if (!representative) {
            return undefined;
        }

        const root = this.getSourceRoot(representative, roots);
        const repoLabel = this.getRepoNodeLabel(element.repoId, root, representative);
        const sourceLabel = this.getSourceLabel(representative, roots);
        const details: string[] = [];

        if (capability.id) {
            details.push(`Capability ID: \`${capability.id}\``);
        }
        if (capability.license) {
            details.push(`License: \`${capability.license}\``);
        }
        if (repoLabel) {
            details.push(`Repository: \`${repoLabel}\``);
        }
        if (representative.sourceLayer) {
            details.push(`Layer: \`${getDisplayLayerLabel(representative, sourceLabel)}\``);
        }
        if (element.folderSourcePath) {
            details.push(`Folder: \`${element.folderSourcePath}\``);
        }

        return {
            title: `**${String(element.label)}**`,
            description: capability.description ? `*${capability.description}*` : undefined,
            details,
        };
    }

    private getRepoIdForFiles(files: EffectiveFile[], roots: SourceRoot[]): string | undefined {
        const representative = files[0];
        if (!representative) {
            return undefined;
        }

        return this.getRepoIdForFile(representative, roots);
    }

    private getChildrenForPrefix(
        files: EffectiveFile[],
        prefix: string,
        roots: SourceRoot[],
        displayPathResolver: (file: EffectiveFile, sourceLabel: string) => string,
        showSourceLabelInDescription = true,
    ): FileTreeNode[] {
        const folderMap = new Map<string, EffectiveFile[]>();
        const leafFiles: FileItem[] = [];

        for (const file of files) {
            const sourceLabel = this.getSourceLabel(file, roots);
            const rel = displayPathResolver(file, sourceLabel);
            if (prefix && !rel.startsWith(prefix + '/')) {
                continue;
            }

            const remainder = prefix ? rel.slice(prefix.length + 1) : rel;
            if (!remainder) {
                continue;
            }

            const [firstSegment, ...rest] = remainder.split('/');
            if (rest.length === 0) {
                const displayLayerLabel = getDisplayLayerLabel(file, sourceLabel);
                leafFiles.push(
                    new FileItem(file, sourceLabel, displayLayerLabel, {
                        showSourceLabelInDescription,
                    }),
                );
            } else {
                const nextPrefix = prefix ? `${prefix}/${firstSegment}` : firstSegment;
                const existing = folderMap.get(nextPrefix) ?? [];
                existing.push(file);
                folderMap.set(nextPrefix, existing);
            }
        }

        const folders = sortByLabel(
            Array.from(folderMap.entries()).map(([nextPrefix, subset]) => {
                const repoId = this.getRepoIdForFiles(subset, roots);
                const capability = this.getCapabilityMetadataForPrefix(repoId, nextPrefix, subset);
                const artifactType = getArtifactType(subset[0]?.relativePath ?? '');
                const folderSourcePath = this.getFolderSourcePath(
                    subset,
                    nextPrefix,
                    roots,
                    displayPathResolver,
                );
                const segmentLabel = path.posix.basename(nextPrefix);
                const skillMetadata =
                    artifactType === 'skills'
                        ? this.getSkillFolderMetadata(folderSourcePath, segmentLabel)
                        : undefined;
                const displayLabel =
                    capability?.name?.trim() || skillMetadata?.displayLabel || segmentLabel;
                const descriptionBase = this.buildDescriptionBase(displayLabel, [
                    capability?.id,
                    skillMetadata?.slug,
                    segmentLabel,
                ]);
                const summary =
                    artifactType !== 'other'
                        ? summarizeArtifactPrefix(
                              this.state.treeSummaryCache,
                              artifactType,
                              nextPrefix,
                          )
                        : undefined;

                return new FolderItem(
                    displayLabel,
                    subset,
                    nextPrefix,
                    folderSourcePath,
                    undefined,
                    artifactType,
                    summary,
                    descriptionBase,
                );
            }),
        );

        return [...folders, ...sortByLabel(leafFiles)];
    }

    private getFolderSourcePath(
        files: EffectiveFile[],
        prefix: string,
        roots: SourceRoot[],
        displayPathResolver: (file: EffectiveFile, sourceLabel: string) => string,
    ): string | undefined {
        if (files.length === 0 || !prefix) {
            return undefined;
        }

        const representative = files[0];
        const sourceLabel = this.getSourceLabel(representative, roots);
        const displayPath = displayPathResolver(representative, sourceLabel);
        if (!displayPath) {
            return undefined;
        }

        const displayParts = displayPath.split('/').filter(Boolean);
        const prefixParts = prefix.split('/').filter(Boolean);
        if (prefixParts.length > displayParts.length) {
            return undefined;
        }

        const isPrefix = prefixParts.every((part, index) => part === displayParts[index]);
        if (!isPrefix) {
            return undefined;
        }

        const stepsUp = displayParts.length - prefixParts.length;
        let sourceFolder = path.normalize(representative.sourcePath);
        for (let i = 0; i < stepsUp; i += 1) {
            sourceFolder = path.dirname(sourceFolder);
        }

        return sourceFolder;
    }

    private getChildrenRepoTree(roots: SourceRoot[]): FileTreeNode[] {
        const files = this.state.effectiveFiles;
        if (files.length === 0) {
            return [];
        }

        const repos = new Map<string, { root?: SourceRoot; files: EffectiveFile[] }>();
        for (const file of files) {
            const sourceRoot = this.getSourceRoot(file, roots);
            const repoKey =
                sourceRoot?.repoId ?? sourceRoot?.rootPath ?? file.sourceRepo ?? file.sourceLayer;
            const existing = repos.get(repoKey) ?? { root: sourceRoot, files: [] };
            if (!existing.root && sourceRoot) {
                existing.root = sourceRoot;
            }
            existing.files.push(file);
            repos.set(repoKey, existing);
        }

        return sortByLabel(
            Array.from(repos.values()).map(({ root, files: repoFiles }) => {
                const repoId =
                    root?.repoId ?? this.getRepoIdForFile(repoFiles[0], roots) ?? 'primary';
                const sourceLabel = this.getRepoNodeLabel(repoId, root, repoFiles[0]);
                const descriptionBase = this.buildDescriptionBase(sourceLabel, [
                    repoId === BUILT_IN_CAPABILITY_REPO_ID ? undefined : repoId,
                    root?.diskLabel,
                ]);
                return new RepoItem(
                    sourceLabel,
                    repoId,
                    repoFiles,
                    summarizeRepo(this.state.treeSummaryCache, repoId),
                    getInstructionScopeTooltipLines(
                        summarizeRepoInstructionScope(this.state.treeSummaryCache, repoId),
                    ),
                    descriptionBase,
                    root?.rootPath,
                );
            }),
        );
    }

    private groupByArtifactType(files: EffectiveFile[], repoId?: string): ArtifactTypeItem[] {
        const typeMap = new Map<ArtifactType, EffectiveFile[]>();
        for (const file of files) {
            const type = getArtifactType(file.relativePath);
            const existing = typeMap.get(type) ?? [];
            existing.push(file);
            typeMap.set(type, existing);
        }
        const repoSummary = repoId ? summarizeRepo(this.state.treeSummaryCache, repoId) : undefined;
        return TYPE_ORDER.filter((type) => typeMap.has(type)).map(
            (type) =>
                new ArtifactTypeItem(type, typeMap.get(type)!, {
                    showSourceLabelInFileDescription: true,
                    counts:
                        repoSummary && type !== 'other'
                            ? repoSummary.byType[type as SummaryArtifactType]
                            : undefined,
                }),
        );
    }

    private getChildrenForType(
        files: EffectiveFile[],
        artifactType: ArtifactType,
        roots: SourceRoot[],
        showSourceLabelInDescription = true,
    ): FileTreeNode[] {
        const typeFiles = files.filter((f) => getArtifactType(f.relativePath) === artifactType);
        return this.getChildrenForPrefix(
            typeFiles,
            '',
            roots,
            (file: EffectiveFile) => getPathAfterArtifactType(file),
            showSourceLabelInDescription,
        );
    }

    /**
     * Builds a tree using the full layer-relative display path (with .github stripped).
     * Folder nodes whose name is a known artifact type are promoted to ArtifactTypeItem;
     * all other intermediate directories become FolderItem.
     */
    private getChildrenForPrefixHierarchical(
        files: EffectiveFile[],
        prefix: string,
        roots: SourceRoot[],
    ): FileTreeNode[] {
        const folderMap = new Map<string, EffectiveFile[]>();
        const typeMap = new Map<ArtifactType, EffectiveFile[]>();
        const leafFiles: FileItem[] = [];

        for (const file of files) {
            const sourceLabel = this.getSourceLabel(file, roots);
            const rel = getDisplayPathForRepoTree(file);
            if (prefix && !rel.startsWith(prefix + '/')) {
                continue;
            }

            const remainder = prefix ? rel.slice(prefix.length + 1) : rel;
            if (!remainder) {
                continue;
            }

            const [firstSegment, ...rest] = remainder.split('/');

            if (KNOWN_TYPES.has(firstSegment)) {
                const type = firstSegment as ArtifactType;
                const existing = typeMap.get(type) ?? [];
                existing.push(file);
                typeMap.set(type, existing);
            } else if (rest.length === 0) {
                const displayLayerLabel = getDisplayLayerLabel(file, sourceLabel);
                leafFiles.push(
                    new FileItem(file, sourceLabel, displayLayerLabel, {
                        showSourceLabelInDescription: false,
                    }),
                );
            } else {
                const nextPrefix = prefix ? `${prefix}/${firstSegment}` : firstSegment;
                const existing = folderMap.get(nextPrefix) ?? [];
                existing.push(file);
                folderMap.set(nextPrefix, existing);
            }
        }

        const folders = sortByLabel(
            Array.from(folderMap.entries()).map(([nextPrefix, subset]) => {
                const repoId = this.getRepoIdForFiles(subset, roots);
                const capability = this.getCapabilityMetadataForPrefix(repoId, nextPrefix, subset);
                const segmentLabel = path.posix.basename(nextPrefix);
                const folderSourcePath = this.getFolderSourcePath(
                    subset,
                    nextPrefix,
                    roots,
                    (file: EffectiveFile) => getDisplayPathForRepoTree(file),
                );
                const skillMetadata = nextPrefix.includes('/skills/')
                    ? this.getSkillFolderMetadata(folderSourcePath, segmentLabel)
                    : undefined;
                const displayLabel =
                    capability?.name?.trim() || skillMetadata?.displayLabel || segmentLabel;
                const descriptionBase = this.buildDescriptionBase(displayLabel, [
                    capability?.id,
                    skillMetadata?.slug,
                    segmentLabel,
                ]);

                return new FolderItem(
                    displayLabel,
                    subset,
                    nextPrefix,
                    folderSourcePath,
                    repoId,
                    undefined,
                    summarizeDisplayPrefix(this.state.treeSummaryCache, repoId, nextPrefix),
                    descriptionBase,
                );
            }),
        );

        const typeRepoId = this.getRepoIdForFiles(files, roots);
        const displayPrefixSummary = typeRepoId
            ? summarizeDisplayPrefix(this.state.treeSummaryCache, typeRepoId, prefix)
            : undefined;
        const typeItems = TYPE_ORDER.filter((type) => typeMap.has(type)).map(
            (type) =>
                new ArtifactTypeItem(type, typeMap.get(type)!, {
                    showSourceLabelInFileDescription: false,
                    counts:
                        displayPrefixSummary && type !== 'other'
                            ? displayPrefixSummary.byType[type as SummaryArtifactType]
                            : undefined,
                }),
        );

        return [...folders, ...typeItems, ...sortByLabel(leafFiles)];
    }

    getChildren(element?: FileTreeNode): FileTreeNode[] {
        if (this.state.isLoading && !this.state.config) {
            return element ? [] : [new LoadingFileItem()];
        }

        const roots = this.getSourceRoots();
        const mode = this.modeResolver();

        if (element instanceof ArtifactTypeItem) {
            return this.trackChildren(
                this.getChildrenForType(
                    element.files,
                    element.artifactType,
                    roots,
                    element.showSourceLabelInFileDescription,
                ),
                element,
            );
        }

        if (element instanceof RepoItem) {
            if (mode === 'repoTree') {
                return this.trackChildren(
                    this.getChildrenForPrefixHierarchical(element.files, '', roots),
                    element,
                );
            }
            return this.trackChildren(
                this.groupByArtifactType(element.files, element.repoId),
                element,
            );
        }

        if (element instanceof FolderItem) {
            if (mode === 'repoTree') {
                return this.trackChildren(
                    this.getChildrenForPrefixHierarchical(element.files, element.prefix, roots),
                    element,
                );
            }
            return this.trackChildren(
                this.getChildrenForPrefix(
                    element.files,
                    element.prefix,
                    roots,
                    (file: EffectiveFile) => getPathAfterArtifactType(file),
                ),
                element,
            );
        }

        if (mode === 'repoTree') {
            return this.trackChildren(this.getChildrenRepoTree(roots), undefined);
        }

        const files = this.state.effectiveFiles;
        if (files.length === 0) {
            return [];
        }

        const rootRepoId = this.getRepoIdForFiles(files, roots);
        return this.trackChildren(this.groupByArtifactType(files, rootRepoId), undefined);
    }

    getParent(element: FileTreeNode): FileTreeNode | undefined {
        return this._parentMap.get(element);
    }
}
