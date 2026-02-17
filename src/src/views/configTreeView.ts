/**
 * Config TreeView provider.
 *
 * Displays config summary: repo URL, commit, injection modes.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionState } from '../commands/commandHandlers';

const INJECTION_KEYS = ['instructions', 'prompts', 'skills', 'agents', 'hooks'] as const;
type InjectionKey = typeof INJECTION_KEYS[number];

const DEFAULT_INJECTION_MODE: Record<InjectionKey, 'settings' | 'materialize'> = {
    instructions: 'settings',
    prompts: 'settings',
    skills: 'settings',
    agents: 'settings',
    hooks: 'settings',
};

class ConfigItem extends vscode.TreeItem {
    constructor(label: string, description: string, contextValue?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = contextValue;
    }
}

class SectionItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly sectionId: 'repositories' | 'injection'
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = sectionId === 'repositories' ? 'configRepoSection' : 'configInjectionSection';
        this.iconPath = sectionId === 'repositories'
            ? new vscode.ThemeIcon('repo')
            : new vscode.ThemeIcon('settings-gear');
    }
}

class RepoSourceItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly repoId: string | undefined,
        enabled: boolean,
        description: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = repoId ? 'configRepoSource' : 'configRepoSourceReadonly';
        this.description = description;
        this.iconPath = enabled
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
        if (repoId) {
            this.command = {
                command: 'metaflow.toggleRepoSource',
                title: 'Toggle Repo Source',
                arguments: [repoId],
            };
        }
    }
}

class InjectionModeItem extends vscode.TreeItem {
    constructor(
        public readonly injectionKey: InjectionKey,
        mode: 'settings' | 'materialize',
        isDefault: boolean
    ) {
        const label = injectionKey.charAt(0).toUpperCase() + injectionKey.slice(1);
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'injectionMode';
        this.description = isDefault ? `${mode} (default)` : mode;
        this.iconPath = new vscode.ThemeIcon('settings-gear');
        this.command = {
            command: 'metaflow.toggleInjectionMode',
            title: 'Toggle Injection Mode',
            arguments: [injectionKey],
        };
    }
}

type ConfigTreeItem = ConfigItem | SectionItem | RepoSourceItem | InjectionModeItem;

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
            if (element.sectionId === 'repositories') {
                if (config.metadataRepos) {
                    return config.metadataRepos.map(repo =>
                        new RepoSourceItem(
                            repo.name?.trim() || repo.id,
                            repo.id,
                            repo.enabled !== false,
                            this.toDisplayPath(repo.localPath)
                        )
                    );
                }

                if (config.metadataRepo) {
                    return [
                        new RepoSourceItem(
                            'primary',
                            undefined,
                            true,
                            this.toDisplayPath(config.metadataRepo.localPath)
                        ),
                    ];
                }

                return [];
            }

            return INJECTION_KEYS.map(key => {
                const mode = config.injection?.[key] ?? DEFAULT_INJECTION_MODE[key];
                const isDefault = config.injection?.[key] === undefined;
                return new InjectionModeItem(key, mode, isDefault);
            });
        }

        if (element) {
            return [];
        }

        const items: ConfigTreeItem[] = [];

        if (this.state.configPath) {
            items.push(new ConfigItem('Config', this.toDisplayPath(this.state.configPath), 'configPath'));
        }

        items.push(new SectionItem('Repositories', 'repositories'));
        items.push(new SectionItem('Injection Mode', 'injection'));

        return items;
    }
}
