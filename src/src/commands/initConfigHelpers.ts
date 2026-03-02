import * as path from 'path';

export function toPosixPath(value: string): string {
    return value.replace(/\\/g, '/');
}

export function layerSort(a: string, b: string): number {
    const depthA = a === '.' ? 0 : a.split('/').length;
    const depthB = b === '.' ? 0 : b.split('/').length;
    if (depthA !== depthB) {
        return depthA - depthB;
    }
    return a.localeCompare(b);
}

export function sanitizeRepoName(url: string): string {
    const trimmed = url.trim().replace(/\/$/, '');
    const parts = trimmed.split('/').filter(Boolean);
    const base = parts.length > 0 ? parts[parts.length - 1] : 'metadata';
    const noGit = base.replace(/\.git$/i, '');
    const slug = noGit
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'metadata';
}

export function toConfigLocalPath(workspaceRoot: string, targetFsPath: string): string {
    const relative = toPosixPath(path.relative(workspaceRoot, targetFsPath));
    if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) {
        return relative;
    }
    return targetFsPath;
}

export function buildConfig(localPath: string, layers: string[], metadataUrl?: string): Record<string, unknown> {
    return {
        metadataRepo: {
            localPath,
            ...(metadataUrl ? { url: metadataUrl } : {}),
        },
        layers,
        filters: { include: [], exclude: [] },
        profiles: {
            default: {
                enable: ['**/*'],
                disable: [],
            },
        },
        activeProfile: 'default',
        injection: {
            instructions: 'settings',
            prompts: 'settings',
            skills: 'settings',
            agents: 'settings',
            hooks: 'settings',
        },
    };
}

export function shouldEnableBundledMetadataOnFirstInit(
    configExistedBeforeInit: boolean,
    workspaceBundledSettingValue: boolean | undefined
): boolean {
    return configExistedBeforeInit === false && workspaceBundledSettingValue === undefined;
}
