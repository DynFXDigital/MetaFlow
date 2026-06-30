import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArtifactType } from '@metaflow/engine';

type TestArtifactType = Exclude<ArtifactType, 'other'>;

// ── Minimal vscode mock ────────────────────────────────────────────────────────

class MockTreeItem {
    label: unknown;
    collapsibleState: number;
    contextValue?: string;
    iconPath?: unknown;
    description?: string | boolean;
    checkboxState?: number;
    id?: string;
    tooltip?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };

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
    Uri: {
        file: (p: string): { fsPath: string } => ({ fsPath: p }),
    },
    workspace: {
        workspaceFolders: undefined as unknown,
        getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
    },
};

// ── Module loader helper ───────────────────────────────────────────────────────

type MockLayerTreeItem = {
    label?: unknown;
    contextValue?: string;
    layerIndex?: number;
    repoId?: string;
    artifactType?: TestArtifactType;
    id?: string;
    checkboxState?: number;
    description?: string | boolean;
    collapsibleState?: number;
    pathKey?: string;
    tooltip?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };
};

type LayersTreeViewModule = {
    LayersTreeViewProvider: new (
        state: {
            config?: unknown;
            effectiveFiles: unknown[];
            treeSummaryCache?: unknown;
            capabilityByLayer?: Record<
                string,
                {
                    id?: string;
                    name?: string;
                    description?: string;
                    license?: string;
                    experimental?: boolean;
                }
            >;
            repoMetadataById?: Record<string, { name?: string; description?: string }>;
            onDidChange: { event: (_l: unknown) => { dispose: () => void } };
        },
        modeResolver?: () => string,
    ) => {
        getChildren(element?: MockLayerTreeItem): MockLayerTreeItem[];
        getExpandAllStrategy(): string;
        getSearchQuery(): string | undefined;
        getPendingCapabilityCheckboxSequence(): number;
        getStagedExpandPlan(): {
            stageOne: MockLayerTreeItem[];
            stageTwo: MockLayerTreeItem[];
            stages?: MockLayerTreeItem[][];
        };
        getParent(element: MockLayerTreeItem): MockLayerTreeItem | undefined;
        setPendingCapabilityCheckboxState(state:
            | { kind: 'repo'; repoId: string; checked: boolean }
            | { kind: 'branch'; repoId?: string; layerPath: string; checked: boolean }
            | { kind: 'layer'; repoId?: string; layerPath: string; checked: boolean }): void;
        clearPendingCapabilityCheckboxStates(maxSequence?: number): void;
        setSearchQuery(value: string | undefined): void;
    };
};

function loadLayersTreeView(): LayersTreeViewModule {
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

    const targetPath = require.resolve('../../views/layersTreeView');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as LayersTreeViewModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeMultiRepoConfig(
    extraLayerSourceProps?: Partial<{
        enabled: boolean;
        injection: Partial<
            Record<
                'instructions' | 'prompts' | 'agents' | 'skills',
                'settings' | 'synchronize' | 'plugin'
            >
        >;
        repoInjection: Partial<
            Record<
                'instructions' | 'prompts' | 'agents' | 'skills',
                'settings' | 'synchronize' | 'plugin'
            >
        >;
        capabilityInjection: Partial<
            Record<
                'instructions' | 'prompts' | 'agents' | 'skills',
                'settings' | 'synchronize' | 'plugin'
            >
        >;
        globalInjection: Partial<
            Record<
                'instructions' | 'prompts' | 'agents' | 'skills',
                'settings' | 'synchronize' | 'plugin'
            >
        >;
    }>,
) {
    const { repoInjection, capabilityInjection, globalInjection, ...layerSourceProps } =
        extraLayerSourceProps ?? {};

    return {
        metadataRepos: [
            {
                id: 'repo1',
                localPath: '/repo1',
                ...(repoInjection ? { injection: repoInjection } : {}),
                capabilities: [
                    {
                        path: '.',
                        ...(capabilityInjection ? { injection: capabilityInjection } : {}),
                    },
                ],
            },
        ],
        layerSources: [
            {
                repoId: 'repo1',
                path: '.',
                ...layerSourceProps,
            },
        ],
        ...(globalInjection ? { injection: globalInjection } : {}),
    };
}

function makeEffectiveFile(
    relativePath: string,
    repoId = 'repo1',
    layerPath = '.',
): { relativePath: string; sourceLayer: string; absolutePath: string } {
    return {
        relativePath,
        sourceLayer: `${repoId}/${layerPath}`,
        absolutePath: `/repo1/.github/${relativePath}`,
    };
}

function makeState(
    config?: unknown,
    effectiveFiles: unknown[] = [],
    capabilityByLayer: Record<
        string,
        {
            id?: string;
            name?: string;
            description?: string;
            license?: string;
            experimental?: boolean;
        }
    > = {},
    builtInCapability: {
        enabled: boolean;
        layerEnabled: boolean;
        synchronizedFiles: string[];
        sourceRoot?: string;
        sourceId: string;
        sourceDisplayName: string;
    } = {
        enabled: false,
        layerEnabled: true,
        synchronizedFiles: [],
        sourceRoot: undefined,
        sourceId: 'dynfxdigital.metaflow-ai',
        sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
    },
    repoMetadataById: Record<string, { name?: string; description?: string }> = {},
    treeSummaryCache?: unknown,
) {
    const event = (listener: unknown): { dispose: () => void } => {
        void listener;
        return { dispose: () => {} };
    };

    return {
        config,
        effectiveFiles,
        treeSummaryCache,
        capabilityByLayer,
        repoMetadataById,
        builtInCapability,
        onDidChange: {
            event,
        },
    };
}

function makeEmptyTreeSummaryCache() {
    return {
        availableRecords: [],
        currentActiveRecords: [],
        baseActiveRecords: [],
        instructionScopeRecords: [],
        currentInstructionScopeSummary: {
            inspectedCount: 0,
            activeCount: 0,
            highRiskCount: 0,
            mediumRiskCount: 0,
            lowRiskCount: 0,
            unknownCount: 0,
            missingApplyToCount: 0,
            activeHighRiskCount: 0,
            topRisks: [],
            status: 'none',
        },
        profileInstructionScopeSummaries: {},
        profileSummaries: {},
        currentSummary: {
            totalActive: 0,
            totalAvailable: 0,
            byType: {
                instructions: { active: 0, available: 0 },
                prompts: { active: 0, available: 0 },
                agents: { active: 0, available: 0 },
                skills: { active: 0, available: 0 },
            },
        },
        availableSummary: {
            totalActive: 0,
            totalAvailable: 0,
            byType: {
                instructions: { active: 0, available: 0 },
                prompts: { active: 0, available: 0 },
                agents: { active: 0, available: 0 },
                skills: { active: 0, available: 0 },
            },
        },
    };
}

function createTempDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function joinTooltip(title: string, details: string[], description?: string): string {
    const header = description ? `${title}  \n${description}` : title;
    return details.length ? `${header}\n\n${details.join('  \n')}` : header;
}

/** Files covering all 4 known artifact types in repo1/. */
const ALL_TYPES_FILES = [
    makeEffectiveFile('instructions/a.md'),
    makeEffectiveFile('prompts/b.md'),
    makeEffectiveFile('agents/c.md'),
    makeEffectiveFile('skills/d.md'),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('LayersTreeView – artifact-type children', () => {
    test('LTV-AT-01: tree mode – leaf LayerItem has Collapsed state (hasChildren=true)', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        // Root → RepoItems
        const roots = provider.getChildren();
        assert.ok(roots.length > 0, 'expected repo item at root');

        // Repo → LayerItems
        const repoItem = roots[0];
        assert.strictEqual(repoItem.contextValue, 'layerRepo');

        const layers = provider.getChildren(repoItem);
        assert.ok(layers.length > 0, 'expected at least one layer item');

        const layerItem = layers[0];
        assert.strictEqual(layerItem.contextValue, 'layer');
        // In tree mode, the layer item should be collapsible (1 = Collapsed)
        assert.strictEqual(
            layerItem.collapsibleState,
            1,
            'leaf layer should be Collapsed in tree mode',
        );
    });

    test('LTV-AT-02: tree mode – leaf LayerItem children are ArtifactTypeLayerItems', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        assert.strictEqual(artifactChildren.length, 4, 'should have 4 artifact type children');
        const labels = artifactChildren.map((c) => String(c.label));
        assert.deepStrictEqual(labels, ['instructions', 'prompts', 'agents', 'skills']);
        assert.ok(
            artifactChildren.every((c) => String(c.contextValue).startsWith('layerArtifactType:')),
        );
    });

    test('LTV-AT-03: artifact type rows are browse-only without checkboxes', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const promptsItem = artifactChildren.find((c) => String(c.label) === 'prompts');
        const instructionsItem = artifactChildren.find((c) => String(c.label) === 'instructions');

        assert.ok(promptsItem, 'prompts item should exist');
        assert.ok(instructionsItem, 'instructions item should exist');
        assert.strictEqual(promptsItem?.checkboxState, undefined);
        assert.strictEqual(
            instructionsItem?.checkboxState,
            undefined,
            'instructions should be browse-only with no checkbox',
        );
    });

    test('LTV-AT-03b: disabled repo is hidden from the capabilities root', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            [],
            'disabled repositories should not show a root row in the Capabilities view',
        );
    });

    test('LTV-AT-03c: repo item tooltip includes repo manifest description when available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'primary', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES, {}, undefined, {
                repo1: {
                    description: 'Shared repository-level metadata for the workspace.',
                },
            }),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();

        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            joinTooltip(
                '**primary**',
                [
                    'Status: enabled',
                    'Repository ID: `repo1`',
                    'Root: `/repo1`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Shared repository-level metadata for the workspace.*',
            ),
        );
    });

    test('LTV-AT-04: flat mode does not show artifact-type children', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'flat',
        );

        const layers = provider.getChildren();
        assert.ok(layers.length > 0, 'expected layer items in flat mode');

        const layerItem = layers[0];
        // In flat mode, layer items have no children
        const children = provider.getChildren(layerItem);
        assert.strictEqual(children.length, 0, 'flat mode layer items should have no children');
    });

    test('LTV-PM-01: flat mode root layer items have no parent', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'flat',
        );

        const [layerItem] = provider.getChildren();

        assert.strictEqual(provider.getParent(layerItem), undefined);
    });

    test('LTV-PM-02: tree mode tracks repo, layer, and artifact type parents', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();
        const [layerItem] = provider.getChildren(repoItem);
        const [artifactItem] = provider.getChildren(layerItem);

        assert.strictEqual(provider.getParent(repoItem), undefined);
        assert.strictEqual(provider.getParent(layerItem), repoItem);
        assert.strictEqual(provider.getParent(artifactItem), layerItem);
    });

    test('LTV-AT-05: ArtifactTypeLayerItem carries correct layerIndex and repoId', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        for (const child of artifactChildren) {
            assert.strictEqual(child.layerIndex, 0, 'layerIndex should be 0 (first layer)');
            assert.strictEqual(child.repoId, 'repo1', 'repoId should match config');
        }
    });

    test('LTV-AT-06: artifact type description includes injection mode', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const agentsItem = artifactChildren.find((c) => String(c.label) === 'agents');
        const skillsItem = artifactChildren.find((c) => String(c.label) === 'skills');

        assert.strictEqual(agentsItem?.description, '(0, plugin)');
        assert.strictEqual(skillsItem?.description, '(0, plugin)');
    });

    test('LTV-AT-06b: artifact type tooltip explains capability and injection state', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const agentsItem = artifactChildren.find((c) => String(c.label) === 'agents');
        const instructionsItem = artifactChildren.find((c) => String(c.label) === 'instructions');

        assert.strictEqual(
            extractTooltipText(agentsItem?.tooltip),
            joinTooltip('**Artifact Type**: agents', [
                'Status: available in this capability',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: plugin (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
        assert.strictEqual(
            extractTooltipText(instructionsItem?.tooltip),
            joinTooltip('**Artifact Type**: instructions', [
                'Status: available in this capability',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: plugin (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
    });

    test('LTV-AT-06c: artifact type tooltip reports capability override injection source', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ capabilityInjection: { prompts: 'synchronize' } });
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);
        const promptsItem = artifactChildren.find((c) => String(c.label) === 'prompts');

        assert.strictEqual(promptsItem?.description, '(0, synchronize)');
        assert.strictEqual(
            extractTooltipText(promptsItem?.tooltip),
            joinTooltip('**Artifact Type**: prompts', [
                'Status: available in this capability',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (capability override)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
    });

    test('LTV-AT-06d: artifact type tooltip reports repo and global injection sources', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({
            repoInjection: { agents: 'synchronize' },
            globalInjection: { skills: 'synchronize' },
        });
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);
        const agentsItem = artifactChildren.find((c) => String(c.label) === 'agents');
        const skillsItem = artifactChildren.find((c) => String(c.label) === 'skills');

        assert.strictEqual(agentsItem?.description, '(0, synchronize)');
        assert.strictEqual(skillsItem?.description, '(0, synchronize)');
        assert.strictEqual(
            extractTooltipText(agentsItem?.tooltip),
            joinTooltip('**Artifact Type**: agents', [
                'Status: available in this capability',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (repo default)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
        assert.strictEqual(
            extractTooltipText(skillsItem?.tooltip),
            joinTooltip('**Artifact Type**: skills', [
                'Status: available in this capability',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (global default)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
    });

    test('LTV-AT-07: no config – root returns empty', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const provider = new LayersTreeViewProvider(makeState(undefined), () => 'tree');
        const children = provider.getChildren();
        assert.strictEqual(children.length, 0);
    });

    test('LTV-AT-07b: stale configured layers with no content are omitted when summaries are available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1', enabled: true }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/obsolete', enabled: true }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], {}, undefined, {}, makeEmptyTreeSummaryCache()),
            () => 'flat',
        );

        const children = provider.getChildren();
        assert.strictEqual(children.length, 0, 'stale empty layer should not render');
    });

    test('LTV-AT-08: disabled layer remains browseable and exposes artifact-type children', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ enabled: false });
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        assert.strictEqual(repoItem.contextValue, 'layerRepo');

        const layers = provider.getChildren(repoItem);
        assert.ok(layers.length > 0, 'expected at least one layer item');

        const layerItem = layers[0];
        assert.strictEqual(layerItem.contextValue, 'layer');
        assert.strictEqual(layerItem.checkboxState, 0, 'disabled layer should remain unchecked');
        assert.strictEqual(
            layerItem.collapsibleState,
            1,
            'disabled layer should stay collapsible when artifact content exists',
        );

        const children = provider.getChildren(layerItem);
        assert.deepStrictEqual(
            children.map((child) => String(child.label)),
            ['instructions', 'prompts', 'agents', 'skills'],
        );
        assert.ok(
            children.every((child) => String(child.contextValue).startsWith('layerArtifactType:')),
            'disabled layer should still expose artifact-type children',
        );

        const instructionsItem = children.find((child) => String(child.label) === 'instructions');
        assert.strictEqual(instructionsItem?.description, '(0, plugin, capability disabled)');
        assert.strictEqual(
            extractTooltipText(instructionsItem?.tooltip),
            joinTooltip('**Artifact Type**: instructions', [
                'Status: available in this capability',
                'Capability status: disabled',
                'Repository status: enabled',
                'Injection: plugin (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
            ]),
        );
    });

    test('LTV-AT-08b: repo-disabled source is omitted from the capabilities tree', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            [],
            'repo-disabled source should not show a repo root or capabilities until re-enabled',
        );
    });

    test('LTV-AT-09: layer with no known-type files – no artifact-type children', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        // Only 'other' type files (not instructions/prompts/agents/skills)
        const otherFiles = [makeEffectiveFile('custom/foo.md'), makeEffectiveFile('bar.md')];
        const provider = new LayersTreeViewProvider(makeState(config, otherFiles), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layers = provider.getChildren(repoItem);
        assert.ok(layers.length > 0);

        const layerItem = layers[0];
        // No known-type files or available metadata records → not collapsible
        assert.strictEqual(
            layerItem.collapsibleState,
            0,
            'layer with no known-type files should be None',
        );

        const children = provider.getChildren(layerItem);
        assert.strictEqual(children.length, 0, 'should have no artifact-type children');
    });

    test('LTV-AT-10: built-in layer appears with repo id and checkbox in tree mode', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [makeEffectiveFile('instructions/a.md', '__metaflow_builtin__', '.')],
                {},
                {
                    enabled: true,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
                {
                    __metaflow_builtin__: {
                        description: 'Bundled MetaFlow metadata projected from the extension.',
                    },
                },
            ),
            () => 'tree',
        );

        const repoItems = provider.getChildren();
        const builtInRepo = repoItems.find((item) => item.repoId === '__metaflow_builtin__');
        assert.ok(builtInRepo, 'expected built-in repository node');
        assert.strictEqual(
            extractTooltipText(builtInRepo.tooltip),
            joinTooltip(
                '**MetaFlow: AI Metadata Overlay**',
                [
                    'Status: enabled',
                    'Source: bundled with the MetaFlow extension',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Bundled MetaFlow metadata projected from the extension.*',
            ),
        );

        const builtInLayer = provider.getChildren(builtInRepo)[0];
        assert.strictEqual(builtInLayer.repoId, '__metaflow_builtin__');
        assert.strictEqual(String(builtInLayer.label), 'root');
        assert.strictEqual(String(builtInLayer.description), '(0/0)');
        assert.ok(!String(builtInLayer.description).includes('__metaflow_builtin__'));
        assert.strictEqual(builtInLayer.contextValue, 'layer');
        assert.strictEqual(builtInLayer.checkboxState, 1);
    });

    test('LTV-AT-10b: built-in layer appears for legacy Synchronized installs', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile(
                        'skills/metaflow-capability-review/SKILL.md',
                        '__metaflow_builtin__',
                        '.',
                    ),
                ],
                {},
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: ['.github/skills/metaflow-capability-review/SKILL.md'],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            ),
            () => 'tree',
        );

        const repoItems = provider.getChildren();
        const builtInRepo = repoItems.find((item) => item.repoId === '__metaflow_builtin__');
        assert.ok(builtInRepo, 'expected built-in repository node for Synchronized legacy install');
    });

    test('LTV-AT-10c: built-in repo exposes metadata-authoring folder with three child capabilities', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const capabilityByLayer = {
            '__metaflow_builtin__/.': { name: 'MetaFlow' },
            '__metaflow_builtin__/capabilities/metadata-authoring/github-copilot-metadata-authoring':
                {
                    name: 'GitHub Copilot Metadata Authoring',
                },
            '__metaflow_builtin__/capabilities/metadata-authoring/claude-code-metadata-authoring': {
                name: 'Claude Code Metadata Authoring',
            },
            '__metaflow_builtin__/capabilities/metadata-authoring/codex-metadata-authoring': {
                name: 'Codex Metadata Authoring',
            },
        };

        const provider = new LayersTreeViewProvider(
            makeState(
                {
                    metadataRepos: [
                        {
                            id: '__metaflow_builtin__',
                            name: 'MetaFlow',
                            localPath: '/tmp/ext/assets/metaflow-ai-metadata',
                            enabled: true,
                        },
                    ],
                    layerSources: [
                        { repoId: '__metaflow_builtin__', path: '.', enabled: true },
                        {
                            repoId: '__metaflow_builtin__',
                            path: 'capabilities/metadata-authoring/github-copilot-metadata-authoring',
                            enabled: true,
                        },
                        {
                            repoId: '__metaflow_builtin__',
                            path: 'capabilities/metadata-authoring/claude-code-metadata-authoring',
                            enabled: true,
                        },
                        {
                            repoId: '__metaflow_builtin__',
                            path: 'capabilities/metadata-authoring/codex-metadata-authoring',
                            enabled: true,
                        },
                    ],
                },
                [
                    makeEffectiveFile('instructions/root.md', '__metaflow_builtin__', '.'),
                    makeEffectiveFile(
                        'instructions/copilot.md',
                        '__metaflow_builtin__',
                        'capabilities/metadata-authoring/github-copilot-metadata-authoring',
                    ),
                    makeEffectiveFile(
                        'instructions/claude.md',
                        '__metaflow_builtin__',
                        'capabilities/metadata-authoring/claude-code-metadata-authoring',
                    ),
                    makeEffectiveFile(
                        'instructions/codex.md',
                        '__metaflow_builtin__',
                        'capabilities/metadata-authoring/codex-metadata-authoring',
                    ),
                ],
                capabilityByLayer,
            ),
            () => 'tree',
        );

        const repoItems = provider.getChildren();
        const builtInRepo = repoItems.find((item) => item.repoId === '__metaflow_builtin__');
        assert.ok(builtInRepo, 'expected built-in repository node');
        assert.strictEqual(builtInRepo.checkboxState, 1);

        const repoChildren = provider.getChildren(builtInRepo as never);
        assert.deepStrictEqual(
            repoChildren.map((item) => String(item.label)).sort(),
            ['MetaFlow', 'metadata-authoring'],
            'built-in repo should expose the root MetaFlow capability alongside the metadata-authoring directory',
        );

        const rootCapability = repoChildren.find((item) => String(item.label) === 'MetaFlow');
        assert.ok(rootCapability, 'expected built-in root MetaFlow capability');

        const metadataAuthoringFolder = repoChildren.find(
            (item) => String(item.label) === 'metadata-authoring',
        );
        assert.ok(metadataAuthoringFolder, 'expected metadata-authoring sibling folder');
        assert.strictEqual(
            (metadataAuthoringFolder as { contextValue?: unknown }).contextValue,
            'layerFolder',
        );

        const rootChildren = provider.getChildren(rootCapability as never);
        assert.deepStrictEqual(
            rootChildren.map((item) => String(item.label)).sort(),
            ['instructions'],
            'built-in root capability should expose only its own artifact buckets from the root layer fixture',
        );

        const metadataChildren = provider.getChildren(metadataAuthoringFolder as never);
        assert.deepStrictEqual(metadataChildren.map((item) => String(item.label)).sort(), [
            'Claude Code Metadata Authoring',
            'Codex Metadata Authoring',
            'GitHub Copilot Metadata Authoring',
        ]);
    });

    test('LTV-AT-10: only types with files are shown (partial coverage)', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        // Only instructions and skills files
        const files = [makeEffectiveFile('instructions/a.md'), makeEffectiveFile('skills/d.md')];
        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        assert.strictEqual(artifactChildren.length, 2, 'should only show 2 types with files');
        const labels = artifactChildren.map((c) => String(c.label));
        assert.deepStrictEqual(labels, ['instructions', 'skills']);
    });

    test('LTV-AT-11: mixed layer/folder node prefers descendant layers over artifact browse rows', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities' },
                { repoId: 'repo1', path: 'capabilities/devtools' },
            ],
        };
        const files = [
            makeEffectiveFile('instructions/root.md', 'repo1', 'capabilities'),
            makeEffectiveFile('prompts/devtools.md', 'repo1', 'capabilities/devtools'),
        ];

        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const top = provider.getChildren(repoItem);
        const capabilitiesNode = top.find((c) => String(c.label) === 'capabilities');
        assert.ok(capabilitiesNode, 'expected capabilities node at repo root');

        const capabilitiesChildren = provider.getChildren(capabilitiesNode);
        const childLabels = capabilitiesChildren.map((c) => String(c.label));

        assert.deepStrictEqual(
            childLabels,
            ['devtools'],
            'branch layer should show descendant capability folders only',
        );

        const [devtoolsNode] = capabilitiesChildren;
        assert.deepStrictEqual(
            provider.getChildren(devtoolsNode).map((c) => String(c.label)),
            ['prompts'],
            'leaf layer should still show artifact browse rows',
        );
    });

    test('LTV-PM-03: mixed folder and descendant layer nodes keep the expected parent chain', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities' },
                { repoId: 'repo1', path: 'capabilities/devtools' },
            ],
        };
        const files = [
            makeEffectiveFile('instructions/root.md', 'repo1', 'capabilities'),
            makeEffectiveFile('prompts/devtools.md', 'repo1', 'capabilities/devtools'),
        ];

        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const [repoItem] = provider.getChildren();
        const [capabilitiesNode] = provider.getChildren(repoItem);
        const [devtoolsNode] = provider.getChildren(capabilitiesNode);

        assert.strictEqual(String(capabilitiesNode.label), 'capabilities');
        assert.strictEqual(String(devtoolsNode.label), 'devtools');
        assert.strictEqual(provider.getParent(capabilitiesNode), repoItem);
        assert.strictEqual(provider.getParent(devtoolsNode), capabilitiesNode);
    });

    test('LTV-S-06: tree search descends through mixed capability nodes to matching descendants', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities' },
                { repoId: 'repo1', path: 'capabilities/devtools' },
            ],
        };
        const files = [
            makeEffectiveFile('instructions/root.md', 'repo1', 'capabilities'),
            makeEffectiveFile('prompts/devtools.md', 'repo1', 'capabilities/devtools'),
        ];
        const capabilityByLayer = {
            'repo1/capabilities': { id: 'capabilities', name: 'Capabilities Root' },
            'repo1/capabilities/devtools': { id: 'devtools', name: 'Developer Tools' },
        };

        const provider = new LayersTreeViewProvider(
            makeState(config, files, capabilityByLayer),
            () => 'tree',
        );

        provider.setSearchQuery('developer');

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            ['Developer Tools'],
            'search should surface the descendant capability under a mixed parent node',
        );
    });

    test('LTV-AT-12: single-repo tree mode shows artifact-type children for layer nodes', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepo: { localPath: '/repo1' },
            layers: ['capabilities/communication'],
        };
        const files = [
            {
                relativePath: 'instructions/a.md',
                sourceLayer: 'capabilities/communication',
                absolutePath: '/repo1/capabilities/communication/.github/instructions/a.md',
            },
            {
                relativePath: 'prompts/b.md',
                sourceLayer: 'capabilities/communication',
                absolutePath: '/repo1/capabilities/communication/.github/prompts/b.md',
            },
        ];

        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');
        const roots = provider.getChildren();
        assert.ok(roots.length > 0, 'expected single-repo layer item at root');

        const capabilitiesFolder = roots.find((c) => String(c.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder at root');

        const nested = provider.getChildren(capabilitiesFolder);
        const layerItem = nested.find((c) => c.contextValue === 'layer');
        assert.ok(layerItem, 'expected layer item under capabilities folder');

        const children = provider.getChildren(layerItem);
        const labels = children.map((c) => String(c.label));

        assert.deepStrictEqual(labels, ['instructions', 'prompts']);
        assert.ok(children.every((c) => String(c.contextValue).startsWith('layerArtifactType:')));
    });

    test('LTV-BR-01: folder nodes expose checked checkbox state when all descendants are enabled', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools', enabled: true },
                { repoId: 'repo1', path: 'capabilities/comms', enabled: true },
            ],
        };

        const provider = new LayersTreeViewProvider(makeState(config, []), () => 'tree');
        const repoItem = provider.getChildren()[0];
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((child) => String(child.label) === 'capabilities');

        assert.ok(capabilitiesFolder, 'expected capabilities folder');
        assert.strictEqual(capabilitiesFolder?.contextValue, 'layerFolder');
        assert.strictEqual(
            capabilitiesFolder?.checkboxState,
            1,
            'folder should render checked when all descendants are enabled',
        );
        assert.ok(
            extractTooltipText(capabilitiesFolder?.tooltip).includes(
                'Branch state: all descendant capabilities enabled',
            ),
        );
    });

    test('LTV-BR-02: folder nodes expose unchecked checkbox state and partial status when descendants are mixed', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools', enabled: true },
                { repoId: 'repo1', path: 'capabilities/comms', enabled: false },
            ],
        };

        const provider = new LayersTreeViewProvider(makeState(config, []), () => 'tree');
        const repoItem = provider.getChildren()[0];
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((child) => String(child.label) === 'capabilities');

        assert.ok(capabilitiesFolder, 'expected capabilities folder');
        assert.strictEqual(
            capabilitiesFolder?.checkboxState,
            0,
            'folder should render unchecked when descendants are mixed',
        );
        assert.ok(String(capabilitiesFolder?.description).includes('1/2 enabled'));
        assert.ok(
            extractTooltipText(capabilitiesFolder?.tooltip).includes(
                'Branch state: partially enabled (1/2)',
            ),
        );
    });

    test('LTV-AT-14: parent LayerItem description does not mention artifact exclusions', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(
            !String(layerItem.description).includes('excluded'),
            `expected description without excluded hint, got: ${layerItem.description}`,
        );
    });

    test('LTV-AT-15: artifact nodes remain browse-only and become expandable when available descendants exist', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const skillRoot = createTempDir('metaflow-layer-skill-');
        const skillFolder = path.join(skillRoot, '.github', 'skills', 'review-skill');
        fs.mkdirSync(skillFolder, { recursive: true });
        const skillManifestPath = path.join(skillFolder, 'SKILL.md');
        fs.writeFileSync(
            skillManifestPath,
            [
                '---',
                'name: review-skill',
                'description: Review skill description.',
                '---',
                '# Review Skill',
                '',
                'Body',
            ].join('\n'),
        );

        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [],
                {},
                undefined,
                {},
                {
                    availableRecords: [
                        {
                            repoId: 'repo1',
                            artifactType: 'skills',
                            repoRelativePath: '.github/skills/review-skill/SKILL.md',
                            displayPath: 'skills/review-skill/SKILL.md',
                            artifactPath: 'review-skill/SKILL.md',
                            absolutePath: skillManifestPath,
                        },
                    ],
                    currentActiveRecords: [],
                    baseActiveRecords: [],
                    instructionScopeRecords: [],
                    currentInstructionScopeSummary: {},
                    profileInstructionScopeSummaries: {},
                    profileSummaries: {},
                    currentSummary: {},
                    availableSummary: {},
                },
            ),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);
        const skillsItem = artifactChildren.find((child) => String(child.label) === 'skills');

        assert.ok(skillsItem, 'skills node should exist');
        assert.strictEqual(
            skillsItem?.checkboxState,
            undefined,
            'artifact node should be browse-only',
        );
        assert.strictEqual(
            skillsItem?.collapsibleState,
            1,
            'artifact node should expand when browse descendants exist',
        );

        const skillFolders = provider.getChildren(skillsItem);
        assert.strictEqual(
            skillFolders.length,
            1,
            'artifact node should expose browseable folder children',
        );
        assert.strictEqual(skillFolders[0].contextValue, 'layerArtifactBrowseFolder');
        assert.strictEqual(
            skillFolders[0].checkboxState,
            undefined,
            'browse-only folder should not expose checkbox state',
        );
        assert.strictEqual(
            String(skillFolders[0].label),
            'Review',
            'skill folder should prefer user-facing metadata name',
        );

        const skillFiles = provider.getChildren(skillFolders[0]);
        assert.strictEqual(skillFiles.length, 1, 'skill folder should expose nested files');
        assert.strictEqual(skillFiles[0].contextValue, 'layerArtifactBrowseFile');
        assert.strictEqual(
            skillFiles[0].checkboxState,
            undefined,
            'browse-only file should not expose checkbox state',
        );
    });

    test('LTV-PM-04: browseable descendant nodes keep artifact and folder parents', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const skillRoot = createTempDir('metaflow-layer-parent-skill-');
        const skillFolder = path.join(skillRoot, '.github', 'skills', 'review-skill');
        fs.mkdirSync(skillFolder, { recursive: true });
        const skillManifestPath = path.join(skillFolder, 'SKILL.md');
        fs.writeFileSync(
            skillManifestPath,
            ['---', 'name: review-skill', '---', '# Review Skill'].join('\n'),
        );

        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [],
                {},
                undefined,
                {},
                {
                    availableRecords: [
                        {
                            repoId: 'repo1',
                            artifactType: 'skills',
                            repoRelativePath: '.github/skills/review-skill/SKILL.md',
                            displayPath: 'skills/review-skill/SKILL.md',
                            artifactPath: 'review-skill/SKILL.md',
                            absolutePath: skillManifestPath,
                        },
                    ],
                    currentActiveRecords: [],
                    baseActiveRecords: [],
                    instructionScopeRecords: [],
                    currentInstructionScopeSummary: {},
                    profileInstructionScopeSummaries: {},
                    profileSummaries: {},
                    currentSummary: {},
                    availableSummary: {},
                },
            ),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();
        const [layerItem] = provider.getChildren(repoItem);
        const artifactChildren = provider.getChildren(layerItem);
        const skillsItem = artifactChildren.find((child) => String(child.label) === 'skills');
        assert.ok(skillsItem, 'skills node should exist');

        const [browseFolder] = provider.getChildren(skillsItem);
        const [browseFile] = provider.getChildren(browseFolder);

        assert.strictEqual(provider.getParent(skillsItem), layerItem);
        assert.strictEqual(provider.getParent(browseFolder), skillsItem);
        assert.strictEqual(provider.getParent(browseFile), browseFolder);
    });

    test('LTV-AT-16: browseable file descendants prefer frontmatter metadata and preserve nested directories', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const layerRoot = createTempDir('metaflow-layer-instructions-');
        const nestedFolder = path.join(layerRoot, '.github', 'instructions', 'policies');
        fs.mkdirSync(nestedFolder, { recursive: true });
        const filePath = path.join(nestedFolder, 'coding.instructions.md');
        fs.writeFileSync(
            filePath,
            [
                '---',
                'name: Coding Policy',
                'description: Required coding policy.',
                '---',
                '# Policy',
            ].join('\n'),
        );

        const provider = new LayersTreeViewProvider(
            makeState(config, [
                {
                    relativePath: 'instructions/policies/coding.instructions.md',
                    sourceLayer: 'repo1/.',
                    sourcePath: filePath,
                },
            ]),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);
        const instructionsItem = artifactChildren.find(
            (child) => String(child.label) === 'instructions',
        );

        assert.ok(instructionsItem, 'instructions node should exist');
        assert.strictEqual(
            instructionsItem?.collapsibleState,
            1,
            'artifact node should be expandable when nested descendants exist',
        );

        const instructionChildren = provider.getChildren(instructionsItem);
        assert.strictEqual(
            instructionChildren.length,
            1,
            'instructions node should show the nested directory',
        );
        assert.strictEqual(String(instructionChildren[0].label), 'policies');
        assert.strictEqual(instructionChildren[0].contextValue, 'layerArtifactBrowseFolder');

        const fileChildren = provider.getChildren(instructionChildren[0]);
        assert.strictEqual(fileChildren.length, 1, 'nested directory should expose contained file');
        assert.strictEqual(
            String(fileChildren[0].label),
            'Coding Policy',
            'file node should prefer frontmatter name',
        );
        assert.strictEqual(
            String(fileChildren[0].description),
            'coding.instructions.md',
            'file node should retain canonical filename in description',
        );
        assert.ok(
            extractTooltipText(fileChildren[0].tooltip).includes(
                'instructions/policies/coding.instructions.md',
            ),
        );
        assert.ok(extractTooltipText(fileChildren[0].tooltip).includes('Required coding policy.'));
        assert.strictEqual(
            fileChildren[0].checkboxState,
            undefined,
            'browse-only file should not expose checkbox state',
        );
    });

    test('LTV-COUNT-01: shadowed artifact types remain browseable with active/available counts', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'base' },
                { repoId: 'repo1', path: 'override' },
            ],
        };
        const treeSummaryCache = {
            ...makeEmptyTreeSummaryCache(),
            availableRecords: [
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath: 'base/.github/instructions/shared.instructions.md',
                    displayPath: 'base/instructions/shared.instructions.md',
                    artifactPath: 'shared.instructions.md',
                    absolutePath: '/repo1/base/.github/instructions/shared.instructions.md',
                },
                {
                    repoId: 'repo1',
                    artifactType: 'prompts',
                    repoRelativePath: 'base/.github/prompts/base.prompt.md',
                    displayPath: 'base/prompts/base.prompt.md',
                    artifactPath: 'base.prompt.md',
                    absolutePath: '/repo1/base/.github/prompts/base.prompt.md',
                },
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath: 'override/.github/instructions/shared.instructions.md',
                    displayPath: 'override/instructions/shared.instructions.md',
                    artifactPath: 'shared.instructions.md',
                    absolutePath: '/repo1/override/.github/instructions/shared.instructions.md',
                },
            ],
            currentActiveRecords: [
                {
                    repoId: 'repo1',
                    artifactType: 'prompts',
                    repoRelativePath: 'base/.github/prompts/base.prompt.md',
                    displayPath: 'base/prompts/base.prompt.md',
                    artifactPath: 'base.prompt.md',
                    absolutePath: '/repo1/base/.github/prompts/base.prompt.md',
                },
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath: 'override/.github/instructions/shared.instructions.md',
                    displayPath: 'override/instructions/shared.instructions.md',
                    artifactPath: 'shared.instructions.md',
                    absolutePath: '/repo1/override/.github/instructions/shared.instructions.md',
                },
            ],
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile('prompts/base.prompt.md', 'repo1', 'base'),
                    makeEffectiveFile('instructions/shared.instructions.md', 'repo1', 'override'),
                ],
                {},
                undefined,
                {},
                treeSummaryCache,
            ),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();
        assert.strictEqual(String(repoItem.description), '(2/3)');

        const baseLayer = provider
            .getChildren(repoItem)
            .find((child) => String(child.label) === 'base');
        assert.ok(baseLayer, 'expected base layer to render from available inventory');
        assert.strictEqual(String(baseLayer?.description), '(1/2)');

        const artifactChildren = provider.getChildren(baseLayer!);
        assert.deepStrictEqual(
            artifactChildren.map((child) => String(child.label)),
            ['instructions', 'prompts'],
        );

        const instructionsItem = artifactChildren.find(
            (child) => String(child.label) === 'instructions',
        );
        const promptsItem = artifactChildren.find((child) => String(child.label) === 'prompts');

        assert.strictEqual(String(instructionsItem?.description), '(0/1, plugin)');
        assert.strictEqual(String(promptsItem?.description), '(1/1, settings)');
    });

    test('LTV-CAP-01: layer tooltip includes capability metadata when available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const filesWithCapability = [
            {
                ...makeEffectiveFile('instructions/a.md'),
                sourceCapabilityId: 'sdlc-traceability',
                sourceCapabilityName: 'SDLC Traceability',
                sourceCapabilityDescription: 'Traceability metadata capability.',
                sourceCapabilityLicense: 'MIT',
            },
        ];

        const provider = new LayersTreeViewProvider(
            makeState(config, filesWithCapability),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.strictEqual(
            extractTooltipText(layerItem.tooltip),
            joinTooltip(
                '**SDLC Traceability**',
                [
                    'Capability ID: `sdlc-traceability`',
                    'License: `MIT`',
                    'Repository: `repo1`',
                    'Layer: `.`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Traceability metadata capability.*',
            ),
        );
    });

    test('LTV-CAP-02: layer tooltip falls back to capability id when name is absent', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const filesWithCapability = [
            {
                ...makeEffectiveFile('instructions/a.md'),
                sourceCapabilityId: 'sdlc-traceability',
            },
        ];

        const provider = new LayersTreeViewProvider(
            makeState(config, filesWithCapability),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.strictEqual(
            extractTooltipText(layerItem.tooltip),
            joinTooltip('**sdlc-traceability**', [
                'Capability ID: `sdlc-traceability`',
                'Repository: `repo1`',
                'Layer: `.`',
                'Instructions: 0/0 active',
                'Prompts: 0/0 active',
                'Agents: 0/0 active',
                'Skills: 0/0 active',
                'Hooks: 0/0 active',
            ]),
        );
    });

    test('LTV-CAP-03: layer tooltip uses state capability map when layer has no effective files', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const capabilityByLayer = {
            'repo1/.': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
                description: 'Capability metadata sourced from layer state.',
                license: 'MIT',
            },
        };

        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.strictEqual(
            extractTooltipText(layerItem.tooltip),
            joinTooltip(
                '**SDLC Traceability**',
                [
                    'Capability ID: `sdlc-traceability`',
                    'License: `MIT`',
                    'Repository: `repo1`',
                    'Layer: `.`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Capability metadata sourced from layer state.*',
            ),
        );
    });

    test('LTV-CAP-04: disabled layer still shows capability tooltip from state map', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ enabled: false });
        const capabilityByLayer = {
            'repo1/.': {
                id: 'communication',
                name: 'Communication',
                description: 'Conversation quality and response structure guidance.',
                license: 'MIT',
            },
        };

        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.strictEqual(layerItem.checkboxState, 0, 'layer should render as disabled');
        assert.strictEqual(
            extractTooltipText(layerItem.tooltip),
            joinTooltip(
                '**Communication**',
                [
                    'Capability ID: `communication`',
                    'License: `MIT`',
                    'Repository: `repo1`',
                    'Layer: `.`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Conversation quality and response structure guidance.*',
            ),
        );
    });

    test('LTV-GOV-01: governed capabilities surface compliant governance context in flat mode', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'standards/sdlc' }],
        };
        const capabilityByLayer = {
            'repo1/standards/sdlc': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
            },
        };
        const state = makeState(config, [], capabilityByLayer);
        (state as { governanceContract?: unknown }).governanceContract = {
            requiredCapabilities: [{ repoId: 'repo1', path: 'standards/sdlc' }],
            severity: 'warn',
        };
        (state as { governanceCompliance?: unknown }).governanceCompliance = {
            status: 'compliant',
            severity: 'warn',
            activeProfile: 'default',
            activeProfileLocked: false,
            allowedProfiles: [],
            lockedProfiles: [],
            violations: [],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const [layerItem] = provider.getChildren();

        assert.ok(String(layerItem.description).includes('governed'));
        assert.ok(
            extractTooltipText(layerItem.tooltip).includes(
                'Governance: compliant (severity: warn)',
            ),
        );
        assert.ok(
            extractTooltipText(layerItem.tooltip).includes('Governance Rule: required capability'),
        );
    });

    test('LTV-GOV-02: violating capabilities surface stable governance violation details', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'standards/sdlc', enabled: false }],
        };
        const capabilityByLayer = {
            'repo1/standards/sdlc': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
            },
        };
        const state = makeState(config, [], capabilityByLayer);
        (state as { governanceContract?: unknown }).governanceContract = {
            requiredCapabilities: [{ repoId: 'repo1', path: 'standards/sdlc' }],
            severity: 'error',
        };
        (state as { governanceCompliance?: unknown }).governanceCompliance = {
            status: 'non-compliant',
            severity: 'error',
            activeProfile: 'default',
            activeProfileLocked: false,
            allowedProfiles: [],
            lockedProfiles: [],
            violations: [
                {
                    id: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::repo1::standards/sdlc',
                    message:
                        'Required capability "repo1/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
                    repoId: 'repo1',
                    path: 'standards/sdlc',
                },
            ],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const [layerItem] = provider.getChildren();

        assert.ok(String(layerItem.description).includes('governance non-compliant'));
        assert.ok(
            extractTooltipText(layerItem.tooltip).includes(
                'Governance: non-compliant (severity: error)',
            ),
        );
        assert.ok(
            extractTooltipText(layerItem.tooltip).includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::repo1::standards/sdlc] Required capability "repo1/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
            ),
        );
    });

    test('LTV-CAP-06: nested layer tooltip includes repository label and configured path', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': {
                id: 'devtools',
                name: 'Developer Tools',
                description: 'Developer workflow guidance.',
                license: 'MIT',
            },
        };

        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        const [layerItem] = provider.getChildren();

        assert.strictEqual(
            extractTooltipText(layerItem.tooltip),
            joinTooltip(
                '**Developer Tools**',
                [
                    'Capability ID: `devtools`',
                    'License: `MIT`',
                    'Repository: `CoreMeta`',
                    'Layer: `capabilities/devtools`',
                    'Instructions: 0/0 active',
                    'Prompts: 0/0 active',
                    'Agents: 0/0 active',
                    'Skills: 0/0 active',
                    'Hooks: 0/0 active',
                ],
                '*Developer workflow guidance.*',
            ),
        );
    });

    test('LTV-CAP-05: layer items expose the capability detail command', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'flat',
        );

        const [layerItem] = provider.getChildren();

        assert.strictEqual(layerItem.command?.command, 'metaflow.openCapabilityDetails');
        assert.strictEqual(layerItem.command?.arguments?.length, 1);
    });

    test('LTV-ID-01: flat and tree layer nodes use distinct IDs for the same capability', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };

        const flatProvider = new LayersTreeViewProvider(makeState(config), () => 'flat');
        const treeProvider = new LayersTreeViewProvider(makeState(config), () => 'tree');

        const [flatItem] = flatProvider.getChildren();
        const [repoItem] = treeProvider.getChildren();
        const [capabilitiesFolder] = treeProvider.getChildren(repoItem);
        const [treeItem] = treeProvider.getChildren(capabilitiesFolder);

        assert.strictEqual(flatItem.id, 'flat:layer:repo1:capabilities/devtools');
        assert.strictEqual(treeItem.id, 'tree:layer:repo1:capabilities/devtools');
        assert.notStrictEqual(
            flatItem.id,
            treeItem.id,
            'flat and tree nodes should not share the same VS Code identity',
        );
    });

    test('LTV-ID-02: flat root layers from different repos use distinct IDs', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [
                { id: 'repo1', name: 'CoreMeta', localPath: '/repo1' },
                { id: 'repo2', name: 'TeamMeta', localPath: '/repo2' },
            ],
            layerSources: [
                { repoId: 'repo1', path: '.' },
                { repoId: 'repo2', path: '.' },
            ],
        };

        const provider = new LayersTreeViewProvider(makeState(config), () => 'flat');
        const items = provider.getChildren();

        assert.strictEqual(items[0].id, 'flat:layer:repo1:.');
        assert.strictEqual(items[1].id, 'flat:layer:repo2:.');
        assert.notStrictEqual(
            items[0].id,
            items[1].id,
            'repo-scoped flat layer identities should remain unique',
        );
    });

    test('LTV-ID-03: flat layer items preserve stable layerPath identity for command routing', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };

        const provider = new LayersTreeViewProvider(makeState(config), () => 'flat');
        const [layerItem] = provider.getChildren();

        assert.strictEqual((layerItem as { layerPath?: unknown }).layerPath, '.');
    });

    // ── Name-first display ─────────────────────────────────────────────────────

    test('LTV-NF-01: flat mode – capability name as primary label when available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': {
                id: 'devtools',
                name: 'Developer Tools',
                experimental: true,
            },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        const [layerItem] = provider.getChildren();
        assert.strictEqual(
            String(layerItem.label),
            'Developer Tools',
            'label should be capability name',
        );
        assert.ok(
            String(layerItem.description).includes('capabilities/devtools'),
            `description should include configured path, got: ${layerItem.description}`,
        );
        assert.ok(
            String(layerItem.description).includes('CoreMeta'),
            `description should still include repo label, got: ${layerItem.description}`,
        );
        assert.ok(
            String(layerItem.description).includes('experimental'),
            `description should include experimental marker, got: ${layerItem.description}`,
        );
    });

    test('LTV-NF-02: flat mode – path-based label when no capability name', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const provider = new LayersTreeViewProvider(makeState(config, []), () => 'flat');

        const [layerItem] = provider.getChildren();
        assert.strictEqual(
            String(layerItem.label),
            'capabilities/devtools',
            'label should remain path-based without capability name',
        );
        assert.strictEqual(
            layerItem.description,
            '(0/0, CoreMeta)',
            'description should include summary and repo label',
        );
    });

    test('LTV-NF-02b: flat mode hides grouping-only branch directories with descendant capabilities', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'general/devtools' },
                { repoId: 'repo1', path: 'general/devtools/dev-tools' },
            ],
        };
        const capabilityByLayer = {
            'repo1/general/devtools/dev-tools': { id: 'dev-tools', name: 'Dev Tools' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        const labels = provider.getChildren().map((item) => String(item.label));

        assert.deepStrictEqual(labels, ['Dev Tools']);
    });

    test('LTV-NF-03: tree mode – leaf node uses capability name as label', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': { id: 'devtools', name: 'Developer Tools' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const capabilitiesFolder = provider.getChildren(repoItem)[0];
        const leafNode = provider.getChildren(capabilitiesFolder)[0];

        assert.strictEqual(
            String(leafNode.label),
            'Developer Tools',
            'tree leaf should use capability name',
        );
        assert.strictEqual(
            String(leafNode.description),
            '(0/0)',
            `tree-mode description should omit redundant path and repo label, got: ${leafNode.description}`,
        );
    });

    test('LTV-NF-04: tree mode – folder-only node keeps path-based label', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools' },
                { repoId: 'repo1', path: 'capabilities/comms' },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': { name: 'Developer Tools' },
            'repo1/capabilities/comms': { name: 'Communications' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((c) => c.contextValue === 'layerFolder');
        assert.ok(capabilitiesFolder, 'expected a folder-only node');
        assert.strictEqual(
            String(capabilitiesFolder.label),
            'capabilities',
            'folder-only node should keep path label',
        );
    });

    test('LTV-NF-04b: tree mode – folder-only node prefers directory METAFLOW metadata', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltv-directory-metadata-'));

        try {
            const capabilitiesFolder = path.join(repoRoot, 'capabilities');
            fs.mkdirSync(capabilitiesFolder, { recursive: true });
            fs.writeFileSync(
                path.join(capabilitiesFolder, 'METAFLOW.md'),
                '---\nname: Capability Catalog\ndescription: Shared grouping metadata for capability folders.\n---\n',
                'utf-8',
            );

            const config = {
                metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: repoRoot }],
                layerSources: [
                    { repoId: 'repo1', path: 'capabilities/devtools' },
                    { repoId: 'repo1', path: 'capabilities/comms' },
                ],
            };
            const capabilityByLayer = {
                'repo1/capabilities/devtools': { name: 'Developer Tools' },
                'repo1/capabilities/comms': { name: 'Communications' },
            };
            const provider = new LayersTreeViewProvider(
                makeState(config, [], capabilityByLayer),
                () => 'tree',
            );

            const repoItem = provider.getChildren()[0];
            const capabilitiesFolderItem = provider
                .getChildren(repoItem)
                .find((c) => c.contextValue === 'layerFolder');

            assert.ok(capabilitiesFolderItem, 'expected a folder-only node');
            assert.strictEqual(String(capabilitiesFolderItem.label), 'Capability Catalog');
            assert.strictEqual(
                extractTooltipText(capabilitiesFolderItem.tooltip),
                joinTooltip(
                    '**Capability Catalog**',
                    [
                        'Repository: `CoreMeta`',
                        'Layer: `capabilities`',
                        'Branch state: all descendant capabilities enabled',
                        'Instructions: 0/0 active',
                        'Prompts: 0/0 active',
                        'Agents: 0/0 active',
                        'Skills: 0/0 active',
                        'Hooks: 0/0 active',
                    ],
                    '*Shared grouping metadata for capability folders.*',
                ),
            );
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    test('LTV-NF-05: built-in capability uses capability name when metadata available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const capabilityByLayer = {
            '__metaflow_builtin__/.': { name: 'MetaFlow AI Metadata' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [makeEffectiveFile('instructions/a.md', '__metaflow_builtin__', '.')],
                capabilityByLayer,
                {
                    enabled: true,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
            ),
            () => 'tree',
        );

        const repoItems = provider.getChildren();
        const builtInRepo = repoItems.find((item) => item.repoId === '__metaflow_builtin__');
        assert.ok(builtInRepo, 'expected built-in repo node');
        const builtInLayer = provider.getChildren(builtInRepo)[0];
        assert.strictEqual(
            String(builtInLayer.label),
            'MetaFlow AI Metadata',
            'built-in should use capability name',
        );
        assert.strictEqual(String(builtInLayer.description), '(0/0)');
    });

    test('LTV-NF-06: root layer shows capability name without path prefix in description', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const capabilityByLayer = {
            'repo1/.': { name: 'Core Standards' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        const [layerItem] = provider.getChildren();
        assert.strictEqual(
            String(layerItem.label),
            'Core Standards',
            'root layer should use capability name',
        );
        assert.strictEqual(
            layerItem.description,
            '(0/0, CoreMeta)',
            'root layer description should include summary and repo context',
        );
    });

    test('LTV-NF-07: flat mode omits repo-disabled capabilities', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': { name: 'Developer Tools' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            [],
            'flat mode should treat a disabled repo as an override that hides its capabilities',
        );
    });

    test('LTV-NF-08: tree mode omits disabled repo roots from capabilities', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools': { name: 'Developer Tools' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'tree',
        );

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            [],
            'tree mode should not show the disabled repo root in the capabilities area',
        );
    });

    test('LTV-NF-09: repo re-enable restores remembered layer check states', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const capabilityByLayer = {
            'repo1/capabilities/devtools/active': { name: 'Active Tooling' },
            'repo1/capabilities/devtools/inactive': { name: 'Inactive Tooling' },
        };
        const layerSources = [
            { repoId: 'repo1', path: 'capabilities/devtools/active', enabled: true },
            { repoId: 'repo1', path: 'capabilities/devtools/inactive', enabled: false },
        ];
        const disabledConfig = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1', enabled: false }],
            layerSources,
        };
        const enabledConfig = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1', enabled: true }],
            layerSources,
        };

        const disabledProvider = new LayersTreeViewProvider(
            makeState(disabledConfig, [], capabilityByLayer),
            () => 'flat',
        );
        assert.deepStrictEqual(
            disabledProvider.getChildren().map((item) => String(item.label)),
            [],
            'disabled repo should temporarily hide all flat-mode capabilities',
        );

        const enabledProvider = new LayersTreeViewProvider(
            makeState(enabledConfig, [], capabilityByLayer),
            () => 'flat',
        );
        const restoredLayers = enabledProvider.getChildren();
        assert.deepStrictEqual(
            restoredLayers.map((item) => `${String(item.label)}:${item.checkboxState}`),
            ['Active Tooling:1', 'Inactive Tooling:0'],
            're-enabling the repo should reveal the previous per-layer checked states',
        );
    });

    test('LTV-PCT-01: pending leaf toggle renders immediately before config refresh', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/alpha', enabled: false },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/alpha': { name: 'Alpha Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        assert.strictEqual(provider.getChildren()[0]?.checkboxState, 0);

        provider.setPendingCapabilityCheckboxState({
            kind: 'layer',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools/alpha',
            checked: true,
        });

        assert.strictEqual(
            provider.getChildren()[0]?.checkboxState,
            1,
            'pending user intent should keep the clicked capability checked',
        );
    });

    test('LTV-PCT-02: pending branch toggle applies to descendant capability rows', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/alpha', enabled: false },
                { repoId: 'repo1', path: 'capabilities/devtools/beta', enabled: false },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/alpha': { name: 'Alpha Tooling' },
            'repo1/capabilities/devtools/beta': { name: 'Beta Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        provider.setPendingCapabilityCheckboxState({
            kind: 'branch',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools',
            checked: true,
        });

        assert.deepStrictEqual(
            provider.getChildren().map((item) => `${String(item.label)}:${item.checkboxState}`),
            ['Alpha Tooling:1', 'Beta Tooling:1'],
        );
    });

    test('LTV-PCT-03: latest pending click wins between branch and leaf toggles', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/alpha', enabled: false },
                { repoId: 'repo1', path: 'capabilities/devtools/beta', enabled: false },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/alpha': { name: 'Alpha Tooling' },
            'repo1/capabilities/devtools/beta': { name: 'Beta Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        provider.setPendingCapabilityCheckboxState({
            kind: 'branch',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools',
            checked: true,
        });
        provider.setPendingCapabilityCheckboxState({
            kind: 'layer',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools/alpha',
            checked: false,
        });

        assert.deepStrictEqual(
            provider.getChildren().map((item) => `${String(item.label)}:${item.checkboxState}`),
            ['Alpha Tooling:0', 'Beta Tooling:1'],
        );
    });

    test('LTV-PCT-04: clearing an older refresh batch preserves newer pending clicks', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/alpha', enabled: false },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/alpha': { name: 'Alpha Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [], capabilityByLayer),
            () => 'flat',
        );

        provider.setPendingCapabilityCheckboxState({
            kind: 'layer',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools/alpha',
            checked: true,
        });
        const firstBatchSequence = provider.getPendingCapabilityCheckboxSequence();
        provider.setPendingCapabilityCheckboxState({
            kind: 'layer',
            repoId: 'repo1',
            layerPath: 'capabilities/devtools/alpha',
            checked: false,
        });

        provider.clearPendingCapabilityCheckboxStates(firstBatchSequence);

        assert.strictEqual(
            provider.getChildren()[0]?.checkboxState,
            0,
            'newer pending state should survive clearing an older batch',
        );
    });

    test('LTV-SEA-01: tree mode expands one capability-folder depth per click and stops before artifact rows', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [{ repoId: 'repo1', path: 'capabilities/devtools/tooling' }],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/tooling': { name: 'Developer Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile(
                        'instructions/a.md',
                        'repo1',
                        'capabilities/devtools/tooling',
                    ),
                    makeEffectiveFile('prompts/b.md', 'repo1', 'capabilities/devtools/tooling'),
                    makeEffectiveFile('agents/c.md', 'repo1', 'capabilities/devtools/tooling'),
                    makeEffectiveFile('skills/d.md', 'repo1', 'capabilities/devtools/tooling'),
                ],
                capabilityByLayer,
            ),
            () => 'tree',
        );

        assert.strictEqual(provider.getExpandAllStrategy(), 'staged');

        const plan = provider.getStagedExpandPlan();

        assert.deepStrictEqual(
            plan.stageOne.map((item) => String(item.label)),
            ['CoreMeta'],
        );
        assert.deepStrictEqual(
            plan.stageTwo.map((item) => String(item.label)),
            ['capabilities'],
        );
        assert.ok(
            Array.isArray(plan.stages) &&
                plan.stages
                    .map((stage) => stage.map((item) => String(item.label)))
                    .every(
                        (labels) => !labels.includes('instructions') && !labels.includes('prompts'),
                    ),
            'staged expansion should never include artifact-type nodes',
        );
        assert.deepStrictEqual(
            plan.stages?.map((stage) => stage.map((item) => String(item.label))),
            [['CoreMeta'], ['capabilities'], ['devtools']],
            'each click should reveal one more capability-folder depth before the capability node becomes visible',
        );
        assert.ok(
            !plan.stageOne.concat(plan.stageTwo).some((item) => String(item.label) === 'skills'),
            'skill folders should never be auto-expanded by the staged plan',
        );
    });

    test('LTV-SEA-01b: tree keeps root metadata separate from top-level capability folders', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: '.' },
                { repoId: 'repo1', path: 'capabilities/devtools/tooling' },
            ],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, [
                makeEffectiveFile('instructions/a.md', 'repo1', '.'),
                makeEffectiveFile('prompts/b.md', 'repo1', '.'),
                makeEffectiveFile('agents/c.md', 'repo1', '.'),
                makeEffectiveFile('skills/d.md', 'repo1', '.'),
                makeEffectiveFile(
                    'instructions/tooling.md',
                    'repo1',
                    'capabilities/devtools/tooling',
                ),
            ]),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const repoChildren = provider.getChildren(repoItem);
        assert.deepStrictEqual(
            repoChildren.map((item) => String(item.label)),
            ['root', 'capabilities'],
            'root should be a repo-level metadata node, not the parent of every capability folder',
        );

        const rootItem = repoChildren.find((item) => String(item.label) === 'root');
        assert.ok(rootItem, 'root layer should be reachable');
        const rootChildren = provider.getChildren(rootItem);

        assert.deepStrictEqual(
            rootChildren.map((item) => String(item.label)),
            ['instructions', 'prompts', 'agents', 'skills'],
            'root should show only repo-level artifact browse rows',
        );
        assert.ok(
            rootChildren.every((item) =>
                String(item.contextValue).startsWith('layerArtifactType:'),
            ),
            'root children should be artifact browse rows',
        );

        const capabilitiesItem = repoChildren.find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesItem, 'capabilities folder should be a root sibling');
        const capabilitiesChildren = provider.getChildren(capabilitiesItem);
        const devtoolsItem = capabilitiesChildren.find((item) => String(item.label) === 'devtools');
        assert.ok(devtoolsItem, 'devtools branch should be reachable');
        const toolingItem = provider
            .getChildren(devtoolsItem)
            .find((item) => String(item.label) === 'tooling');
        assert.ok(toolingItem, 'leaf capability should be reachable');
        assert.deepStrictEqual(
            provider.getChildren(toolingItem).map((item) => String(item.label)),
            ['instructions'],
            'leaf capability should still expose artifact browse rows',
        );
    });

    test('LTV-SEA-01c: root layer counts stay scoped to repo-root metadata', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: '.' },
                { repoId: 'repo1', path: 'capabilities/devtools/tooling' },
            ],
        };
        const treeSummaryCache = {
            ...makeEmptyTreeSummaryCache(),
            availableRecords: [
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath: '.github/instructions/root.instructions.md',
                    displayPath: 'instructions/root.instructions.md',
                    artifactPath: 'root.instructions.md',
                    absolutePath: '/repo1/.github/instructions/root.instructions.md',
                },
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath:
                        'capabilities/devtools/tooling/.github/instructions/tooling.instructions.md',
                    displayPath: 'capabilities/devtools/tooling/instructions/tooling.instructions.md',
                    artifactPath: 'tooling.instructions.md',
                    absolutePath:
                        '/repo1/capabilities/devtools/tooling/.github/instructions/tooling.instructions.md',
                },
            ],
            currentActiveRecords: [
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath: '.github/instructions/root.instructions.md',
                    displayPath: 'instructions/root.instructions.md',
                    artifactPath: 'root.instructions.md',
                    absolutePath: '/repo1/.github/instructions/root.instructions.md',
                },
                {
                    repoId: 'repo1',
                    artifactType: 'instructions',
                    repoRelativePath:
                        'capabilities/devtools/tooling/.github/instructions/tooling.instructions.md',
                    displayPath: 'capabilities/devtools/tooling/instructions/tooling.instructions.md',
                    artifactPath: 'tooling.instructions.md',
                    absolutePath:
                        '/repo1/capabilities/devtools/tooling/.github/instructions/tooling.instructions.md',
                },
            ],
        };

        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile('instructions/root.instructions.md', 'repo1', '.'),
                    makeEffectiveFile(
                        'instructions/tooling.instructions.md',
                        'repo1',
                        'capabilities/devtools/tooling',
                    ),
                ],
                {},
                undefined,
                {},
                treeSummaryCache,
            ),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const rootItem = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'root');
        assert.ok(rootItem, 'root layer should be reachable');
        assert.strictEqual(String(rootItem?.description), '(1/1)');

        const instructionsItem = provider
            .getChildren(rootItem!)
            .find((item) => String(item.label) === 'instructions');
        assert.ok(instructionsItem, 'root instructions node should exist');
        assert.strictEqual(String(instructionsItem?.description), '(1/1, plugin)');

        const capabilitiesItem = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesItem, 'capabilities branch should be reachable');
        const devtoolsItem = provider
            .getChildren(capabilitiesItem!)
            .find((item) => String(item.label) === 'devtools');
        assert.ok(devtoolsItem, 'devtools branch should be reachable');
        const toolingItem = provider
            .getChildren(devtoolsItem!)
            .find((item) => String(item.label) === 'tooling');
        assert.ok(toolingItem, 'tooling capability should be reachable');
        assert.strictEqual(String(toolingItem?.description), '(1/1)');
    });

    test('LTV-SEA-01d: tree omits root when the repo root has no metadata files', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: '.' },
                { repoId: 'repo1', path: 'capabilities/devtools/tooling' },
            ],
        };

        const provider = new LayersTreeViewProvider(
            makeState(config, [
                makeEffectiveFile(
                    'instructions/tooling.instructions.md',
                    'repo1',
                    'capabilities/devtools/tooling',
                ),
            ]),
            () => 'tree',
        );

        const repoItem = provider.getChildren()[0];
        const repoChildren = provider.getChildren(repoItem);
        assert.deepStrictEqual(
            repoChildren.map((item) => String(item.label)),
            ['capabilities'],
            'empty root layer should be hidden when only descendant capabilities have metadata',
        );
    });

    test('LTV-SEA-02: flat mode keeps recursive expand behavior', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const provider = new LayersTreeViewProvider(
            makeState(makeMultiRepoConfig(), []),
            () => 'flat',
        );

        assert.strictEqual(provider.getExpandAllStrategy(), 'recursive');
        assert.deepStrictEqual(provider.getStagedExpandPlan(), { stageOne: [], stageTwo: [] });
    });

    test('LTV-SCH-01: tree search keeps matching capabilities without expanding artifact rows', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', name: 'CoreMeta', localPath: '/repo1' }],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/tooling' },
                { repoId: 'repo1', path: 'capabilities/runtime/service' },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/tooling': { name: 'Developer Tooling' },
            'repo1/capabilities/runtime/service': { name: 'Runtime Service' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile(
                        'instructions/tooling.md',
                        'repo1',
                        'capabilities/devtools/tooling',
                    ),
                    makeEffectiveFile(
                        'instructions/service.md',
                        'repo1',
                        'capabilities/runtime/service',
                    ),
                ],
                capabilityByLayer,
            ),
            () => 'tree',
        );

        provider.setSearchQuery('developer');

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            ['Developer Tooling'],
            'only matching capability rows should remain visible',
        );
        assert.strictEqual(
            provider.getChildren()[0].collapsibleState,
            0,
            'matching capability should not be expandable into artifact rows while filtered',
        );
        assert.deepStrictEqual(
            provider.getChildren(provider.getChildren()[0]).map((item) => String(item.label)),
            [],
            'capabilities search should not reveal artifact rows under matching capabilities',
        );

        provider.setSearchQuery('service');
        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            ['Runtime Service'],
            'previous matching capabilities should be removed as the query changes',
        );

        provider.setSearchQuery('instructions');
        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            [],
            'artifact-only matches should not keep non-matching capabilities visible',
        );
    });

    test('LTV-SCH-02: tree search omits disabled repository and layer matches', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [
                { id: 'repo1', name: 'CoreMeta', localPath: '/repo1' },
                { id: 'repo2', name: 'PausedMeta', localPath: '/repo2', enabled: false },
            ],
            layerSources: [
                { repoId: 'repo1', path: 'capabilities/devtools/active' },
                { repoId: 'repo2', path: 'capabilities/devtools/disabled-repo' },
                { repoId: 'repo1', path: 'capabilities/devtools/disabled-layer', enabled: false },
            ],
        };
        const capabilityByLayer = {
            'repo1/capabilities/devtools/active': { name: 'Active Tooling' },
            'repo2/capabilities/devtools/disabled-repo': { name: 'Disabled Repo Tooling' },
            'repo1/capabilities/devtools/disabled-layer': { name: 'Disabled Layer Tooling' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [
                    makeEffectiveFile(
                        'instructions/active.md',
                        'repo1',
                        'capabilities/devtools/active',
                    ),
                    makeEffectiveFile(
                        'instructions/disabled-repo.md',
                        'repo2',
                        'capabilities/devtools/disabled-repo',
                    ),
                    makeEffectiveFile(
                        'instructions/disabled-layer.md',
                        'repo1',
                        'capabilities/devtools/disabled-layer',
                    ),
                ],
                capabilityByLayer,
            ),
            () => 'tree',
        );

        provider.setSearchQuery('tooling');

        assert.deepStrictEqual(
            provider.getChildren().map((item) => String(item.label)),
            ['Active Tooling'],
            'search should only surface active capability matches',
        );
    });
});
