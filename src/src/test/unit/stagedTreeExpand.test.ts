import * as assert from 'assert';

class MockTreeItem {
    id?: string;
    label?: string;
    collapsibleState: number;

    constructor(id: string, label: string, collapsibleState: number) {
        this.id = id;
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

class MockEventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();

    event = (listener: (value: T) => void): { dispose: () => void } => {
        this.listeners.add(listener);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    };

    fire(value: T): void {
        for (const listener of this.listeners) {
            listener(value);
        }
    }
}

const mockVscode = {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
};

type StagedTreeExpandModule = {
    StagedTreeExpandController: new <T extends MockTreeItem>(
        treeView: {
            reveal(element: T, options: unknown): Promise<void>;
            onDidExpandElement(listener: (event: { element: T }) => void): { dispose: () => void };
            onDidCollapseElement(
                listener: (event: { element: T }) => void,
            ): { dispose: () => void };
        },
        provider: {
            onDidChangeTreeData?: (listener: () => void) => { dispose: () => void };
            getExpandAllStrategy(): string;
            getStagedExpandPlan(): { stageOne: T[]; stageTwo: T[]; stages?: T[][] };
        },
    ) => {
        expandAll(): Promise<void>;
        expandAllToCompletion(): Promise<void>;
        reset(): void;
        dispose(): void;
    };
};

function loadStagedTreeExpand(): StagedTreeExpandModule {
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

    const targetPath = require.resolve('../../views/stagedTreeExpand');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as StagedTreeExpandModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('StagedTreeExpandController', () => {
    test('expands capability-depth ancestors before bounded deeper nodes', async () => {
        const { StagedTreeExpandController } = loadStagedTreeExpand();
        const expandEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const collapseEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const refreshEmitter = new MockEventEmitter<void>();
        const revealed: string[] = [];

        const repo = new MockTreeItem('repo', 'Repo', mockVscode.TreeItemCollapsibleState.Collapsed);
        const capabilities = new MockTreeItem(
            'capabilities',
            'capabilities',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );
        const capability = new MockTreeItem(
            'capability',
            'Capability',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );

        const controller = new StagedTreeExpandController(
            {
                async reveal(element) {
                    revealed.push(element.id ?? 'unknown');
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            {
                onDidChangeTreeData: refreshEmitter.event,
                getExpandAllStrategy: () => 'staged',
                getStagedExpandPlan: () => ({
                    stageOne: [repo, capabilities],
                    stageTwo: [capability],
                }),
            },
        );

        await controller.expandAll();
        assert.deepStrictEqual(revealed, ['repo', 'capabilities']);

        await controller.expandAll();
        assert.deepStrictEqual(revealed, ['repo', 'capabilities', 'capability']);

        controller.dispose();
    });

    test('uses real expansion state instead of a raw click counter', async () => {
        const { StagedTreeExpandController } = loadStagedTreeExpand();
        const expandEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const collapseEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const revealed: string[] = [];

        const repo = new MockTreeItem('repo', 'Repo', mockVscode.TreeItemCollapsibleState.Collapsed);
        const capabilities = new MockTreeItem(
            'capabilities',
            'capabilities',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );
        const capability = new MockTreeItem(
            'capability',
            'Capability',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );

        const controller = new StagedTreeExpandController(
            {
                async reveal(element) {
                    revealed.push(element.id ?? 'unknown');
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            {
                getExpandAllStrategy: () => 'staged',
                getStagedExpandPlan: () => ({
                    stageOne: [repo, capabilities],
                    stageTwo: [capability],
                }),
            },
        );

        expandEmitter.fire({ element: repo });
        expandEmitter.fire({ element: capabilities });

        await controller.expandAll();
        assert.deepStrictEqual(
            revealed,
            ['capability'],
            'when capability-depth ancestors are already expanded, the controller should advance to stage two',
        );

        collapseEmitter.fire({ element: capabilities });
        await controller.expandAll();
        assert.deepStrictEqual(revealed, ['capability', 'capabilities']);

        controller.dispose();
    });

    test('refresh-like resets and explicit resets return the controller to stage one', async () => {
        const { StagedTreeExpandController } = loadStagedTreeExpand();
        const expandEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const collapseEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const refreshEmitter = new MockEventEmitter<void>();
        const revealed: string[] = [];

        const repo = new MockTreeItem('repo', 'Repo', mockVscode.TreeItemCollapsibleState.Collapsed);
        const capabilities = new MockTreeItem(
            'capabilities',
            'capabilities',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );
        const capability = new MockTreeItem(
            'capability',
            'Capability',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );

        const controller = new StagedTreeExpandController(
            {
                async reveal(element) {
                    revealed.push(element.id ?? 'unknown');
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            {
                onDidChangeTreeData: refreshEmitter.event,
                getExpandAllStrategy: () => 'staged',
                getStagedExpandPlan: () => ({
                    stageOne: [repo, capabilities],
                    stageTwo: [capability],
                }),
            },
        );

        await controller.expandAll();
        await controller.expandAll();
        assert.deepStrictEqual(revealed, ['repo', 'capabilities', 'capability']);

        refreshEmitter.fire(undefined);
        await controller.expandAll();
        assert.deepStrictEqual(
            revealed,
            ['repo', 'capabilities', 'capability', 'repo', 'capabilities'],
        );

        controller.reset();
        await controller.expandAll();
        assert.deepStrictEqual(
            revealed,
            ['repo', 'capabilities', 'capability', 'repo', 'capabilities', 'repo', 'capabilities'],
        );

        controller.dispose();
    });

    test('supports multiple staged depth passes before stopping', async () => {
        const { StagedTreeExpandController } = loadStagedTreeExpand();
        const expandEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const collapseEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const revealed: string[] = [];

        const repo = new MockTreeItem('repo', 'Repo', mockVscode.TreeItemCollapsibleState.Collapsed);
        const capabilities = new MockTreeItem(
            'capabilities',
            'capabilities',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );
        const devtools = new MockTreeItem(
            'devtools',
            'devtools',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );

        const controller = new StagedTreeExpandController(
            {
                async reveal(element) {
                    revealed.push(element.id ?? 'unknown');
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            {
                getExpandAllStrategy: () => 'staged',
                getStagedExpandPlan: () => ({
                    stageOne: [repo],
                    stageTwo: [capabilities],
                    stages: [[repo], [capabilities], [devtools]],
                }),
            },
        );

        await controller.expandAll();
        await controller.expandAll();
        await controller.expandAll();

        assert.deepStrictEqual(revealed, ['repo', 'capabilities', 'devtools']);

        await controller.expandAll();
        assert.deepStrictEqual(
            revealed,
            ['repo', 'capabilities', 'devtools'],
            'once all planned stages are expanded, further calls should stop',
        );

        controller.dispose();
    });

    test('can expand every planned staged level in one call', async () => {
        const { StagedTreeExpandController } = loadStagedTreeExpand();
        const expandEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const collapseEmitter = new MockEventEmitter<{ element: MockTreeItem }>();
        const revealed: string[] = [];

        const repo = new MockTreeItem('repo', 'Repo', mockVscode.TreeItemCollapsibleState.Collapsed);
        const capabilities = new MockTreeItem(
            'capabilities',
            'capabilities',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );
        const devtools = new MockTreeItem(
            'devtools',
            'devtools',
            mockVscode.TreeItemCollapsibleState.Collapsed,
        );

        const controller = new StagedTreeExpandController(
            {
                async reveal(element) {
                    revealed.push(element.id ?? 'unknown');
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            {
                getExpandAllStrategy: () => 'staged',
                getStagedExpandPlan: () => ({
                    stageOne: [repo],
                    stageTwo: [capabilities],
                    stages: [[repo], [capabilities], [devtools]],
                }),
            },
        );

        await controller.expandAllToCompletion();

        assert.deepStrictEqual(revealed, ['repo', 'capabilities', 'devtools']);

        await controller.expandAllToCompletion();
        assert.deepStrictEqual(
            revealed,
            ['repo', 'capabilities', 'devtools'],
            'once all planned stages are expanded, repeated full expansion should stop',
        );

        controller.dispose();
    });
});