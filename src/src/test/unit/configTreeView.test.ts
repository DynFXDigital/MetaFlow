/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS require needed for Mocha proxyquire module rewiring */

import * as assert from 'assert';

class MockTreeItem {
    label: unknown;
    collapsibleState: number;
    contextValue?: string;
    iconPath?: unknown;
    description?: string | boolean;
    checkboxState?: number;
    tooltip?: unknown;
    accessibilityInformation?: { label: string; role: string };

    constructor(label: unknown, collapsibleState: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

class MockEventEmitter {
    event(listener: (v: unknown) => void): { dispose: () => void } {
        void listener;
        return { dispose: () => {} };
    }
    fire(v: unknown): void {
        void v;
    }
}

class MockThemeIcon {
    constructor(public id: string) {}
}

class MockMarkdownString {
    constructor(public value: string) {}

    toString(): string {
        return this.value;
    }
}

const mockVscode = {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: MockEventEmitter,
    ThemeIcon: MockThemeIcon,
    MarkdownString: MockMarkdownString,
    TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    },
};

type MockConfigTreeItem = {
    label?: unknown;
    contextValue?: string;
    tooltip?: unknown;
    description?: string | boolean;
    iconPath?: unknown;
    accessibilityInformation?: { label: string; role: string };
    section?: 'repositories' | 'warnings';
    repoId?: string;
};

type ConfigTreeViewModule = {
    ConfigTreeViewProvider: new (state: {
        isLoading?: boolean;
        config?: unknown;
        capabilityWarnings: string[];
        repoSyncByRepoId: Record<string, unknown>;
        repoMetadataById?: Record<string, { name?: string; description?: string }>;
        capabilityByLayer?: Record<string, { name?: string }>;
        builtInCapability: {
            enabled: boolean;
            layerEnabled: boolean;
            synchronizedFiles: string[];
            sourceRoot?: string;
            sourceId: string;
            sourceDisplayName: string;
        };
        onDidChange: { event: (_l: unknown) => { dispose: () => void } };
    }) => {
        getChildren(element?: MockConfigTreeItem): MockConfigTreeItem[];
        getTreeItem(element: MockConfigTreeItem): MockConfigTreeItem;
    };
};

function loadConfigTreeView(): ConfigTreeViewModule {
    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;
    moduleInternals._load = function patchedLoad(
        request: string,
        parent: NodeModule | null,
        isMain: boolean,
    ): unknown {
        if (request === 'vscode') {
            return mockVscode;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../views/configTreeView');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as ConfigTreeViewModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function makeState(
    overrides?: Partial<{
        isLoading: boolean;
        config: unknown;
        capabilityWarnings: string[];
        repoSyncByRepoId: Record<string, unknown>;
        repoMetadataById: Record<string, { name?: string; description?: string }>;
        capabilityByLayer: Record<string, { name?: string }>;
        builtInCapability: {
            enabled: boolean;
            layerEnabled: boolean;
            synchronizedFiles: string[];
            sourceRoot?: string;
            sourceId: string;
            sourceDisplayName: string;
        };
    }>,
) {
    const event = (listener: unknown): { dispose: () => void } => {
        void listener;
        return { dispose: () => {} };
    };

    return {
        isLoading: false,
        config: undefined,
        capabilityWarnings: [],
        repoSyncByRepoId: {},
        repoMetadataById: {},
        capabilityByLayer: {},
        builtInCapability: {
            enabled: false,
            layerEnabled: true,
            synchronizedFiles: [],
            sourceRoot: undefined,
            sourceId: 'dynfxdigital.metaflow',
            sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
        },
        onDidChange: { event },
        ...overrides,
    };
}

function extractTooltipText(tooltip: unknown): string {
    if (typeof tooltip === 'string') {
        return tooltip;
    }
    if (tooltip instanceof MockMarkdownString) {
        return tooltip.value;
    }
    if (tooltip && typeof tooltip === 'object' && 'value' in tooltip) {
        return String((tooltip as { value: string }).value);
    }
    return String(tooltip ?? '');
}

function extractThemeIconId(value: unknown): string | undefined {
    if (value instanceof MockThemeIcon) {
        return value.id;
    }
    if (value && typeof value === 'object' && 'id' in value) {
        return String((value as { id: string }).id);
    }
    return undefined;
}

function joinTooltip(title: string, details: string[], description?: string): string {
    const header = description ? `${title}  \n${description}` : title;
    return details.length ? `${header}\n\n${details.join('  \n')}` : header;
}

suite('ConfigTreeView', () => {
    test('CTV-01: multi-repo label and tooltip use METAFLOW.md metadata when available', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'primary',
                            localPath: '/workspace/.ai/team-metadata',
                            url: 'https://github.com/example/team-metadata',
                        },
                    ],
                },
                repoMetadataById: {
                    primary: {
                        name: 'Team Metadata',
                        description:
                            'Shared Copilot Pack providing reusable AI coding agent capabilities.',
                    },
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(String(repoItem.label), 'Team Metadata');
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            joinTooltip(
                '**Team Metadata**',
                [
                    'Status: enabled',
                    'Local path: `.ai/team-metadata`',
                    'Remote URL: `https://github.com/example/team-metadata`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                ],
                '*Shared Copilot Pack providing reusable AI coding agent capabilities.*',
            ),
        );
    });

    test('CTV-02: single-repo label falls back to folder name instead of primary', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepo: { localPath: '/workspace/.ai/team-metadata' },
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(String(repoItem.label), 'team-metadata');
    });

    test('CTV-03: built-in repo uses repo manifest name and description in tooltip', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [{ id: 'primary', localPath: '/workspace/.ai/team-metadata' }],
                },
                repoMetadataById: {
                    __metaflow_builtin__: {
                        name: 'MetaFlow',
                        description:
                            'Bundled MetaFlow metadata repository containing instructions, prompts, agents, and skills.',
                    },
                },
                builtInCapability: {
                    enabled: true,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const repoItems = provider.getChildren(section);
        const builtInItem = repoItems.find(
            (item) => item.contextValue === 'configRepoSourceBuiltin',
        );

        assert.ok(builtInItem, 'expected built-in repo item');
        assert.strictEqual(String(builtInItem?.label), 'MetaFlow');
        assert.strictEqual(
            extractTooltipText(builtInItem?.tooltip),
            joinTooltip(
                '**MetaFlow**',
                [
                    'Status: enabled',
                    'Source: bundled with the MetaFlow extension',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                ],
                '*Bundled MetaFlow metadata repository containing instructions, prompts, agents, and skills.*',
            ),
        );
    });

    test('CTV-04: initial load shows a loading node until config arrives', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                isLoading: true,
            }),
        );

        const [loadingItem] = provider.getChildren();

        assert.strictEqual(String(loadingItem.label), 'Loading...');
        assert.strictEqual(loadingItem.contextValue, 'loading');
        assert.deepStrictEqual(provider.getChildren(loadingItem), []);
    });

    test('CTV-05: root stays empty when no config is available after loading', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(makeState());

        assert.deepStrictEqual(provider.getChildren(), []);
    });

    test('CTV-06: built-in-only config exposes the bundled repo as the sole repository leaf', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                builtInCapability: {
                    enabled: false,
                    layerEnabled: false,
                    synchronizedFiles: ['.github/instructions/example.instructions.md'],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const rootItems = provider.getChildren();
        const [section] = rootItems;
        const [builtInItem] = provider.getChildren(section);

        assert.deepStrictEqual(
            rootItems.map((item) => String(item.label)),
            ['Repositories'],
        );
        assert.strictEqual(section.section, 'repositories');
        assert.strictEqual(String(builtInItem.label), 'MetaFlow: AI Metadata Overlay');
        assert.strictEqual(builtInItem.contextValue, 'configRepoSourceBuiltin');
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, disabled)');
        assert.deepStrictEqual(provider.getChildren(builtInItem), []);
    });

    test('CTV-07: warnings section appears with warning leaves alongside repositories', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                capabilityWarnings: ['Missing METAFLOW.md', 'Repo path is not accessible'],
            }),
        );

        const rootItems = provider.getChildren();
        const repositoriesSection = rootItems[0];
        const warningsSection = rootItems[1];
        const warningItems = provider.getChildren(warningsSection);

        assert.deepStrictEqual(
            rootItems.map((item) => String(item.label)),
            ['Repositories', 'Warnings (2)'],
        );
        assert.strictEqual(repositoriesSection.section, 'repositories');
        assert.strictEqual(warningsSection.section, 'warnings');
        assert.deepStrictEqual(provider.getChildren(repositoriesSection), []);
        assert.deepStrictEqual(
            warningItems.map((item) => ({
                label: String(item.label),
                contextValue: item.contextValue,
                tooltip: extractTooltipText(item.tooltip),
            })),
            [
                {
                    label: 'Missing METAFLOW.md',
                    contextValue: 'configWarning',
                    tooltip: 'Missing METAFLOW.md',
                },
                {
                    label: 'Repo path is not accessible',
                    contextValue: 'configWarning',
                    tooltip: 'Repo path is not accessible',
                },
            ],
        );
    });

    test('CTV-08: repo label falls back to repo id when name and path are empty', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'fallback-repo',
                            name: '   ',
                            localPath: '',
                        },
                    ],
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(String(repoItem.label), 'fallback-repo');
    });

    test('CTV-09: workspace-root paths render as dot and local repos stay rescannable', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'local-repo',
                            localPath: '/workspace',
                            url: 'origin',
                            enabled: false,
                        },
                    ],
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(repoItem.contextValue, 'configRepoSourceRescannable');
        assert.strictEqual(repoItem.description, '. (0/0)');
        assert.strictEqual(extractThemeIconId(repoItem.iconPath), 'folder');
        assert.strictEqual(extractTooltipText(repoItem.tooltip), '**workspace**\n\nStatus: disabled  \nLocal path: `.`  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active');
        assert.strictEqual(provider.getChildren(repoItem).length, 0);
        assert.strictEqual(provider.getTreeItem(repoItem), repoItem);
    });

    test('CTV-10: remote repos show behind sync details in description, icon, and tooltip', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'primary',
                            localPath: '/workspace/team',
                            url: 'https://github.com/example/team.git',
                        },
                    ],
                },
                repoSyncByRepoId: {
                    primary: {
                        state: 'behind',
                        behindCount: 2,
                        aheadCount: 1,
                        trackingRef: 'origin/main',
                        lastCheckedAt: '2026-03-13T00:00:00.000Z',
                        error: 'fetch failed',
                    },
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(repoItem.contextValue, 'configRepoSourceGitBehind');
        assert.strictEqual(repoItem.description, 'team [git] (0/0, 2 updates)');
        assert.strictEqual(extractThemeIconId(repoItem.iconPath), 'arrow-down');
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            '**team**\n\nStatus: enabled  \nLocal path: `team`  \nRemote URL: `https://github.com/example/team.git`  \nSync status: Updates available upstream  \nTracking branch: `origin/main`  \nAhead/Behind: 1/2  \nLast checked: 2026-03-13T00:00:00.000Z  \nError: fetch failed  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active',
        );
        assert.deepStrictEqual(repoItem.accessibilityInformation, {
            label: 'team enabled',
            role: 'checkbox',
        });
    });

    test('CTV-11: sync state rendering covers up-to-date, ahead, diverged, and unknown remotes', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'upToDate',
                            localPath: '/workspace/up-to-date',
                            url: 'https://example.com/up-to-date.git',
                        },
                        {
                            id: 'ahead',
                            localPath: '/workspace/ahead',
                            url: 'https://example.com/ahead.git',
                        },
                        {
                            id: 'diverged',
                            localPath: '/workspace/diverged',
                            url: 'https://example.com/diverged.git',
                        },
                        {
                            id: 'unknown',
                            localPath: '/workspace/unknown',
                            url: 'https://example.com/unknown.git',
                        },
                    ],
                },
                repoSyncByRepoId: {
                    upToDate: { state: 'upToDate', lastCheckedAt: 'now' },
                    ahead: { state: 'ahead', aheadCount: 3, lastCheckedAt: 'now' },
                    diverged: { state: 'diverged', lastCheckedAt: 'now' },
                    unknown: { state: 'unknown', lastCheckedAt: 'now' },
                },
            }),
        );

        const [section] = provider.getChildren();
        const repoItems = provider.getChildren(section);

        assert.deepStrictEqual(
            repoItems.map((item) => ({
                label: String(item.label),
                contextValue: item.contextValue,
                description: item.description,
                icon: extractThemeIconId(item.iconPath),
            })),
            [
                {
                    label: 'up-to-date',
                    contextValue: 'configRepoSourceGit',
                    description: 'up-to-date [git] (0/0, up to date)',
                    icon: 'cloud',
                },
                {
                    label: 'ahead',
                    contextValue: 'configRepoSourceGit',
                    description: 'ahead [git] (0/0, 3 ahead)',
                    icon: 'arrow-up',
                },
                {
                    label: 'diverged',
                    contextValue: 'configRepoSourceGit',
                    description: 'diverged [git] (0/0, diverged)',
                    icon: 'warning',
                },
                {
                    label: 'unknown',
                    contextValue: 'configRepoSourceGit',
                    description: 'unknown [git] (0/0, status unknown)',
                    icon: 'question',
                },
            ],
        );
    });

    test('CTV-12: built-in repo falls back to capability manifest name when repo metadata is absent', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                capabilityByLayer: {
                    '__metaflow_builtin__/.github': {
                        name: ' Bundled Capability ',
                    },
                },
                builtInCapability: {
                    enabled: true,
                    layerEnabled: false,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(String(builtInItem.label), 'Bundled Capability');
        assert.strictEqual(builtInItem.contextValue, 'configRepoSourceBuiltin');
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, disabled)');
        assert.strictEqual(extractThemeIconId(builtInItem.iconPath), 'package');
    });

    test('CTV-13: provider preserves outside-workspace paths and prefers manifest names over repeated repo ids', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'primary',
                            name: 'primary',
                            localPath: '/external/team-metadata',
                        },
                    ],
                },
                repoMetadataById: {
                    primary: {
                        name: 'Shared Metadata',
                    },
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(String(repoItem.label), 'Shared Metadata');
        assert.strictEqual(repoItem.description, '/external/team-metadata (0/0)');
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            '**Shared Metadata**\n\nStatus: enabled  \nLocal path: `/external/team-metadata`  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active',
        );
    });
});
