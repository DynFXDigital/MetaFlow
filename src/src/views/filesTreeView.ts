/**
 * Files TreeView provider.
 *
 * Shows effective files grouped by artifact type (instructions, prompts, agents, skills).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { EffectiveFile, getArtifactType, ArtifactType } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';

interface SourceRoot {
    rootPath: string;
    label: string;
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
    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(normalizedParent + path.sep);
};
const sortByLabel = <T extends vscode.TreeItem>(items: T[]): T[] =>
    [...items].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));

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
    return [normalizedLayerPath, artifactPath].filter(Boolean).join('/');
}

/**
 * Returns the path of a file relative to its artifact-type segment.
 * Works for both flat paths (instructions/foo.md → foo.md) and deep
 * hierarchy paths (capabilities/devtools/instructions/foo.md → foo.md).
 */
function getPathAfterArtifactType(file: EffectiveFile): string {
    const displayPath = toDisplayRelativePath(file.relativePath);
    const parts = displayPath.split('/').filter(Boolean);
    const typeIndex = parts.findIndex(p => KNOWN_TYPES.has(p));
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
    return classification === 'settings' ? 'settings' : 'materialized';
}

type FileTreeNode = RepoItem | ArtifactTypeItem | FolderItem | FileItem;

class RepoItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly files: EffectiveFile[],
        repoPath?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'effectiveRepo';
        this.iconPath = new vscode.ThemeIcon('repo');
        if (repoPath) {
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal Repository in Explorer',
                arguments: [vscode.Uri.file(repoPath)],
            };
            this.tooltip = `Repository: ${repoPath}`;
        }
    }
}

class ArtifactTypeItem extends vscode.TreeItem {
    constructor(
        public readonly artifactType: ArtifactType,
        public readonly files: EffectiveFile[]
    ) {
        super(artifactType, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'artifactTypeFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    }
}

class FolderItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly files: EffectiveFile[],
        public readonly prefix: string,
        folderPath?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'effectiveFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        if (folderPath) {
            this.command = {
                command: 'revealInExplorer',
                title: 'Reveal Folder in Explorer',
                arguments: [vscode.Uri.file(folderPath)],
            };
            this.tooltip = `Folder: ${folderPath}`;
        }
    }
}

class FileItem extends vscode.TreeItem {
    constructor(file: EffectiveFile, sourceLabel: string, displayLayerLabel: string) {
        super(path.posix.basename(toPosixPath(file.relativePath)), vscode.TreeItemCollapsibleState.None);
        this.description = `${sourceLabel} (${getClassificationLabel(file.classification)})`;
        this.contextValue = 'effectiveFile';
        this.iconPath = file.classification === 'settings'
            ? new vscode.ThemeIcon('symbol-reference')
            : new vscode.ThemeIcon('file');
        this.command = {
            command: 'vscode.open',
            title: 'Open Source File',
            arguments: [vscode.Uri.file(file.sourcePath), { preview: false }],
        };
        this.tooltip = [
            `Path: ${file.relativePath}`,
            `Source: ${sourceLabel}`,
            `Source Path: ${file.sourcePath}`,
            `Layer: ${displayLayerLabel} (raw: ${file.sourceLayer || ''})`,
            `Realization: ${getClassificationLabel(file.classification)}`,
        ].join('\n');
    }
}

export class FilesTreeViewProvider implements vscode.TreeDataProvider<FileTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private state: ExtensionState,
        private readonly modeResolver: () => FilesViewMode = () =>
            vscode.workspace.getConfiguration('metaflow').get<FilesViewMode>('filesViewMode', 'unified')
    ) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: FileTreeNode): vscode.TreeItem {
        return element;
    }

    private getSourceRoots(): SourceRoot[] {
        const config = this.state.config;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!config || !workspaceRoot) {
            return [];
        }

        const roots: SourceRoot[] = [];

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
                label: config.metadataRepo.name?.trim() || toFallbackLabel(config.metadataRepo.localPath),
            });
        }

        if (config.metadataRepos) {
            for (const repo of config.metadataRepos) {
                if (!repo.localPath) {
                    continue;
                }
                roots.push({
                    rootPath: toAbsolute(repo.localPath),
                    label: repo.name?.trim() || repo.id || toFallbackLabel(repo.localPath),
                });
            }
        }

        return roots.sort((a, b) => b.rootPath.length - a.rootPath.length);
    }

    private getSourceLabel(file: EffectiveFile, roots: SourceRoot[]): string {
        const normalizedSource = path.normalize(file.sourcePath);
        const match = roots.find(root => isPathWithin(normalizedSource, root.rootPath));
        return match?.label || file.sourceLayer;
    }

    private getChildrenForPrefix(
        files: EffectiveFile[],
        prefix: string,
        roots: SourceRoot[],
        displayPathResolver: (file: EffectiveFile, sourceLabel: string) => string
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
                leafFiles.push(new FileItem(file, sourceLabel, displayLayerLabel));
            } else {
                const nextPrefix = prefix ? `${prefix}/${firstSegment}` : firstSegment;
                const existing = folderMap.get(nextPrefix) ?? [];
                existing.push(file);
                folderMap.set(nextPrefix, existing);
            }
        }

        const folders = sortByLabel(
            Array.from(folderMap.entries()).map(([nextPrefix, subset]) =>
                new FolderItem(
                    path.posix.basename(nextPrefix),
                    subset,
                    nextPrefix,
                    this.getFolderSourcePath(subset, nextPrefix, roots, displayPathResolver)
                )
            )
        );

        return [...folders, ...sortByLabel(leafFiles)];
    }

    private getFolderSourcePath(
        files: EffectiveFile[],
        prefix: string,
        roots: SourceRoot[],
        displayPathResolver: (file: EffectiveFile, sourceLabel: string) => string
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

        const repos = new Map<string, EffectiveFile[]>();
        for (const file of files) {
            const sourceLabel = this.getSourceLabel(file, roots);
            const existing = repos.get(sourceLabel) ?? [];
            existing.push(file);
            repos.set(sourceLabel, existing);
        }

        return sortByLabel(
            Array.from(repos.entries()).map(([sourceLabel, repoFiles]) => {
                const repoRoot = roots.find(root => root.label === sourceLabel)?.rootPath;
                return new RepoItem(sourceLabel, repoFiles, repoRoot);
            })
        );
    }

    private groupByArtifactType(files: EffectiveFile[]): ArtifactTypeItem[] {
        const typeMap = new Map<ArtifactType, EffectiveFile[]>();
        for (const file of files) {
            const type = getArtifactType(file.relativePath);
            const existing = typeMap.get(type) ?? [];
            existing.push(file);
            typeMap.set(type, existing);
        }
        return TYPE_ORDER
            .filter(type => typeMap.has(type))
            .map(type => new ArtifactTypeItem(type, typeMap.get(type)!));
    }

    private getChildrenForType(
        files: EffectiveFile[],
        artifactType: ArtifactType,
        roots: SourceRoot[]
    ): FileTreeNode[] {
        const typeFiles = files.filter(f => getArtifactType(f.relativePath) === artifactType);
        return this.getChildrenForPrefix(
            typeFiles,
            '',
            roots,
            (file: EffectiveFile) => getPathAfterArtifactType(file)
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
        roots: SourceRoot[]
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
                leafFiles.push(new FileItem(file, sourceLabel, displayLayerLabel));
            } else {
                const nextPrefix = prefix ? `${prefix}/${firstSegment}` : firstSegment;
                const existing = folderMap.get(nextPrefix) ?? [];
                existing.push(file);
                folderMap.set(nextPrefix, existing);
            }
        }

        const folders = sortByLabel(
            Array.from(folderMap.entries()).map(([nextPrefix, subset]) =>
                new FolderItem(path.posix.basename(nextPrefix), subset, nextPrefix)
            )
        );

        const typeItems = TYPE_ORDER
            .filter(type => typeMap.has(type))
            .map(type => new ArtifactTypeItem(type, typeMap.get(type)!));

        return [...folders, ...typeItems, ...sortByLabel(leafFiles)];
    }

    getChildren(element?: FileTreeNode): FileTreeNode[] {
        const roots = this.getSourceRoots();
        const mode = this.modeResolver();

        if (element instanceof ArtifactTypeItem) {
            return this.getChildrenForType(element.files, element.artifactType, roots);
        }

        if (element instanceof RepoItem) {
            // repoTree mode: full directory hierarchy with .github stripped
            // and artifact-type nodes promoted at whatever depth they appear.
            if (mode === 'repoTree') {
                return this.getChildrenForPrefixHierarchical(element.files, '', roots);
            }
            return this.groupByArtifactType(element.files);
        }

        if (element instanceof FolderItem) {
            if (mode === 'repoTree') {
                return this.getChildrenForPrefixHierarchical(element.files, element.prefix, roots);
            }
            return this.getChildrenForPrefix(
                element.files,
                element.prefix,
                roots,
                (file: EffectiveFile) => getPathAfterArtifactType(file)
            );
        }

        if (mode === 'repoTree') {
            return this.getChildrenRepoTree(roots);
        }

        const files = this.state.effectiveFiles;
        if (files.length === 0) {
            return [];
        }

        return this.groupByArtifactType(files);
    }
}
