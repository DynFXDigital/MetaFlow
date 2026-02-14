/**
 * Files TreeView provider.
 *
 * Shows effective files in a unified hierarchical tree.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { EffectiveFile } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';

interface SourceRoot {
    rootPath: string;
    label: string;
}

const toPosixPath = (value: string): string => value.replace(/\\/g, '/');
const isPathWithin = (targetPath: string, parentPath: string): boolean => {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedParent = path.normalize(parentPath);
    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(normalizedParent + path.sep);
};
const sortByLabel = <T extends vscode.TreeItem>(items: T[]): T[] =>
    [...items].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));

function getClassificationLabel(classification: EffectiveFile['classification']): string {
    return classification === 'settings' ? 'settings' : 'materialized';
}

type FileTreeNode = FolderItem | FileItem;

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
    constructor(file: EffectiveFile, sourceLabel: string) {
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
            `Layer: ${file.sourceLayer}`,
            `Realization: ${getClassificationLabel(file.classification)}`,
        ].join('\n');
    }
}

export class FilesTreeViewProvider implements vscode.TreeDataProvider<FileTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: ExtensionState) {
        state.onDidChange.event(() => this._onDidChangeTreeData.fire(undefined));
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
        roots: SourceRoot[]
    ): FileTreeNode[] {
        const folderMap = new Map<string, EffectiveFile[]>();
        const leafFiles: FileItem[] = [];

        for (const file of files) {
            const rel = toPosixPath(file.relativePath);
            if (prefix && !rel.startsWith(prefix + '/')) {
                continue;
            }

            const remainder = prefix ? rel.slice(prefix.length + 1) : rel;
            if (!remainder) {
                continue;
            }

            const [firstSegment, ...rest] = remainder.split('/');
            if (rest.length === 0) {
                leafFiles.push(new FileItem(file, this.getSourceLabel(file, roots)));
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
                    this.getFolderSourcePath(subset, nextPrefix)
                )
            )
        );

        return [...folders, ...sortByLabel(leafFiles)];
    }

    private getFolderSourcePath(files: EffectiveFile[], prefix: string): string | undefined {
        if (files.length === 0 || !prefix) {
            return undefined;
        }

        const representative = files[0];
        const relativeParts = toPosixPath(representative.relativePath).split('/').filter(Boolean);
        if (relativeParts.length === 0) {
            return undefined;
        }

        // Remove all artifact-relative segments to get the layer base path.
        let basePath = path.normalize(representative.sourcePath);
        for (let i = 0; i < relativeParts.length; i += 1) {
            basePath = path.dirname(basePath);
        }

        const folderParts = prefix.split('/').filter(Boolean);
        return path.join(basePath, ...folderParts);
    }

    getChildren(element?: FileTreeNode): FileTreeNode[] {
        const roots = this.getSourceRoots();

        if (element instanceof FolderItem) {
            return this.getChildrenForPrefix(element.files, element.prefix, roots);
        }

        const files = this.state.effectiveFiles;
        if (files.length === 0) {
            return [];
        }

        return this.getChildrenForPrefix(files, '', roots);
    }
}
