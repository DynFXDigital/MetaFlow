/* eslint-disable @typescript-eslint/no-var-requires */

import * as assert from 'assert';
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
    tooltip?: string;

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

const mockVscode = {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: MockEventEmitter,
    ThemeIcon: MockThemeIcon,
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
    checkboxState?: number;
    description?: string | boolean;
    collapsibleState?: number;
    pathKey?: string;
    tooltip?: string;
};

type LayersTreeViewModule = {
    LayersTreeViewProvider: new (
        state: {
            config?: unknown;
            effectiveFiles: unknown[];
            capabilityByLayer?: Record<string, { id?: string; name?: string; description?: string; license?: string }>;
            onDidChange: { event: (_l: unknown) => { dispose: () => void } };
        },
        modeResolver?: () => string
    ) => {
        getChildren(element?: MockLayerTreeItem): MockLayerTreeItem[];
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
        isMain: boolean
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

function makeMultiRepoConfig(extraLayerSourceProps?: Partial<{
    enabled: boolean;
    excludedTypes: ExcludableArtifactType[];
}>) {
    return {
        metadataRepos: [{ id: 'repo1', localPath: '/repo1' }],
        layerSources: [{ repoId: 'repo1', path: '.', ...extraLayerSourceProps }],
    };
}

function makeEffectiveFile(
    relativePath: string,
    repoId = 'repo1',
    layerPath = '.'
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
    capabilityByLayer: Record<string, { id?: string; name?: string; description?: string; license?: string }> = {}
) {
    const event = (listener: unknown): { dispose: () => void } => {
        void listener;
        return { dispose: () => {} };
    };

    return {
        config,
        effectiveFiles,
        capabilityByLayer,
        onDidChange: {
            event,
        },
    };
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
            makeState(config, ALL_TYPES_FILES), () => 'tree'
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
        assert.strictEqual(layerItem.collapsibleState, 1, 'leaf layer should be Collapsed in tree mode');
    });

    test('LTV-AT-02: tree mode – leaf LayerItem children are ArtifactTypeLayerItems', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        assert.strictEqual(artifactChildren.length, 4, 'should have 4 artifact type children');
        const labels = artifactChildren.map(c => String(c.label));
        assert.deepStrictEqual(labels, ['instructions', 'prompts', 'agents', 'skills']);
        assert.ok(artifactChildren.every(c => c.contextValue === 'layerArtifactType'));
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
        const provider = new LayersTreeViewProvider(
            makeState(config, files), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const promptsItem = artifactChildren.find(c => String(c.label) === 'prompts');
        const instructionsItem = artifactChildren.find(c => String(c.label) === 'instructions');

        assert.ok(promptsItem, 'prompts item should exist');
        assert.ok(instructionsItem, 'instructions item should exist');

        // TreeItemCheckboxState.Unchecked = 0, Checked = 1
        assert.strictEqual(promptsItem?.checkboxState, 0, 'prompts should be Unchecked (excluded)');
        assert.strictEqual(instructionsItem?.checkboxState, 1, 'instructions should be Checked (not excluded)');
    });

    test('LTV-AT-04: flat mode does not show artifact-type children', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES), () => 'flat'
        );

        const layers = provider.getChildren();
        assert.ok(layers.length > 0, 'expected layer items in flat mode');

        const layerItem = layers[0];
        // In flat mode, layer items have no children
        const children = provider.getChildren(layerItem);
        assert.strictEqual(children.length, 0, 'flat mode layer items should have no children');
    });

    test('LTV-AT-05: ArtifactTypeLayerItem carries correct layerIndex and repoId', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        for (const child of artifactChildren) {
            assert.strictEqual(child.layerIndex, 0, 'layerIndex should be 0 (first layer)');
            assert.strictEqual(child.repoId, 'repo1', 'repoId should match config');
        }
    });

    test('LTV-AT-06: excluded type shows (excluded) description', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['agents'] });
        // agents is excluded → not in effectiveFiles; other types present
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('prompts/b.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(
            makeState(config, files), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        const agentsItem = artifactChildren.find(c => String(c.label) === 'agents');
        const skillsItem = artifactChildren.find(c => String(c.label) === 'skills');

        assert.strictEqual(agentsItem?.description, '(excluded)');
        assert.strictEqual(skillsItem?.description, '');
    });

    test('LTV-AT-07: no config – root returns empty', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const provider = new LayersTreeViewProvider(makeState(undefined), () => 'tree');
        const children = provider.getChildren();
        assert.strictEqual(children.length, 0);
    });

    test('LTV-AT-08: disabled layer – no artifact-type children, LayerItem is not collapsible', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ enabled: false });
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        assert.strictEqual(repoItem.contextValue, 'layerRepo');

        const layers = provider.getChildren(repoItem);
        assert.ok(layers.length > 0, 'expected at least one layer item');

        const layerItem = layers[0];
        assert.strictEqual(layerItem.contextValue, 'layer');
        // Disabled layer: no children → should NOT be collapsible
        assert.strictEqual(layerItem.collapsibleState, 0, 'disabled layer should be None (not collapsible)');

        // Expanding a disabled layer yields no children
        const children = provider.getChildren(layerItem);
        assert.strictEqual(children.length, 0, 'disabled layer should have no artifact-type children');
    });

    test('LTV-AT-09: layer with no known-type files – no artifact-type children', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        // Only 'other' type files (not instructions/prompts/agents/skills)
        const otherFiles = [
            makeEffectiveFile('custom/foo.md'),
            makeEffectiveFile('bar.md'),
        ];
        const provider = new LayersTreeViewProvider(
            makeState(config, otherFiles), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layers = provider.getChildren(repoItem);
        assert.ok(layers.length > 0);

        const layerItem = layers[0];
        // No known-type files and no excludedTypes → not collapsible
        assert.strictEqual(layerItem.collapsibleState, 0, 'layer with no known-type files should be None');

        const children = provider.getChildren(layerItem);
        assert.strictEqual(children.length, 0, 'should have no artifact-type children');
    });

    test('LTV-AT-10: only types with files are shown (partial coverage)', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        // Only instructions and skills files
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(
            makeState(config, files), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];
        const artifactChildren = provider.getChildren(layerItem);

        assert.strictEqual(artifactChildren.length, 2, 'should only show 2 types with files');
        const labels = artifactChildren.map(c => String(c.label));
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
        const capabilitiesNode = top.find(c => String(c.label) === 'capabilities');
        assert.ok(capabilitiesNode, 'expected capabilities node at repo root');

        const capabilitiesChildren = provider.getChildren(capabilitiesNode);
        const childLabels = capabilitiesChildren.map(c => String(c.label));

        assert.ok(childLabels.includes('devtools'), 'should include descendant layer folder');
        assert.ok(childLabels.includes('instructions'), 'should include artifact type from capabilities layer');
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

        const capabilitiesFolder = roots.find(c => String(c.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder at root');

        const nested = provider.getChildren(capabilitiesFolder);
        const layerItem = nested.find(c => c.contextValue === 'layer');
        assert.ok(layerItem, 'expected layer item under capabilities folder');

        const children = provider.getChildren(layerItem);
        const labels = children.map(c => String(c.label));

        assert.deepStrictEqual(labels, ['instructions', 'prompts']);
        assert.ok(children.every(c => c.contextValue === 'layerArtifactType'));
    });

    test('LTV-AT-13: parent LayerItem description shows excluded count when some types excluded', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig({ excludedTypes: ['prompts', 'agents'] });
        const files = [
            makeEffectiveFile('instructions/a.md'),
            makeEffectiveFile('skills/d.md'),
        ];
        const provider = new LayersTreeViewProvider(
            makeState(config, files), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(
            String(layerItem.description).includes('2 excluded'),
            `expected description to mention excluded count, got: ${layerItem.description}`
        );
    });

    test('LTV-AT-14: parent LayerItem description omits excluded count when no types excluded', () => {
        const { LayersTreeViewProvider } = loadLayersTreeView();
        const config = makeMultiRepoConfig();
        const provider = new LayersTreeViewProvider(
            makeState(config, ALL_TYPES_FILES), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(
            !String(layerItem.description).includes('excluded'),
            `expected description without excluded hint, got: ${layerItem.description}`
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
            makeState(config, filesWithCapability), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(String(layerItem.tooltip).includes('Capability: SDLC Traceability'));
        assert.ok(String(layerItem.tooltip).includes('Description: Traceability metadata capability.'));
        assert.ok(String(layerItem.tooltip).includes('License: MIT'));
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
            makeState(config, filesWithCapability), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(String(layerItem.tooltip).includes('Capability: sdlc-traceability'));
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
            makeState(config, [], capabilityByLayer), () => 'tree'
        );

        const repoItem = provider.getChildren()[0];
        const layerItem = provider.getChildren(repoItem)[0];

        assert.ok(String(layerItem.tooltip).includes('Capability: SDLC Traceability'));
        assert.ok(String(layerItem.tooltip).includes('Description: Capability metadata sourced from layer state.'));
        assert.ok(String(layerItem.tooltip).includes('License: MIT'));
    });
});
