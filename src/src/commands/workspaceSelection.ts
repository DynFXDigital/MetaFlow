export interface WorkspaceFolderLike {
    uri: { fsPath: string };
}

export function pickWorkspaceFolder<T extends WorkspaceFolderLike>(
    folders: readonly T[],
    activeFolder: T | undefined,
    hasConfigFile: (folder: T) => boolean
): T | undefined {
    if (folders.length === 0) {
        return undefined;
    }

    const foldersWithConfig = folders.filter(folder => hasConfigFile(folder));

    if (foldersWithConfig.length === 1) {
        return foldersWithConfig[0];
    }

    if (activeFolder && foldersWithConfig.length > 1) {
        const activeHasConfig = foldersWithConfig.some(
            folder => folder.uri.fsPath === activeFolder.uri.fsPath
        );
        if (activeHasConfig) {
            return activeFolder;
        }
    }

    if (foldersWithConfig.length > 1) {
        return foldersWithConfig[0];
    }

    if (activeFolder) {
        return activeFolder;
    }

    return folders[0];
}