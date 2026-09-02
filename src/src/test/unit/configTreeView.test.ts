import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { TreeSummaryCache } from '../../treeSummary';

class MockTreeItem {
    label: unknown;
    collapsibleState: number;
    contextValue?: string;
    iconPath?: unknown;
    description?: string | boolean;
    checkboxState?: number;
    tooltip?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };
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
    checkboxState?: number;
    iconPath?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };
    accessibilityInformation?: { label: string; role: string };
    section?: 'repositories' | 'warnings';
    repoId?: string;
    warningMessage?: string;
    sourcePath?: string;
};

type ConfigTreeViewModule = {
    ConfigTreeViewProvider: new (state: {
        isLoading?: boolean;
        config?: unknown;
        capabilityWarnings: string[];
        configWarnings: string[];
        localGitRepoIds?: Set<string>;
        repoSyncByRepoId: Record<string, unknown>;
        repoMetadataById?: Record<string, { name?: string; description?: string }>;
        capabilityByLayer?: Record<string, { name?: string }>;
        builtInCapability: {
            enabled: boolean;
            layerEnabled: boolean;
            disabledByUser?: boolean;
            synchronizedFiles: string[];
            sourceRoot?: string;
            sourceId: string;
            sourceDisplayName: string;
        };
        onDidChange: { event: (_l: unknown) => { dispose: () => void } };
    }, diagnosticCollection?: {
        forEach: (
            callback: (
                uri: { fsPath: string },
                diagnostics: Array<{
                    message: string;
                    severity: number;
                    range: { start: { line: number; character: number } };
                    source?: string;
                    code?: string | number;
                }>,
            ) => void,
        ) => void;
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

function makeEmptyTreeSummaryCache(): TreeSummaryCache {
    const emptySummary = {
        totalActive: 0,
        totalAvailable: 0,
        byType: {
            instructions: { active: 0, available: 0 },
            prompts: { active: 0, available: 0 },
            commands: { active: 0, available: 0 },
            agents: { active: 0, available: 0 },
            skills: { active: 0, available: 0 },
            hooks: { active: 0, available: 0 },
        },
    };
    const emptyInstructionScopeSummary = {
        inspectedCount: 0,
        activeCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        unknownCount: 0,
        missingApplyToCount: 0,
        activeHighRiskCount: 0,
        topRisks: [],
        status: 'none' as const,
    };

    return {
        availableRecords: [],
        currentActiveRecords: [],
        baseActiveRecords: [],
        instructionScopeRecords: [],
        currentInstructionScopeSummary: emptyInstructionScopeSummary,
        profileInstructionScopeSummaries: {},
        profileSummaries: {},
        currentSummary: emptySummary,
        availableSummary: emptySummary,
    };
}

function makeState(
    overrides?: Partial<{
        isLoading: boolean;
        config: unknown;
        capabilityWarnings: string[];
        configWarnings: string[];
        localGitRepoIds: Set<string>;
        repoSyncByRepoId: Record<string, unknown>;
        repoMetadataById: Record<string, { name?: string; description?: string }>;
        capabilityByLayer: Record<string, { name?: string }>;
        treeSummaryCache: ReturnType<typeof makeEmptyTreeSummaryCache> | undefined;
        governanceContractErrors: Array<{ message: string; code?: string | number }>;
        governanceContract: {
            requiredCapabilities?: Array<{ repoId: string; path: string }>;
            defaultOnCapabilities?: Array<{ repoId: string; path: string }>;
            severity?: 'warn' | 'error';
        };
        governanceCompliance: {
            status: 'not-applicable' | 'compliant' | 'non-compliant';
            severity: 'warn' | 'error';
            activeProfile?: string;
            activeProfileLocked: boolean;
            allowedProfiles: string[];
            lockedProfiles: string[];
            violations: Array<{ id: string; message: string; repoId?: string; path?: string }>;
        };
        builtInCapability: {
            enabled: boolean;
            layerEnabled: boolean;
            disabledByUser?: boolean;
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
        configWarnings: [],
        localGitRepoIds: new Set<string>(),
        repoSyncByRepoId: {},
        repoMetadataById: {},
        capabilityByLayer: {},
        treeSummaryCache: makeEmptyTreeSummaryCache(),
        governanceContractErrors: [],
        governanceContract: undefined,
        governanceCompliance: undefined,
        builtInCapability: {
            enabled: false,
            layerEnabled: true,
            disabledByUser: false,
            synchronizedFiles: [],
            sourceRoot: undefined,
            sourceId: 'dynfxdigital.metaflow-ai',
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
                    'Hooks: 0/0 active',
                ],
                '*Shared Copilot Pack providing reusable AI coding agent capabilities.*',
            ),
        );
    });

    test('CTV-02: legacy single-repo configuration uses its stable primary id', () => {
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

        assert.strictEqual(String(repoItem.label), 'primary');
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
                    sourceId: 'dynfxdigital.metaflow-ai',
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
            builtInItem?.checkboxState,
            1,
            'built-in repo should expose a checked checkbox',
        );
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
                    'Hooks: 0/0 active',
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
                    sourceId: 'dynfxdigital.metaflow-ai',
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
        assert.strictEqual(
            builtInItem.checkboxState,
            0,
            'disabled built-in repo should expose an unchecked checkbox',
        );
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, disabled)');
        assert.deepStrictEqual(provider.getChildren(builtInItem), []);
    });

    test('CTV-06b: built-in repo stays visible when it is temporarily disabled by the user', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                builtInCapability: {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(String(builtInItem.label), 'MetaFlow: AI Metadata Overlay');
        assert.strictEqual(builtInItem.contextValue, 'configRepoSourceBuiltin');
        assert.strictEqual(
            builtInItem.checkboxState,
            0,
            'user-disabled built-in repo should remain visible with an unchecked checkbox',
        );
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, disabled)');
    });

    test('CTV-06c: loading config does not expose an empty capability summary', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                isLoading: true,
                config: {},
                treeSummaryCache: undefined,
                builtInCapability: {
                    enabled: false,
                    layerEnabled: false,
                    synchronizedFiles: ['.github/instructions/example.instructions.md'],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(builtInItem.description, 'bundled extension metadata (loading)');
        assert.ok(!String(builtInItem.description).includes('0/0'));
    });

    test('CTV-06d: loading refresh preserves the previous capability summary', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                isLoading: true,
                config: {},
                builtInCapability: {
                    enabled: false,
                    layerEnabled: false,
                    synchronizedFiles: ['.github/instructions/example.instructions.md'],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, disabled)');
    });

    test('CTV-06e: stale active summary does not re-check a disabled built-in repo', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const summaryCache = makeEmptyTreeSummaryCache();
        summaryCache.currentActiveRecords.push({
            repoId: '__metaflow_builtin__',
            artifactType: 'instructions',
            repoRelativePath: '.github/instructions/example.instructions.md',
            displayPath: '.github/instructions/example.instructions.md',
            artifactPath: '/tmp/ext/assets/metaflow-ai-metadata/.github/instructions/example.instructions.md',
        });
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                treeSummaryCache: summaryCache,
                builtInCapability: {
                    enabled: false,
                    layerEnabled: false,
                    disabledByUser: true,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(builtInItem.checkboxState, 0);
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (1/0, disabled)');
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
                    tooltip: '**Warning**\n\nMissing METAFLOW.md',
                },
                {
                    label: 'Repo path is not accessible',
                    contextValue: 'configWarning',
                    tooltip: '**Warning**\n\nRepo path is not accessible',
                },
            ],
        );
        assert.strictEqual(warningItems[0].command, undefined);
    });

    test('CTV-07d: diagnostics-only warnings render even when config failed to load', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(makeState(), {
            forEach(callback): void {
                callback(
                    { fsPath: '/workspace/.metaflow/config.jsonc' },
                    [
                        {
                            message: 'Enabled capability path is missing.',
                            severity: 1,
                            range: { start: { line: 0, character: 0 } },
                            source: 'MetaFlow',
                            code: 'LAYER_PATH_MISSING',
                        },
                    ],
                );
            },
        });

        const [warningsSection] = provider.getChildren();
        const [warningItem] = provider.getChildren(warningsSection);

        assert.strictEqual(String(warningsSection.label), 'Warnings (1)');
        assert.strictEqual(warningsSection.section, 'warnings');
        assert.strictEqual(String(warningItem.label), 'Enabled capability path is missing.');
        assert.strictEqual(
            warningItem.description,
            '[LAYER_PATH_MISSING] /workspace/.metaflow/config.jsonc#L1C1',
        );
        assert.strictEqual(
            extractTooltipText(warningItem.tooltip),
            '**Warning**\n\nCode: `LAYER_PATH_MISSING`  \nEnabled capability path is missing.  \nLocation: `/workspace/.metaflow/config.jsonc#L1C1`',
        );
        assert.strictEqual(warningItem.command, undefined);
    });

    test('CTV-07e: state-backed config warnings render without diagnostics collection', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                configWarnings: [
                    '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
                ],
            }),
        );

        const [, warningsSection] = provider.getChildren();
        const [warningItem] = provider.getChildren(warningsSection);

        assert.strictEqual(String(warningsSection.label), 'Warnings (1)');
        assert.ok(
            String(warningItem.label).startsWith(
                'Configured capability path "primary/capabilities/ghost"',
            ),
        );
        assert.ok(extractTooltipText(warningItem.tooltip).includes('currently mounted.'));
        assert.strictEqual(warningItem.description, '[LAYER_PATH_MISSING]');
    });

    test('CTV-07f: config warning locations win over duplicate raw capability warnings', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                capabilityWarnings: [
                    '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
                ],
                configWarnings: [
                    '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted. [/workspace/.metaflow/config.jsonc#L13C9]',
                ],
            }),
        );

        const [, warningsSection] = provider.getChildren();
        const [warningItem] = provider.getChildren(warningsSection);

        assert.strictEqual(String(warningsSection.label), 'Warnings (1)');
        assert.strictEqual(
            warningItem.description,
            '[LAYER_PATH_MISSING] /workspace/.metaflow/config.jsonc#L13C9',
        );
        assert.strictEqual(String(warningItem.label).includes('Configured capability path'), true);
    });

    test('CTV-07b: long structured warnings render a compact row with full tooltip details', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-warning-item-'));
        const sourcePath = path.join(
            tempRoot,
            'capabilities',
            'agentic-development',
            'sample',
            '.github',
            'agents',
            'plugin.json',
        );
        fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
        fs.writeFileSync(sourcePath, '{}\n', 'utf-8');

        try {
            const normalizedSourcePath = sourcePath.replace(/\\/g, '/');
            const { ConfigTreeViewProvider } = loadConfigTreeView();
            const provider = new ConfigTreeViewProvider(
                makeState({
                    config: {},
                    capabilityWarnings: [
                        `[CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID] Capability agent plugin plugin.json could not be parsed: Unexpected token { in JSON at position 1 [${normalizedSourcePath}]`,
                    ],
                }),
            );

            const [, warningsSection] = provider.getChildren();
            const [warningItem] = provider.getChildren(warningsSection);

            assert.strictEqual(
                String(warningItem.label),
                'Capability agent plugin plugin.json could not be parsed: Unexpected token { in JSON…',
            );
            assert.strictEqual(warningItem.contextValue, 'configWarningSource');
            assert.ok(
                String(warningItem.description).includes(
                    '[CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID]',
                ),
            );
            assert.ok(String(warningItem.description).includes('agents/plugin.json'));
            assert.strictEqual(
                extractTooltipText(warningItem.tooltip),
                joinTooltip('**Warning**', [
                    'Code: `CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID`',
                    'Capability agent plugin plugin.json could not be parsed: Unexpected token { in JSON at position 1',
                    `Location: \`${normalizedSourcePath}\``,
                    'Action: Click to open the warning source location.',
                ]),
            );
            assert.deepStrictEqual(warningItem.command, {
                command: 'metaflow.openWarningSource',
                title: 'Open Warning Source',
                arguments: [
                    {
                        sourcePath,
                        sourceKind: 'file',
                        warningMessage: `[CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID] Capability agent plugin plugin.json could not be parsed: Unexpected token { in JSON at position 1 [${normalizedSourcePath}]`,
                    },
                ],
            });
            assert.deepStrictEqual(warningItem.accessibilityInformation, {
                label: `[CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID] Capability agent plugin plugin.json could not be parsed: Unexpected token { in JSON at position 1 [${normalizedSourcePath}]. Opens source file.`,
                role: 'listitem',
            });
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('CTV-07c: maintenance failure warnings reveal existing capability directories', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-warning-dir-'));
        const capabilityDir = path.join(tempRoot, 'capabilities', 'demo', '.agents');
        fs.mkdirSync(capabilityDir, { recursive: true });

        try {
            const normalizedCapabilityDir = capabilityDir.replace(/\\/g, '/');
            const { ConfigTreeViewProvider } = loadConfigTreeView();
            const provider = new ConfigTreeViewProvider(
                makeState({
                    config: {},
                    capabilityWarnings: [
                        `MetaFlow: Failed to maintain plugin metadata for capabilities/demo/.agents. CAPABILITY.md was not found. [${normalizedCapabilityDir}]`,
                    ],
                }),
            );

            const [, warningsSection] = provider.getChildren();
            const [warningItem] = provider.getChildren(warningsSection);

            assert.strictEqual(warningItem.contextValue, 'configWarningSource');
            assert.deepStrictEqual(warningItem.command, {
                command: 'metaflow.openWarningSource',
                title: 'Open Warning Source',
                arguments: [
                    {
                        sourcePath: capabilityDir,
                        sourceKind: 'directory',
                        warningMessage: `MetaFlow: Failed to maintain plugin metadata for capabilities/demo/.agents. CAPABILITY.md was not found. [${normalizedCapabilityDir}]`,
                    },
                ],
            });
            assert.ok(
                extractTooltipText(warningItem.tooltip).includes(
                    'Action: Click to reveal the warning source location in Explorer.',
                ),
            );
            assert.deepStrictEqual(warningItem.accessibilityInformation, {
                label: `MetaFlow: Failed to maintain plugin metadata for capabilities/demo/.agents. CAPABILITY.md was not found. [${normalizedCapabilityDir}]. Reveals source location in Explorer.`,
                role: 'listitem',
            });
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
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

    test('CTV-09: repo ids label workspace-root paths while local repos stay rescannable', () => {
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
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            '**local-repo**\n\nStatus: disabled  \nLocal path: `.`  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active  \nHooks: 0/0 active',
        );
        assert.strictEqual(provider.getChildren(repoItem).length, 0);
        assert.strictEqual(provider.getTreeItem(repoItem), repoItem);
    });

    test('CTV-09b: local git repos render distinct local-git copy without remote-tracked context', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'local-git',
                            localPath: '/workspace/local-git',
                            enabled: true,
                        },
                    ],
                },
                localGitRepoIds: new Set(['local-git']),
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(repoItem.contextValue, 'configRepoSourceLocalGit');
        assert.strictEqual(repoItem.description, 'local-git [local git] (0/0)');
        assert.strictEqual(extractThemeIconId(repoItem.iconPath), 'source-control');
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            '**local-git**\n\nStatus: enabled  \nLocal path: `local-git`  \nSource control: local git repository  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active  \nHooks: 0/0 active',
        );
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
            '**primary**\n\nStatus: enabled  \nLocal path: `team`  \nRemote URL: `https://github.com/example/team.git`  \nSync status: Updates available upstream  \nTracking branch: `origin/main`  \nAhead/Behind: 1/2  \nLast checked: 2026-03-13T00:00:00.000Z  \nError: fetch failed  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active  \nHooks: 0/0 active',
        );
        assert.deepStrictEqual(repoItem.accessibilityInformation, {
            label: 'primary enabled',
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
                    label: 'upToDate',
                    contextValue: 'configRepoSourceGit',
                    description: 'up-to-date [git] (0/0, up to date)',
                    icon: 'cloud',
                },
                {
                    label: 'ahead',
                    contextValue: 'configRepoSourceGitAhead',
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

    test('CTV-12: built-in repo stays enabled when only the MetaFlow capability is disabled', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                capabilityByLayer: {
                    '__metaflow_builtin__/.': {
                        name: ' Bundled Capability ',
                    },
                },
                builtInCapability: {
                    enabled: true,
                    layerEnabled: false,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            }),
        );

        const [section] = provider.getChildren();
        const [builtInItem] = provider.getChildren(section);

        assert.strictEqual(String(builtInItem.label), 'Bundled Capability');
        assert.strictEqual(builtInItem.contextValue, 'configRepoSourceBuiltin');
        assert.strictEqual(builtInItem.description, 'bundled extension metadata (0/0, enabled)');
        assert.strictEqual(extractThemeIconId(builtInItem.iconPath), 'package');
    });

    test('CTV-13: provider preserves outside-workspace paths and honors names that repeat repo ids', () => {
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

        assert.strictEqual(String(repoItem.label), 'primary');
        assert.strictEqual(repoItem.description, '/external/team-metadata (0/0)');
        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            '**primary**\n\nStatus: enabled  \nLocal path: `/external/team-metadata`  \nInstructions: 0/0 active  \nPrompts: 0/0 active  \nAgents: 0/0 active  \nSkills: 0/0 active  \nHooks: 0/0 active',
        );
    });

    test('CTV-14: repo source descriptions and tooltips surface repo-scoped governance violations', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {
                    metadataRepos: [
                        {
                            id: 'primary',
                            localPath: '/workspace/team',
                            enabled: true,
                        },
                    ],
                },
                governanceContract: {
                    requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
                    severity: 'error',
                },
                governanceCompliance: {
                    status: 'non-compliant',
                    severity: 'error',
                    activeProfile: 'default',
                    activeProfileLocked: false,
                    allowedProfiles: [],
                    lockedProfiles: [],
                    violations: [
                        {
                            id: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
                            message:
                                'Required capability "primary/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
                            repoId: 'primary',
                            path: 'standards/sdlc',
                        },
                    ],
                },
            }),
        );

        const [section] = provider.getChildren();
        const [repoItem] = provider.getChildren(section);

        assert.strictEqual(repoItem.description, 'team (0/0, governance 1 violation)');
        assert.ok(
            extractTooltipText(repoItem.tooltip).includes(
                'Governance: non-compliant (severity: error)',
            ),
        );
        assert.ok(
            extractTooltipText(repoItem.tooltip).includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc] Required capability "primary/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
            ),
        );
    });

    test('CTV-15: warnings section surfaces concise governance summary when violations are not repo-scoped', () => {
        const { ConfigTreeViewProvider } = loadConfigTreeView();
        const provider = new ConfigTreeViewProvider(
            makeState({
                config: {},
                governanceCompliance: {
                    status: 'non-compliant',
                    severity: 'warn',
                    activeProfile: undefined,
                    activeProfileLocked: false,
                    allowedProfiles: ['default'],
                    lockedProfiles: [],
                    violations: [
                        {
                            id: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::__none__',
                            message: 'No active profile is selected. Allowed profiles: default.',
                        },
                    ],
                },
            }),
        );

        const rootItems = provider.getChildren();
        assert.deepStrictEqual(
            rootItems.map((item) => String(item.label)),
            ['Repositories', 'Warnings (1)'],
        );

        const warningItems = provider.getChildren(rootItems[1]);
        assert.deepStrictEqual(
            warningItems.map((item) => String(item.label)),
            ['Governance: non-compliant (severity: warn)'],
        );
    });
});
