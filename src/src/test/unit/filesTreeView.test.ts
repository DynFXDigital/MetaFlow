/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS require needed for Mocha proxyquire module rewiring */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EffectiveFile, getArtifactType } from '@metaflow/engine';

// ── Minimal vscode mock ────────────────────────────────────────────────────────

class MockTreeItem {
    label: unknown;
    collapsibleState: number;
    contextValue?: string;
    iconPath?: unknown;
    description?: string | boolean;
    command?: unknown;
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

type MockItem = {
    contextValue?: string;
    label?: unknown;
    description?: string | boolean;
    artifactType?: string;
    files?: EffectiveFile[];
    prefix?: string;
    tooltip?: unknown;
    file?: EffectiveFile;
    sourceLabel?: string;
    displayLayerLabel?: string;
};

type MockProvider = {
    getChildren(element?: MockItem): MockItem[];
    getParent?(element: MockItem): MockItem | undefined;
    resolveTreeItem?(item: MockItem, element: MockItem, token: unknown): Promise<MockItem>;
};

type FilesTreeViewModule = {
    FilesTreeViewProvider: new (
        state: {
            effectiveFiles: EffectiveFile[];
            config?: unknown;
            onDidChange: { event: (_l: unknown) => { dispose: () => void } };
        },
        modeResolver?: () => string,
    ) => MockProvider;
};

function loadFilesTreeView(): FilesTreeViewModule {
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

    const targetPath = require.resolve('../../views/filesTreeView');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as FilesTreeViewModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeFile(
    relativePath: string,
    sourcePath = `/repo/${relativePath}`,
    sourceLayer = 'test-layer',
): EffectiveFile {
    return {
        relativePath,
        sourcePath,
        sourceLayer,
        classification: 'synchronized',
    } as EffectiveFile;
}

function makeState(
    files: EffectiveFile[],
    config?: unknown,
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
) {
    const event = (listener: unknown): { dispose: () => void } => {
        void listener;
        return { dispose: () => {} };
    };

    return {
        effectiveFiles: files,
        config,
        builtInCapability,
        onDidChange: { event },
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

suite('FilesTreeView – artifact-type grouping', () => {
    let tmpDir: string;
    const mockToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
    };

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftv-test-'));
    });

    suiteTeardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // FTV-AT-01: unified mode root is ArtifactTypeItems in canonical order
    test('FTV-AT-01: unified root returns ArtifactTypeItems in TYPE_ORDER', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/skills/my-skill/SKILL.md'),
            makeFile('.github/instructions/a.instructions.md'),
            makeFile('.github/prompts/b.prompt.md'),
            makeFile('.github/agents/c.agent.md'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');
        const children = provider.getChildren();

        assert.strictEqual(children.length, 4);
        assert.deepStrictEqual(
            children.map((c) => String(c.label)),
            ['instructions', 'prompts', 'agents', 'skills'],
        );
        assert.ok(children.every((c) => c.contextValue === 'artifactTypeFolder'));
    });

    // FTV-AT-02: .github/instructions/ files land under the instructions bucket
    test('FTV-AT-02: .github/instructions files grouped under instructions', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/instructions/foo.instructions.md'),
            makeFile('.github/instructions/bar.instructions.md'),
            makeFile('.github/prompts/p.prompt.md'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');
        const children = provider.getChildren();

        const instrItem = children.find((c) => String(c.label) === 'instructions');
        assert.ok(instrItem, 'instructions bucket should exist');
        assert.ok(instrItem.files, 'ArtifactTypeItem should expose files');
        assert.strictEqual(instrItem.files!.length, 2);
        assert.strictEqual(String(instrItem.description), '2 files');
    });

    // FTV-AT-03: files with unknown prefix land in 'other', omitted when empty
    test('FTV-AT-03: unknown-prefix file lands in other bucket', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/instructions/a.md'),
            makeFile('some-config/settings.json'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');
        const children = provider.getChildren();

        assert.ok(
            children.some((c) => String(c.label) === 'other'),
            'other bucket should appear',
        );
    });

    // FTV-AT-05: empty 'other' bucket omitted
    test('FTV-AT-05: other bucket omitted when no unknown-prefix files', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/instructions/a.md'),
            makeFile('.github/prompts/b.prompt.md'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');
        const children = provider.getChildren();

        assert.ok(
            !children.some((c) => String(c.label) === 'other'),
            'other bucket should be absent',
        );
    });

    // FTV-AT-04: repoTree with root-layer (sourceLayer='.') → ArtifactTypeItems directly under RepoItem
    test('FTV-AT-04: repoTree root-layer – RepoItem children are ArtifactTypeItems', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        // sourceLayer '.' means the layer IS the repo root – no intermediate dirs.
        const files = [
            makeFile('.github/instructions/a.md', '/repoA/.github/instructions/a.md', '.'),
            makeFile('.github/prompts/b.prompt.md', '/repoA/.github/prompts/b.prompt.md', '.'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'repoTree');
        const roots = provider.getChildren();

        assert.ok(roots.length > 0, 'should have at least one root');
        assert.strictEqual(roots[0].contextValue, 'effectiveRepo');

        const typeItems = provider.getChildren(roots[0]);
        assert.ok(typeItems.length > 0, 'should have artifact type children');
        assert.ok(
            typeItems.every((c) => c.contextValue === 'artifactTypeFolder'),
            'root-layer: direct children of RepoItem should be ArtifactTypeItems',
        );
    });

    // FTV-AT-08: repoTree with intermediate directories shows full hierarchy
    test('FTV-AT-08: repoTree with deep layer path shows FolderItems above ArtifactTypeItems', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        // Simulate files from a layer at 'capabilities/devtools' within the repo.
        // sourceLayer is the full absolute layer path; sourceRepo is the repo root.
        const instrFile: EffectiveFile = {
            relativePath: '.github/instructions/foo.md',
            sourcePath: '/repo/capabilities/devtools/.github/instructions/foo.md',
            sourceLayer: '/repo/capabilities/devtools',
            sourceRepo: '/repo',
            classification: 'synchronized',
        } as EffectiveFile;
        const skillFile: EffectiveFile = {
            relativePath: '.github/skills/my-skill/SKILL.md',
            sourcePath: '/repo/capabilities/devtools/.github/skills/my-skill/SKILL.md',
            sourceLayer: '/repo/capabilities/devtools',
            sourceRepo: '/repo',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(
            makeState([instrFile, skillFile]),
            () => 'repoTree',
        );
        const roots = provider.getChildren();

        // Root: one RepoItem per distinct sourceLabel (falls back to sourceLayer)
        assert.ok(roots.length > 0);
        const [repoItem] = roots;
        assert.strictEqual(repoItem.contextValue, 'effectiveRepo');

        // Level 2: FolderItem('capabilities') — not a known type so it's a folder
        const level2 = provider.getChildren(repoItem);
        assert.strictEqual(level2.length, 1);
        assert.strictEqual(
            level2[0].contextValue,
            'effectiveFolder',
            'capabilities should be a FolderItem',
        );
        assert.strictEqual(String(level2[0].label), 'capabilities');

        // Level 3: FolderItem('devtools')
        const level3 = provider.getChildren(level2[0]);
        assert.strictEqual(level3.length, 1);
        assert.strictEqual(
            level3[0].contextValue,
            'effectiveFolder',
            'devtools should be a FolderItem',
        );
        assert.strictEqual(String(level3[0].label), 'devtools');

        // Level 4: ArtifactTypeItems (instructions, skills) — .github is stripped
        const level4 = provider.getChildren(level3[0]);
        assert.ok(level4.length === 2, `expected 2 artifact type items, got ${level4.length}`);
        assert.ok(
            level4.every((c) => c.contextValue === 'artifactTypeFolder'),
            'children of deepest folder should be ArtifactTypeItems',
        );
        assert.deepStrictEqual(level4.map((c) => String(c.label)).sort(), [
            'instructions',
            'skills',
        ]);

        // Level 5 under instructions: FileItem('foo.md')
        const instrItem = level4.find((c) => String(c.label) === 'instructions')!;
        const instrChildren = provider.getChildren(instrItem);
        assert.strictEqual(instrChildren.length, 1);
        assert.strictEqual(instrChildren[0].contextValue, 'effectiveFile');
        assert.strictEqual(String(instrChildren[0].label), 'foo.md');
    });

    // FTV-AT-06: FileItem description contains source attribution
    test('FTV-AT-06: FileItem description contains source label', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [makeFile('.github/instructions/a.md')];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');
        const [instrItem] = provider.getChildren();
        const fileChildren = provider.getChildren(instrItem);

        assert.strictEqual(fileChildren.length, 1, 'one file under instructions');
        assert.strictEqual(fileChildren[0].contextValue, 'effectiveFile');
        // description should name the source label (sourceLayer = 'test-layer')
        assert.ok(
            String(fileChildren[0].description).includes('test-layer'),
            `description "${String(fileChildren[0].description)}" should include source label`,
        );
    });

    test('FTV-PM-01: unified mode tracks parent links from file items to artifact roots', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [makeFile('.github/instructions/a.instructions.md')];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');

        const [instructionsItem] = provider.getChildren();
        const [fileItem] = provider.getChildren(instructionsItem);

        assert.strictEqual(provider.getParent?.(fileItem), instructionsItem);
        assert.strictEqual(provider.getParent?.(instructionsItem), undefined);
    });

    test('FTV-PM-02: repoTree root-layer tracks parent links from artifact types to repos', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/instructions/a.md', '/repoA/.github/instructions/a.md', '.'),
            makeFile('.github/prompts/b.prompt.md', '/repoA/.github/prompts/b.prompt.md', '.'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const [artifactTypeItem] = provider.getChildren(repoItem);
        const [fileItem] = provider.getChildren(artifactTypeItem);

        assert.strictEqual(provider.getParent?.(fileItem), artifactTypeItem);
        assert.strictEqual(provider.getParent?.(artifactTypeItem), repoItem);
        assert.strictEqual(provider.getParent?.(repoItem), undefined);
    });

    test('FTV-PM-03: repoTree deep hierarchy tracks parent links through folder nodes', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'pm03-agent-customization');
        fs.mkdirSync(skillDir, { recursive: true });
        const skillFilePath = path.join(skillDir, 'SKILL.md');
        fs.writeFileSync(
            skillFilePath,
            ['---', 'name: agent-customization', '---', '', '# Agent Customization'].join('\n'),
        );
        const file: EffectiveFile = {
            relativePath: '.github/skills/agent-customization/SKILL.md',
            sourcePath: skillFilePath,
            sourceLayer: '/repo/capabilities/devtools',
            sourceRepo: '/repo',
            classification: 'synchronized',
        } as EffectiveFile;
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const [capabilitiesFolder] = provider.getChildren(repoItem);
        const [devtoolsFolder] = provider.getChildren(capabilitiesFolder);
        const [skillsTypeItem] = provider.getChildren(devtoolsFolder);
        const [skillFolder] = provider.getChildren(skillsTypeItem);

        assert.strictEqual(String(capabilitiesFolder.label), 'capabilities');
        assert.strictEqual(String(devtoolsFolder.label), 'devtools');
        assert.strictEqual(String(skillsTypeItem.label), 'skills');
        assert.strictEqual(String(skillFolder.label), 'Agent Customization');
        assert.strictEqual(provider.getParent?.(skillFolder), skillsTypeItem);
        assert.strictEqual(provider.getParent?.(skillsTypeItem), devtoolsFolder);
        assert.strictEqual(provider.getParent?.(devtoolsFolder), capabilitiesFolder);
        assert.strictEqual(provider.getParent?.(capabilitiesFolder), repoItem);
    });

    test('FTV-AT-06C: repoTree file description omits redundant source label', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                ...makeFile(
                    '.github/prompts/a.prompt.md',
                    '/repo/capabilities/example/.github/prompts/a.prompt.md',
                    'capabilities/example',
                ),
                classification: 'settings',
            } as EffectiveFile,
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder');
        const exampleFolder = provider
            .getChildren(capabilitiesFolder)
            .find((item) => String(item.label) === 'example');
        assert.ok(exampleFolder, 'expected example folder');
        const promptsItem = provider
            .getChildren(exampleFolder)
            .find((item) => String(item.label) === 'prompts');
        assert.ok(promptsItem, 'expected prompts artifact type folder');
        const [fileItem] = provider.getChildren(promptsItem);

        assert.strictEqual(fileItem.contextValue, 'effectiveFile');
        assert.strictEqual(String(fileItem.description), '(settings)');
    });

    test('FTV-AT-06B: repoTree root uses repository display name from metadata', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
        mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

        try {
            const files = [
                makeFile(
                    '.github/instructions/a.md',
                    '/workspace/.ai/team-metadata/.github/instructions/a.md',
                    '.',
                ),
            ];
            const stateWithMetadata = makeState(files, {
                metadataRepos: [{ id: 'team-metadata', localPath: '.ai/team-metadata' }],
            });
            (
                stateWithMetadata as { repoMetadataById?: Record<string, { name?: string }> }
            ).repoMetadataById = {
                'team-metadata': { name: 'Team Metadata' },
            };
            const providerWithMetadata = new FilesTreeViewProvider(
                stateWithMetadata,
                () => 'repoTree',
            );

            const [repoItem] = providerWithMetadata.getChildren();
            assert.strictEqual(String(repoItem.label), 'Team Metadata');
            assert.strictEqual(String(repoItem.description), 'team-metadata (0/0)');
        } finally {
            mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
        }
    });

    test('FTV-AT-06E: repoTree root falls back to configured display name and keeps repo id in description', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                ...makeFile(
                    '.github/instructions/a.md',
                    '/external/team-metadata/.github/instructions/a.md',
                    'primary/capabilities/agent-commit-coordination',
                ),
                sourceRepo: 'primary',
            } as EffectiveFile,
        ];
        const stateWithMetadata = makeState(files, {
            metadataRepos: [
                { id: 'primary', name: 'Team Metadata', localPath: '../team-metadata' },
            ],
        });
        const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

        const [repoItem] = provider.getChildren();
        assert.strictEqual(String(repoItem.label), 'Team Metadata');
        assert.strictEqual(String(repoItem.description), 'primary (0/0)');
    });

    test('FTV-AT-06F: repoTree root ignores raw config name when it only repeats the repo id', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
        mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

        try {
            const files = [
                {
                    ...makeFile(
                        '.github/instructions/a.md',
                        '/workspace/team-metadata/.github/instructions/a.md',
                        'primary/capabilities/agent-commit-coordination',
                    ),
                    sourceRepo: 'primary',
                } as EffectiveFile,
            ];
            const stateWithMetadata = makeState(files, {
                metadataRepos: [{ id: 'primary', name: 'primary', localPath: 'team-metadata' }],
            });
            (
                stateWithMetadata as { repoMetadataById?: Record<string, { name?: string }> }
            ).repoMetadataById = {
                primary: { name: 'Team Metadata' },
            };
            const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

            const [repoItem] = provider.getChildren();
            assert.strictEqual(String(repoItem.label), 'Team Metadata');
            assert.strictEqual(String(repoItem.description), 'primary, team-metadata (0/0)');
        } finally {
            mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
        }
    });

    test('FTV-AT-06D: repoTree root keeps stable grouping when display names collide', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const originalWorkspaceFolders = mockVscode.workspace.workspaceFolders;
        mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

        try {
            const files = [
                makeFile(
                    '.github/instructions/a.md',
                    '/workspace/.ai/first-meta/.github/instructions/a.md',
                    '.',
                ),
                makeFile(
                    '.github/prompts/b.prompt.md',
                    '/workspace/.ai/second-meta/.github/prompts/b.prompt.md',
                    '.',
                ),
            ];
            const stateWithMetadata = makeState(files, {
                metadataRepos: [
                    { id: 'first', name: 'Shared Meta', localPath: '.ai/first-meta' },
                    { id: 'second', name: 'Shared Meta', localPath: '.ai/second-meta' },
                ],
            });
            const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

            const repoItems = provider.getChildren();
            assert.strictEqual(repoItems.length, 2);
            assert.deepStrictEqual(repoItems.map((item) => String(item.description)).sort(), [
                'first, first-meta (0/0)',
                'second, second-meta (0/0)',
            ]);
        } finally {
            mockVscode.workspace.workspaceFolders = originalWorkspaceFolders;
        }
    });

    test('FTV-AT-08B: repoTree capability folder uses capability name with slug in description', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                ...makeFile(
                    '.github/instructions/a.md',
                    '/repo/capabilities/agent-commit-coordination/.github/instructions/a.md',
                    'primary/capabilities/agent-commit-coordination',
                ),
                sourceRepo: 'primary',
                sourceCapabilityId: 'agent-commit-coordination',
                sourceCapabilityName: 'Agent Commit Coordination',
            } as EffectiveFile,
        ];
        const stateWithMetadata = makeState(files, {
            metadataRepos: [{ id: 'primary', name: 'Team Metadata', localPath: '/repo' }],
        });
        const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder');

        const capabilityFolder = provider
            .getChildren(capabilitiesFolder)
            .find((item) => String(item.label) === 'Agent Commit Coordination');
        assert.ok(capabilityFolder, 'expected capability folder to use display name');
        assert.strictEqual(
            String(capabilityFolder?.description),
            'agent-commit-coordination (0/0)',
        );
    });

    test('FTV-AT-08B1: repoTree capability folder tooltip includes capability description metadata', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                ...makeFile(
                    '.github/instructions/a.md',
                    '/repo/capabilities/agent-commit-coordination/.github/instructions/a.md',
                    'primary/capabilities/agent-commit-coordination',
                ),
                sourceRepo: 'primary',
                sourceCapabilityId: 'agent-commit-coordination',
                sourceCapabilityName: 'Agent Commit Coordination',
                sourceCapabilityDescription: 'Shared-worktree coordination and commit locking.',
                sourceCapabilityLicense: 'MIT',
            } as EffectiveFile,
        ];
        const stateWithMetadata = makeState(files, {
            metadataRepos: [{ id: 'primary', name: 'Team Metadata', localPath: '/repo' }],
        });
        const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder');

        const capabilityFolder = provider
            .getChildren(capabilitiesFolder)
            .find((item) => String(item.label) === 'Agent Commit Coordination');
        assert.ok(capabilityFolder, 'expected capability folder to use display name');

        await provider.resolveTreeItem!(capabilityFolder, capabilityFolder, mockToken);
        const tooltipText = String(capabilityFolder.tooltip);

        assert.ok(
            tooltipText.includes('**Agent Commit Coordination**'),
            `expected capability title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Shared-worktree coordination and commit locking.'),
            `expected capability description, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Capability ID:') &&
                tooltipText.includes('agent-commit-coordination'),
            `expected capability id, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('License:') && tooltipText.includes('MIT'),
            `expected capability license, got: ${tooltipText}`,
        );
    });

    test('FTV-AT-08C: repoTree aggregate parent folder keeps path label above capability display names', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                ...makeFile(
                    '.github/instructions/a.md',
                    '/repo/capabilities/agent-commit-coordination/.github/instructions/a.md',
                    'primary/capabilities/agent-commit-coordination',
                ),
                sourceRepo: 'primary',
                sourceCapabilityId: 'agent-commit-coordination',
                sourceCapabilityName: 'Agent Commit Coordination',
            } as EffectiveFile,
            {
                ...makeFile(
                    '.github/instructions/b.md',
                    '/repo/capabilities/auto-commits/.github/instructions/b.md',
                    'primary/capabilities/auto-commits',
                ),
                sourceRepo: 'primary',
                sourceCapabilityId: 'auto-commits',
                sourceCapabilityName: 'Auto Commits',
            } as EffectiveFile,
        ];
        const stateWithMetadata = makeState(files, {
            metadataRepos: [{ id: 'primary', name: 'Team Metadata', localPath: '/repo' }],
        });
        const provider = new FilesTreeViewProvider(stateWithMetadata, () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected aggregate capabilities folder');
        assert.strictEqual(String(capabilitiesFolder?.description), '(0/0)');

        const childLabels = provider
            .getChildren(capabilitiesFolder)
            .map((item) => String(item.label));
        assert.deepStrictEqual(childLabels, ['Agent Commit Coordination', 'Auto Commits']);
    });

    test('FTV-AT-08D: skill folder uses friendly heading label with slug in description', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'sk08-agent-commit-coordination');
        fs.mkdirSync(skillDir, { recursive: true });
        const skillFile = path.join(skillDir, 'SKILL.md');
        fs.writeFileSync(
            skillFile,
            [
                '---',
                'name: agent-commit-coordination',
                'description: Shared-worktree commit discipline.',
                '---',
                '',
                '# Agent Commit Coordination Skill',
            ].join('\n'),
        );

        const files = [
            {
                relativePath: '.github/skills/agent-commit-coordination/SKILL.md',
                sourcePath: skillFile,
                sourceLayer: 'primary/capabilities/agent-commit-coordination',
                sourceRepo: 'primary',
                classification: 'settings',
            } as EffectiveFile,
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'repoTree');

        const [repoItem] = provider.getChildren();
        const capabilitiesFolder = provider
            .getChildren(repoItem)
            .find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'expected capabilities folder');

        const capabilityFolder = provider
            .getChildren(capabilitiesFolder)
            .find((item) => String(item.label) === 'agent-commit-coordination');
        assert.ok(capabilityFolder, 'expected capability path folder');

        const skillsFolder = provider
            .getChildren(capabilityFolder)
            .find((item) => String(item.label) === 'skills');
        assert.ok(skillsFolder, 'expected skills folder');

        const skillFolder = provider
            .getChildren(skillsFolder)
            .find((item) => String(item.label) === 'Agent Commit Coordination');
        assert.ok(skillFolder, 'expected friendly skill folder label');
        assert.strictEqual(String(skillFolder?.description), 'agent-commit-coordination (0/0)');
    });

    // FTV-AT-07: FolderItem traversal works for skill sub-directories
    test('FTV-AT-07: FolderItem sub-path traversal within skill type', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/skills/my-skill/SKILL.md', '/repo/.github/skills/my-skill/SKILL.md'),
        ];
        const provider = new FilesTreeViewProvider(makeState(files), () => 'unified');

        // Root: ArtifactTypeItem('skills')
        const [skillsItem] = provider.getChildren();
        assert.strictEqual(String(skillsItem.label), 'skills');

        // Level 2: FolderItem('my-skill') because path has sub-directory
        const skillChildren = provider.getChildren(skillsItem);
        assert.strictEqual(skillChildren.length, 1);
        assert.strictEqual(skillChildren[0].contextValue, 'effectiveFolder');
        assert.strictEqual(String(skillChildren[0].label), 'my-skill');

        // Level 3: FileItem('SKILL.md')
        const folderChildren = provider.getChildren(skillChildren[0]);
        assert.strictEqual(folderChildren.length, 1);
        assert.strictEqual(folderChildren[0].contextValue, 'effectiveFile');
        assert.strictEqual(String(folderChildren[0].label), 'SKILL.md');
    });

    // getArtifactType helper: re-exported from @metaflow/engine
    test('getArtifactType: recognises known types and falls back to other', () => {
        assert.strictEqual(getArtifactType('.github/instructions/foo.md'), 'instructions');
        assert.strictEqual(getArtifactType('.github/prompts/p.prompt.md'), 'prompts');
        assert.strictEqual(getArtifactType('.github/agents/a.agent.md'), 'agents');
        assert.strictEqual(getArtifactType('.github/skills/s/SKILL.md'), 'skills');
        assert.strictEqual(getArtifactType('unknown/something.json'), 'other');
        assert.strictEqual(getArtifactType('settings.json'), 'other');
    });

    // Empty state returns no children
    test('empty effectiveFiles returns empty children', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const provider = new FilesTreeViewProvider(makeState([]), () => 'unified');
        const children = provider.getChildren();
        assert.strictEqual(children.length, 0);
    });

    test('FTV-CAP-01: File tooltip includes capability metadata when present', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'cap01.md');
        fs.writeFileSync(tmpFile, '# No front-matter\n');
        const file = {
            ...makeFile('.github/instructions/a.md', tmpFile),
            sourceCapabilityId: 'sdlc-traceability',
            sourceCapabilityName: 'SDLC Traceability',
            sourceCapabilityDescription: 'Traceability metadata capability.',
            sourceCapabilityLicense: 'MIT',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(tooltipText.includes('Capability: SDLC Traceability'));
        assert.ok(
            tooltipText.includes('Capability ID:') && tooltipText.includes('sdlc-traceability'),
        );
        assert.ok(
            tooltipText.includes('Capability Description: Traceability metadata capability.'),
        );
        assert.ok(tooltipText.includes('Capability License:') && tooltipText.includes('MIT'));
    });

    test('FTV-CAP-02: File tooltip falls back to capability id when name is absent', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'cap02.md');
        fs.writeFileSync(tmpFile, '# No front-matter\n');
        const file = {
            ...makeFile('.github/instructions/a.md', tmpFile),
            sourceCapabilityId: 'sdlc-traceability',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(tooltipText.includes('Capability: sdlc-traceability'));
        assert.ok(
            !tooltipText.includes('Capability ID:'),
            'tooltip should not duplicate id when name is absent',
        );
    });

    test('FTV-CAP-03: File tooltip keeps capability fields in a stable order', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'cap03.md');
        fs.writeFileSync(tmpFile, '# No front-matter\n');
        const file = {
            ...makeFile('.github/instructions/a.md', tmpFile),
            sourceCapabilityId: 'sdlc-traceability',
            sourceCapabilityName: 'SDLC Traceability',
            sourceCapabilityDescription: 'Traceability metadata capability.',
            sourceCapabilityLicense: 'MIT',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        const capabilityIndex = tooltipText.indexOf('Capability: SDLC Traceability');
        const capabilityIdIndex = tooltipText.indexOf('Capability ID:');
        const descriptionIndex = tooltipText.indexOf(
            'Capability Description: Traceability metadata capability.',
        );
        const licenseIndex = tooltipText.indexOf('Capability License:');

        assert.ok(capabilityIndex >= 0, 'expected capability line in tooltip');
        assert.ok(
            capabilityIdIndex > capabilityIndex,
            'expected capability id after capability name',
        );
        assert.ok(descriptionIndex > capabilityIdIndex, 'expected description after capability id');
        assert.ok(licenseIndex > descriptionIndex, 'expected license after description');
    });

    // ── Built-in label alignment ───────────────────────────────────────────────

    test('FTV-BI-01: unified mode – built-in file description uses friendly label', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const builtInFile = {
            relativePath: '.github/instructions/traceability.instructions.md',
            sourcePath:
                '/tmp/ext/assets/metaflow-ai-metadata/.github/instructions/traceability.instructions.md',
            sourceLayer: '__metaflow_builtin__/.github',
            classification: 'settings',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(
            makeState([builtInFile], undefined, {
                enabled: true,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            }),
            () => 'unified',
        );

        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        assert.ok(
            String(fileNode.description).includes('MetaFlow'),
            `description should include friendly label, got: ${fileNode.description}`,
        );
        assert.ok(
            !String(fileNode.description).includes('__metaflow_builtin__'),
            `description should not expose raw built-in id, got: ${fileNode.description}`,
        );
    });

    test('FTV-BI-02: repoTree mode – built-in repo node uses friendly label', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const builtInFile = {
            relativePath: '.github/skills/review/SKILL.md',
            sourcePath: '/tmp/ext/assets/metaflow-ai-metadata/.github/skills/review/SKILL.md',
            sourceLayer: '__metaflow_builtin__/.github',
            classification: 'settings',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(
            makeState([builtInFile], undefined, {
                enabled: true,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            }),
            () => 'repoTree',
        );

        const roots = provider.getChildren();
        assert.strictEqual(roots.length, 1, 'should have one repo node');
        assert.ok(
            String(roots[0].label).includes('MetaFlow'),
            `repo node label should use friendly name, got: ${roots[0].label}`,
        );
        assert.ok(
            !String(roots[0].label).includes('__metaflow_builtin__'),
            `repo node label should not expose raw id, got: ${roots[0].label}`,
        );
    });

    // FTV-BI-04: repoTree mode – built-in layer rooted at .github should NOT show .github folder node
    test('FTV-BI-04: repoTree mode – no .github folder node for built-in capability', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            {
                relativePath: 'instructions/a.md',
                sourcePath: '/tmp/ext/assets/metaflow-ai-metadata/.github/instructions/a.md',
                sourceLayer: '__metaflow_builtin__/.github',
                sourceRepo: '__metaflow_builtin__',
                classification: 'settings',
            } as EffectiveFile,
            {
                relativePath: 'prompts/b.md',
                sourcePath: '/tmp/ext/assets/metaflow-ai-metadata/.github/prompts/b.md',
                sourceLayer: '__metaflow_builtin__/.github',
                sourceRepo: '__metaflow_builtin__',
                classification: 'settings',
            } as EffectiveFile,
        ];

        const provider = new FilesTreeViewProvider(
            makeState(files, undefined, {
                enabled: true,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: '/tmp/ext/assets/metaflow-ai-metadata',
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            }),
            () => 'repoTree',
        );

        const [repoNode] = provider.getChildren();
        const repoChildren = provider.getChildren(repoNode);

        // Should see artifact type nodes directly (instructions, prompts), not a .github folder
        const labels = repoChildren.map((c) => String(c.label));
        assert.ok(
            !labels.includes('.github'),
            `.github should not appear as a folder node, got: ${labels.join(', ')}`,
        );
        assert.ok(
            labels.some((l) => l === 'instructions' || l === 'prompts'),
            `artifact type nodes expected, got: ${labels.join(', ')}`,
        );
    });

    test('FTV-BI-03: built-in inactive – no friendly label injected for non-built-in files', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const normalFile = makeFile('.github/instructions/a.md');

        const provider = new FilesTreeViewProvider(makeState([normalFile]), () => 'unified');

        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        assert.ok(
            !String(fileNode.description).includes('MetaFlow ('),
            `normal file should not get built-in label, got: ${fileNode.description}`,
        );
    });

    // ── Front-matter tooltip enrichment ────────────────────────────────────────

    test('FTV-FM-01: tooltip shows front-matter name as title when present', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm01.agent.md');
        fs.writeFileSync(
            tmpFile,
            [
                '---',
                'name: Critic',
                'description: Adversarial code reviewer.',
                '---',
                '',
                'You are Critic.',
            ].join('\n'),
        );
        const file = makeFile('.github/agents/critic.agent.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('**Critic**'),
            `expected front-matter name as bold title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Adversarial code reviewer.'),
            `expected description in tooltip, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-02: tooltip falls back to filename when front-matter has no name', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm02.instructions.md');
        fs.writeFileSync(
            tmpFile,
            [
                '---',
                'description: Instructions for concise responses.',
                'applyTo: "**"',
                '---',
                '',
                'Keep output concise.',
            ].join('\n'),
        );
        const file = makeFile('.github/instructions/concise.instructions.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('**concise.instructions.md**'),
            `expected filename as title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Instructions for concise responses.'),
            `expected description, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-03: tooltip includes applyTo when present in front-matter', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm03.instructions.md');
        fs.writeFileSync(
            tmpFile,
            [
                '---',
                'description: TypeScript guidance.',
                'applyTo: "**/*.ts"',
                '---',
                '',
                'Use strict mode.',
            ].join('\n'),
        );
        const file = makeFile('.github/instructions/ts.instructions.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('Applies to:') && tooltipText.includes('**/*.ts'),
            `expected applyTo in tooltip, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Scope risk:') && tooltipText.includes('medium'),
            `expected scope risk classification, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Scope rationale:') &&
                tooltipText.includes('nested folders without an anchored root path'),
            `expected scope rationale, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-04: tooltip works for files without front-matter', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm04.md');
        fs.writeFileSync(tmpFile, '# Just markdown\nNo front-matter here.\n');
        const file = makeFile('.github/instructions/plain.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('**plain.md**'),
            `expected filename as title, got: ${tooltipText}`,
        );
        assert.ok(tooltipText.includes('Path:'), `expected path in tooltip, got: ${tooltipText}`);
        assert.ok(
            tooltipText.includes('Source:'),
            `expected source in tooltip, got: ${tooltipText}`,
        );
        assert.ok(
            !tooltipText.includes('Applies to:'),
            `no applyTo should appear without front-matter`,
        );
    });

    test('FTV-FM-05: tooltip gracefully handles unreadable file', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const file = makeFile('.github/instructions/missing.md', '/nonexistent/path/missing.md');
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('**missing.md**'),
            `expected filename as title despite read failure, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Path:'),
            `expected basic metadata despite read failure, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-06: tooltip is markdown with bold title and italic description', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm06.prompt.md');
        fs.writeFileSync(
            tmpFile,
            [
                '---',
                'description: Create a new plan directory.',
                'agent: agent',
                '---',
                '',
                '# Create a Plan',
            ].join('\n'),
        );
        const file = makeFile('.github/prompts/plan.prompt.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        // Title should be bold (filename since no name field)
        assert.ok(
            tooltipText.includes('**plan.prompt.md**'),
            `expected bold filename title, got: ${tooltipText}`,
        );
        // Description should be italicised
        assert.ok(
            tooltipText.includes('*Create a new plan directory.*'),
            `expected italic description, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-07: tooltip shows skill name from front-matter', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const tmpFile = path.join(tmpDir, 'fm07-SKILL.md');
        fs.writeFileSync(
            tmpFile,
            [
                '---',
                'name: unit-testing-rigor',
                'description: Thorough unit tests for safety-critical quality.',
                '---',
                '',
                '# Unit Testing Rigor',
            ].join('\n'),
        );
        const file = makeFile('.github/skills/unit-testing-rigor/SKILL.md', tmpFile);
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const skillFolder = provider.getChildren(typeNode);
        const [fileNode] = provider.getChildren(skillFolder[0]);

        await provider.resolveTreeItem!(fileNode, fileNode, mockToken);
        const tooltipText = String(fileNode.tooltip);

        assert.ok(
            tooltipText.includes('**unit-testing-rigor**'),
            `expected skill name as title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Thorough unit tests'),
            `expected description, got: ${tooltipText}`,
        );
    });

    test('FTV-FM-08: tooltip is undefined before resolveTreeItem is called', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const file = makeFile('.github/instructions/a.md');
        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        assert.strictEqual(
            fileNode.tooltip,
            undefined,
            'tooltip should be undefined before resolveTreeItem',
        );
    });

    // ── Skill folder tooltip enrichment ────────────────────────────────────────

    test('FTV-SK-01: skill folder tooltip shows SKILL.md name and description when present', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'sk01-my-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        const skillFile = path.join(skillDir, 'SKILL.md');
        fs.writeFileSync(
            skillFile,
            [
                '---',
                'name: unit-testing-rigor',
                'description: Thorough unit tests for safety-critical quality.',
                '---',
                '',
                '# Unit Testing Rigor',
            ].join('\n'),
        );

        const file: EffectiveFile = {
            relativePath: '.github/skills/my-skill/SKILL.md',
            sourcePath: skillFile,
            sourceLayer: 'test-layer',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [folderNode] = provider.getChildren(typeNode);

        assert.strictEqual(
            folderNode.contextValue,
            'effectiveFolder',
            'expected a folder node for skill directory',
        );

        await provider.resolveTreeItem!(folderNode, folderNode, mockToken);
        const tooltipText = String(folderNode.tooltip);

        assert.ok(
            tooltipText.includes('**Unit Testing Rigor**'),
            `expected bold skill name as title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Thorough unit tests for safety-critical quality.'),
            `expected description, got: ${tooltipText}`,
        );
    });

    test('FTV-SK-02: skill folder tooltip falls back to folder label when SKILL.md has no name', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'sk02-my-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        const skillFile = path.join(skillDir, 'SKILL.md');
        fs.writeFileSync(
            skillFile,
            [
                '---',
                'description: A helpful skill with no explicit name.',
                '---',
                '',
                '# Body',
            ].join('\n'),
        );

        const file: EffectiveFile = {
            relativePath: '.github/skills/my-skill/SKILL.md',
            sourcePath: skillFile,
            sourceLayer: 'test-layer',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [folderNode] = provider.getChildren(typeNode);

        await provider.resolveTreeItem!(folderNode, folderNode, mockToken);
        const tooltipText = String(folderNode.tooltip);

        assert.ok(
            tooltipText.includes('**my-skill**'),
            `expected folder label as bold title, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('A helpful skill with no explicit name.'),
            `expected description, got: ${tooltipText}`,
        );
    });

    test('FTV-SK-03: skill folder tooltip falls back to path when no SKILL.md is present', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'sk03-empty-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        // No SKILL.md — only a supporting file
        const supportFile = path.join(skillDir, 'guidance.md');
        fs.writeFileSync(supportFile, '# Guidance\n');

        const file: EffectiveFile = {
            relativePath: '.github/skills/empty-skill/guidance.md',
            sourcePath: supportFile,
            sourceLayer: 'test-layer',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [folderNode] = provider.getChildren(typeNode);

        assert.strictEqual(
            folderNode.tooltip,
            undefined,
            'tooltip should be undefined before resolveTreeItem',
        );

        await provider.resolveTreeItem!(folderNode, folderNode, mockToken);
        // Falls back to basic folder path tooltip
        assert.ok(
            String(folderNode.tooltip).includes('Folder:'),
            `expected path fallback, got: ${folderNode.tooltip}`,
        );
        assert.ok(
            String(folderNode.tooltip).includes('sk03-empty-skill'),
            `expected folder name in fallback, got: ${folderNode.tooltip}`,
        );
    });

    test('FTV-SK-04: non-skill folder tooltip is not enriched even if a SKILL.md exists nearby', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        // An instructions folder with a SKILL.md-like file – should not get skill enrichment
        const instrDir = path.join(tmpDir, 'sk04-instrdir');
        fs.mkdirSync(instrDir, { recursive: true });
        const instrFile = path.join(instrDir, 'guide.md');
        fs.writeFileSync(instrFile, '# Guide\n');

        const file: EffectiveFile = {
            relativePath: '.github/instructions/guide.md',
            sourcePath: instrFile,
            sourceLayer: 'test-layer',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren(); // instructions ArtifactTypeItem
        const [fileNode] = provider.getChildren(typeNode);

        // instructions has no intermediate folder – goes straight to FileItem
        assert.strictEqual(
            fileNode.contextValue,
            'effectiveFile',
            'instructions file should not be a folder node',
        );
    });

    test('FTV-SK-05: skill folder tooltip in repoTree mode also enriches from SKILL.md', async () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const skillDir = path.join(tmpDir, 'sk05-my-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        const skillFile = path.join(skillDir, 'SKILL.md');
        fs.writeFileSync(
            skillFile,
            [
                '---',
                'name: copilot-pack-sync',
                'description: Sync the shared Copilot Pack.',
                '---',
                '',
                '# Copilot Pack Sync',
            ].join('\n'),
        );

        const file: EffectiveFile = {
            relativePath: '.github/skills/my-skill/SKILL.md',
            sourcePath: skillFile,
            sourceLayer: '.',
            classification: 'synchronized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'repoTree');
        const [repoNode] = provider.getChildren();
        const typeChildren = provider.getChildren(repoNode);
        const skillsTypeNode = typeChildren.find((c) => String(c.label) === 'skills')!;
        const [folderNode] = provider.getChildren(skillsTypeNode);

        assert.strictEqual(
            folderNode.contextValue,
            'effectiveFolder',
            'expected FolderItem for skill dir in repoTree',
        );

        await provider.resolveTreeItem!(folderNode, folderNode, mockToken);
        const tooltipText = String(folderNode.tooltip);

        assert.ok(
            tooltipText.includes('**Copilot Pack Sync**'),
            `expected bold skill name, got: ${tooltipText}`,
        );
        assert.ok(
            tooltipText.includes('Sync the shared Copilot Pack.'),
            `expected description, got: ${tooltipText}`,
        );
    });
});
