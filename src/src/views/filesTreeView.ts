/**
 * Files TreeView provider.
 *
 * Shows effective files grouped by classification (live-ref / materialized).
 */

import * as vscode from 'vscode';
import { EffectiveFile } from '@metaflow/engine';
import { ExtensionState } from '../commands/commandHandlers';

type FileTreeNode = GroupItem | FileItem;

class GroupItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly files: EffectiveFile[]
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${files.length})`;
        this.contextValue = 'fileGroup';
    }
}

class FileItem extends vscode.TreeItem {
    constructor(file: EffectiveFile) {
        super(file.relativePath, vscode.TreeItemCollapsibleState.None);
        this.description = file.sourceLayer;
        this.contextValue = 'effectiveFile';
        this.iconPath = file.classification === 'live-ref'
            ? new vscode.ThemeIcon('symbol-reference')
            : new vscode.ThemeIcon('file');
        this.tooltip = `Source: ${file.sourcePath}\nLayer: ${file.sourceLayer}\nClassification: ${file.classification}`;
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

    getChildren(element?: FileTreeNode): FileTreeNode[] {
        if (element instanceof GroupItem) {
            return element.files.map(f => new FileItem(f));
        }

        const files = this.state.effectiveFiles;
        if (files.length === 0) {
            return [];
        }

        const liveRef = files.filter(f => f.classification === 'live-ref');
        const materialized = files.filter(f => f.classification === 'materialized');

        const groups: GroupItem[] = [];
        if (liveRef.length > 0) {
            groups.push(new GroupItem('Live-Referenced', liveRef));
        }
        if (materialized.length > 0) {
            groups.push(new GroupItem('Materialized', materialized));
        }
        return groups;
    }
}
