/* eslint-disable @typescript-eslint/no-var-requires */

import * as assert from 'assert';
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

type MockItem = {
    contextValue?: string;
    label?: unknown;
    description?: string | boolean;
    artifactType?: string;
    files?: EffectiveFile[];
    prefix?: string;
    tooltip?: string;
};

type MockProvider = {
    getChildren(element?: MockItem): MockItem[];
};

type FilesTreeViewModule = {
    FilesTreeViewProvider: new (
        state: {
            effectiveFiles: EffectiveFile[];
            config?: unknown;
            onDidChange: { event: (_l: unknown) => { dispose: () => void } };
        },
        modeResolver?: () => string
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
        isMain: boolean
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
    sourceLayer = 'test-layer'
): EffectiveFile {
    return {
        relativePath,
        sourcePath,
        sourceLayer,
        classification: 'materialized',
    } as EffectiveFile;
}

function makeState(files: EffectiveFile[], config?: unknown) {
    const event = (listener: unknown): { dispose: () => void } => {
        void listener;
        return { dispose: () => {} };
    };

    return {
        effectiveFiles: files,
        config,
        onDidChange: { event },
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

suite('FilesTreeView – artifact-type grouping', () => {

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
            children.map(c => String(c.label)),
            ['instructions', 'prompts', 'agents', 'skills']
        );
        assert.ok(children.every(c => c.contextValue === 'artifactTypeFolder'));
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

        const instrItem = children.find(c => String(c.label) === 'instructions');
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

        assert.ok(children.some(c => String(c.label) === 'other'), 'other bucket should appear');
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

        assert.ok(!children.some(c => String(c.label) === 'other'), 'other bucket should be absent');
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
        assert.ok(typeItems.every(c => c.contextValue === 'artifactTypeFolder'),
            'root-layer: direct children of RepoItem should be ArtifactTypeItems');
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
            classification: 'materialized',
        } as EffectiveFile;
        const skillFile: EffectiveFile = {
            relativePath: '.github/skills/my-skill/SKILL.md',
            sourcePath: '/repo/capabilities/devtools/.github/skills/my-skill/SKILL.md',
            sourceLayer: '/repo/capabilities/devtools',
            sourceRepo: '/repo',
            classification: 'materialized',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([instrFile, skillFile]), () => 'repoTree');
        const roots = provider.getChildren();

        // Root: one RepoItem per distinct sourceLabel (falls back to sourceLayer)
        assert.ok(roots.length > 0);
        const [repoItem] = roots;
        assert.strictEqual(repoItem.contextValue, 'effectiveRepo');

        // Level 2: FolderItem('capabilities') — not a known type so it's a folder
        const level2 = provider.getChildren(repoItem);
        assert.strictEqual(level2.length, 1);
        assert.strictEqual(level2[0].contextValue, 'effectiveFolder', 'capabilities should be a FolderItem');
        assert.strictEqual(String(level2[0].label), 'capabilities');

        // Level 3: FolderItem('devtools')
        const level3 = provider.getChildren(level2[0]);
        assert.strictEqual(level3.length, 1);
        assert.strictEqual(level3[0].contextValue, 'effectiveFolder', 'devtools should be a FolderItem');
        assert.strictEqual(String(level3[0].label), 'devtools');

        // Level 4: ArtifactTypeItems (instructions, skills) — .github is stripped
        const level4 = provider.getChildren(level3[0]);
        assert.ok(level4.length === 2, `expected 2 artifact type items, got ${level4.length}`);
        assert.ok(level4.every(c => c.contextValue === 'artifactTypeFolder'),
            'children of deepest folder should be ArtifactTypeItems');
        assert.deepStrictEqual(
            level4.map(c => String(c.label)).sort(),
            ['instructions', 'skills']
        );

        // Level 5 under instructions: FileItem('foo.md')
        const instrItem = level4.find(c => String(c.label) === 'instructions')!;
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
            `description "${String(fileChildren[0].description)}" should include source label`
        );
    });

    // FTV-AT-07: FolderItem traversal works for skill sub-directories
    test('FTV-AT-07: FolderItem sub-path traversal within skill type', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const files = [
            makeFile('.github/skills/my-skill/SKILL.md',
                '/repo/.github/skills/my-skill/SKILL.md'),
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

    test('FTV-CAP-01: File tooltip includes capability metadata when present', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const file = {
            ...makeFile('.github/instructions/a.md'),
            sourceCapabilityId: 'sdlc-traceability',
            sourceCapabilityName: 'SDLC Traceability',
            sourceCapabilityDescription: 'Traceability metadata capability.',
            sourceCapabilityLicense: 'MIT',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        assert.ok(String(fileNode.tooltip).includes('Capability: SDLC Traceability'));
        assert.ok(String(fileNode.tooltip).includes('Capability Description: Traceability metadata capability.'));
        assert.ok(String(fileNode.tooltip).includes('Capability License: MIT'));
    });

    test('FTV-CAP-02: File tooltip falls back to capability id when name is absent', () => {
        const { FilesTreeViewProvider } = loadFilesTreeView();
        const file = {
            ...makeFile('.github/instructions/a.md'),
            sourceCapabilityId: 'sdlc-traceability',
        } as EffectiveFile;

        const provider = new FilesTreeViewProvider(makeState([file]), () => 'unified');
        const [typeNode] = provider.getChildren();
        const [fileNode] = provider.getChildren(typeNode);

        assert.ok(String(fileNode.tooltip).includes('Capability: sdlc-traceability'));
    });
});
