/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS require needed for Mocha proxyquire module rewiring */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExcludableArtifactType } from '@metaflow/engine';

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
    artifactType?: ExcludableArtifactType;
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
                { id?: string; name?: string; description?: string; license?: string }
            >;
            repoMetadataById?: Record<string, { name?: string; description?: string }>;
            onDidChange: { event: (_l: unknown) => { dispose: () => void } };
        },
        modeResolver?: () => string,
    ) => {
        getChildren(element?: MockLayerTreeItem): MockLayerTreeItem[];
        getParent(element: MockLayerTreeItem): MockLayerTreeItem | undefined;
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
        excludedTypes: ExcludableArtifactType[];
        injection: Partial<
            Record<'instructions' | 'prompts' | 'agents' | 'skills', 'settings' | 'synchronize'>
        >;
        repoInjection: Partial<
            Record<'instructions' | 'prompts' | 'agents' | 'skills', 'settings' | 'synchronize'>
        >;
        capabilityInjection: Partial<
            Record<'instructions' | 'prompts' | 'agents' | 'skills', 'settings' | 'synchronize'>
        >;
        globalInjection: Partial<
            Record<'instructions' | 'prompts' | 'agents' | 'skills', 'settings' | 'synchronize'>
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
        { id?: string; name?: string; description?: string; license?: string }
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

    test('LTV-AT-03: excluded type renders Unchecked, non-excluded renders Checked', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['prompts'] });
        // prompts is excluded → not in effectiveFiles; other types are present
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('agents/c.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const promptsItem = artifactChildren.find((c) => String(c.label) === 'prompts');
        const instructionsItem = artifactChildren.find((c) => String(c.label) === 'instructions');

        assert.ok(promptsItem, 'prompts item should exist');
        assert.ok(instructionsItem, 'instructions item should exist');

        // TreeItemCheckboxState.Unchecked = 0, Checked = 1
        assert.strictEqual(promptsItem?.checkboxState, 0, 'prompts should be Unchecked (excluded)');
        assert.strictEqual(
            instructionsItem?.checkboxState,
            1,
            'instructions should be Checked (not excluded)',
        );
    });

    test('LTV-AT-03b: repo item tooltip shows repository status', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();

        assert.strictEqual(
            extractTooltipText(repoItem.tooltip),
            joinTooltip('**repo1**', [
                'Status: disabled',
                'Repository ID: `repo1`',
                'Root: `/repo1`',
                'Instructions: 0/0 active',
                'Prompts: 0/0 active',
                'Agents: 0/0 active',
                'Skills: 0/0 active',
            ]),
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

    test('LTV-AT-06: artifact type description includes injection mode and exclusion state', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['agents'] });
        // agents is excluded → not in effectiveFiles; other types present
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('prompts/b.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const agentsItem = artifactChildren.find((c) => String(c.label) === 'agents');
        const skillsItem = artifactChildren.find((c) => String(c.label) === 'skills');

        assert.strictEqual(agentsItem?.description, '(0, settings, excluded)');
        assert.strictEqual(skillsItem?.description, '(0, settings)');
    });

    test('LTV-AT-06b: artifact type tooltip explains inclusion, exclusion, and injection state', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['agents'] });
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('prompts/b.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const agentsItem = artifactChildren.find((c) => String(c.label) === 'agents');
        const instructionsItem = artifactChildren.find((c) => String(c.label) === 'instructions');

        assert.strictEqual(
            extractTooltipText(agentsItem?.tooltip),
            joinTooltip('**Artifact Type**: agents', [
                'Status: excluded from this layer',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: settings (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
            ]),
        );
        assert.strictEqual(
            extractTooltipText(instructionsItem?.tooltip),
            joinTooltip('**Artifact Type**: instructions', [
                'Status: included in this layer',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: settings (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
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
                'Status: included in this layer',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (capability override)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
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
                'Status: included in this layer',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (repo default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
            ]),
        );
        assert.strictEqual(
            extractTooltipText(skillsItem?.tooltip),
            joinTooltip('**Artifact Type**: skills', [
                'Status: included in this layer',
                'Capability status: enabled',
                'Repository status: enabled',
                'Injection: synchronize (global default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
            ]),
        );
    });

    test('LTV-AT-07: no config – root returns empty', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const provider = new LayersTreeViewProvider(makeState(undefined), () => 'tree');
        const children = provider.getChildren();
        assert.strictEqual(children.length, 0);
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
        assert.strictEqual(instructionsItem?.description, '(0, settings, capability disabled)');
        assert.strictEqual(
            extractTooltipText(instructionsItem?.tooltip),
            joinTooltip('**Artifact Type**: instructions', [
                'Status: included in this layer',
                'Capability status: disabled',
                'Repository status: enabled',
                'Injection: settings (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
            ]),
        );
    });

    test('LTV-AT-08b: repo-disabled layer remains browseable and marks artifact nodes accordingly', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = {
            metadataRepos: [{ id: 'repo1', localPath: '/repo1', enabled: false }],
            layerSources: [{ repoId: 'repo1', path: '.' }],
        };
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES),
            () => 'tree',
        );

        const [repoItem] = provider.getChildren();
        const [layerItem] = provider.getChildren(repoItem);
        assert.strictEqual(
            layerItem.collapsibleState,
            1,
            'repo-disabled layer should stay collapsible when artifact content exists',
        );

        const children = provider.getChildren(layerItem);
        const instructionsItem = children.find((child) => String(child.label) === 'instructions');
        assert.ok(
            instructionsItem,
            'repo-disabled layer should still expose artifact-type children',
        );
        assert.strictEqual(instructionsItem?.description, '(0, settings, repo disabled)');
        assert.strictEqual(
            extractTooltipText(instructionsItem?.tooltip),
            joinTooltip('**Artifact Type**: instructions', [
                'Status: included in this layer',
                'Capability status: enabled',
                'Repository status: disabled',
                'Injection: settings (built-in default)',
                'Repository: `repo1`',
                'Layer: `.`',
                'Toggle the checkbox to change whether this artifact type participates in the layer.',
            ]),
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
        // No known-type files and no excludedTypes → not collapsible
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
                [makeEffectiveFile('instructions/a.md', '__metaflow_builtin__', '.github')],
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
                ],
                '*Bundled MetaFlow metadata projected from the extension.*',
            ),
        );

        const builtInLayer = provider.getChildren(builtInRepo)[0];
        assert.strictEqual(builtInLayer.repoId, '__metaflow_builtin__');
        assert.strictEqual(String(builtInLayer.label), '.github');
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
                        '.github',
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

    test('LTV-AT-11: mixed layer/folder node shows descendant layers and artifact toggles', () => {
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

        assert.ok(childLabels.includes('devtools'), 'should include descendant layer folder');
        assert.ok(
            childLabels.includes('instructions'),
            'should include artifact type from capabilities layer',
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

    test('LTV-AT-13: parent LayerItem description shows excluded count when some types excluded', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['prompts', 'agents'] });
        const files = [makeEffectiveFile('instructions/a.md'), makeEffectiveFile('skills/d.md')];
        const provider = new LayersTreeViewProvider(makeState(config, files), () => 'tree');

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(
            String(layerItem.description).includes('2 excluded'),
            `expected description to mention excluded count, got: ${layerItem.description}`,
        );
    });

    test('LTV-AT-14: parent LayerItem description omits excluded count when no types excluded', () => {
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

    test('LTV-AT-15: excluded artifact nodes stay toggleable and become expandable when available descendants exist', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['skills'] });
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
            0,
            'excluded artifact node should remain toggleable',
        );
        assert.strictEqual(
            skillsItem?.collapsibleState,
            1,
            'excluded artifact node should expand when browse descendants exist',
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
        const config = makeMultiRepoConfig({ excludedTypes: ['skills'] });
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
                ],
                '*Conversation quality and response structure guidance.*',
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
            'repo1/capabilities/devtools': { id: 'devtools', name: 'Developer Tools' },
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

    test('LTV-NF-05: built-in capability uses capability name when metadata available', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const capabilityByLayer = {
            '__metaflow_builtin__/.github': { name: 'MetaFlow AI Metadata' },
        };
        const provider = new LayersTreeViewProvider(
            makeState(
                config,
                [makeEffectiveFile('instructions/a.md', '__metaflow_builtin__', '.github')],
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

    test('LTV-NF-07: repo-disabled layer shows capability name with disabled in description', () => {
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

        const [layerItem] = provider.getChildren();
        assert.strictEqual(String(layerItem.label), 'Developer Tools');
        assert.ok(
            String(layerItem.description).includes('capabilities/devtools'),
            `description should include path, got: ${layerItem.description}`,
        );
        assert.ok(
            String(layerItem.description).includes('repo disabled'),
            `description should indicate repo disabled, got: ${layerItem.description}`,
        );
    });

    test('LTV-NF-08: tree mode – repo-disabled layer omits redundant path in description', () => {
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

        const repoItem = provider.getChildren()[0];
        const capabilitiesFolder = provider.getChildren(repoItem)[0];
        const leafNode = provider.getChildren(capabilitiesFolder)[0];

        assert.strictEqual(String(leafNode.label), 'Developer Tools');
        assert.strictEqual(
            String(leafNode.description),
            '(0/0, repo disabled)',
            `tree-mode description should keep status but omit path and repo label, got: ${leafNode.description}`,
        );
    });
});
