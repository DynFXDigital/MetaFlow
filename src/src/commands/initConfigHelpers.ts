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

export function buildConfig(
    localPath: string,
    layers: string[],
    metadataUrl?: string,
): Record<string, unknown> {
    return {
        metadataRepos: [
            {
                id: 'primary',
                name: 'primary',
                localPath,
                ...(metadataUrl ? { url: metadataUrl } : {}),
                enabled: true,
                capabilities: layers.map((layerPath) => ({
                    path: layerPath,
                    enabled: false,
                })),
            },
        ],
        filters: { include: [], exclude: [] },
        profiles: {
            default: {
                displayName: 'Default',
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

export type MetaflowGitIgnoreMode = 'none' | 'stateFile' | 'directory' | 'both';

const METAFLOW_GITIGNORE_COMMENT_LINES = [
    '# MetaFlow managed state (choose one rule):',
    '# Track .metaflow/config.jsonc; ignore .metaflow/state.json, or ignore .metaflow/ for local-only setup.',
];

function isMetaflowDirectoryIgnoreEntry(line: string): boolean {
    return /^\/?\.metaflow\/?$/.test(line);
}

function isMetaflowStateIgnoreEntry(line: string): boolean {
    return /^\/?\.metaflow\/state\.json$/.test(line);
}

export function detectMetaflowGitIgnoreMode(content: string): MetaflowGitIgnoreMode {
    let hasDirectoryEntry = false;
    let hasStateFileEntry = false;

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        if (isMetaflowDirectoryIgnoreEntry(line)) {
            hasDirectoryEntry = true;
            continue;
        }

        if (isMetaflowStateIgnoreEntry(line)) {
            hasStateFileEntry = true;
        }
    }

    if (hasDirectoryEntry && hasStateFileEntry) {
        return 'both';
    }
    if (hasDirectoryEntry) {
        return 'directory';
    }
    if (hasStateFileEntry) {
        return 'stateFile';
    }
    return 'none';
}

export function ensureMetaflowGitIgnoreEntry(
    content: string,
    mode: 'stateFile' | 'directory',
): string {
    const currentMode = detectMetaflowGitIgnoreMode(content);
    if (mode === 'directory' && (currentMode === 'directory' || currentMode === 'both')) {
        return content;
    }
    if (mode === 'stateFile' && (currentMode === 'stateFile' || currentMode === 'both')) {
        return content;
    }

    const entry = mode === 'directory' ? '.metaflow/' : '.metaflow/state.json';
    const commentHeaderPresent = content.includes(METAFLOW_GITIGNORE_COMMENT_LINES[0]);
    const commentBlock = commentHeaderPresent
        ? ''
        : `${METAFLOW_GITIGNORE_COMMENT_LINES.join('\n')}\n`;
    if (!content) {
        return `${commentBlock}${entry}\n`;
    }

    const trailingNewline = content.endsWith('\n') ? '' : '\n';
    return `${content}${trailingNewline}${commentBlock}${entry}\n`;
}
