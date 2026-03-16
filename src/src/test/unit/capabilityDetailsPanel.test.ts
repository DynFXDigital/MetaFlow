import * as assert from 'assert';

class MockDisposable {
    disposed = false;

    dispose(): void {
        this.disposed = true;
    }
}

class MockWebview {
    html = '';
    cspSource = 'vscode-webview://panel';
}

class MockWebviewPanel {
    readonly webview = new MockWebview();
    readonly disposeRegistration = new MockDisposable();
    title: string;
    viewType: string;
    viewColumn: number | undefined;
    revealCalls: Array<{ viewColumn: number | undefined; preserveFocus: boolean }> = [];
    private readonly disposeListeners: Array<() => void> = [];

    constructor(viewType: string, title: string, viewColumn: number | undefined) {
        this.viewType = viewType;
        this.title = title;
        this.viewColumn = viewColumn;
    }

    onDidDispose(listener: () => void): { dispose: () => void } {
        this.disposeListeners.push(listener);
        return this.disposeRegistration;
    }

    reveal(viewColumn: number | undefined, preserveFocus: boolean): void {
        this.viewColumn = viewColumn;
        this.revealCalls.push({ viewColumn, preserveFocus });
    }

    dispose(): void {
        const listeners = [...this.disposeListeners];
        for (const listener of listeners) {
            listener();
        }
    }
}

const createdPanels: MockWebviewPanel[] = [];
const createWebviewPanelCalls: Array<{
    viewType: string;
    title: string;
    showOptions: { viewColumn: number | undefined; preserveFocus: boolean };
    options: {
        enableFindWidget: boolean;
        enableScripts: boolean;
        enableCommandUris: string[];
        localResourceRoots: unknown[];
    };
}> = [];

const mockVscode = {
    ViewColumn: {
        Active: -1,
        One: 1,
        Two: 2,
    },
    window: {
        activeTextEditor: undefined as { viewColumn?: number } | undefined,
        createWebviewPanel: (
            viewType: string,
            title: string,
            showOptions: { viewColumn: number | undefined; preserveFocus: boolean },
            options: {
                enableFindWidget: boolean;
                enableScripts: boolean;
                enableCommandUris: string[];
                localResourceRoots: unknown[];
            },
        ): MockWebviewPanel => {
            createWebviewPanelCalls.push({ viewType, title, showOptions, options });
            const panel = new MockWebviewPanel(viewType, title, showOptions.viewColumn);
            createdPanels.push(panel);
            return panel;
        },
    },
};

type CapabilityDetailsPanelModule = typeof import('../../views/capabilityDetailsPanel');

function resetMocks(): void {
    createdPanels.length = 0;
    createWebviewPanelCalls.length = 0;
    mockVscode.window.activeTextEditor = undefined;
}

function loadCapabilityDetailsPanel(): CapabilityDetailsPanelModule {
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
        if (request === './capabilityDetailsHtml' || request.endsWith('/capabilityDetailsHtml')) {
            return {
                renderCapabilityDetailsHtml: (
                    model: { title: string },
                    options: { cspSource: string; nonce: string },
                ) => `html:${model.title}:${options.cspSource}:${options.nonce.length}`,
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../views/capabilityDetailsPanel');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as CapabilityDetailsPanelModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('CapabilityDetailsPanelManager', () => {
    setup(() => {
        resetMocks();
    });

    test('creates a panel on first show and returns a populated snapshot', () => {
        const { CapabilityDetailsPanelManager, CAPABILITY_DETAILS_WEBVIEW_TYPE } =
            loadCapabilityDetailsPanel();
        mockVscode.window.activeTextEditor = { viewColumn: mockVscode.ViewColumn.Two };
        const manager = new CapabilityDetailsPanelManager();

        const snapshot = manager.show(
            { title: 'Capability A' } as never,
            { layerIndex: 0, repoId: 'primary' } as never,
        );

        assert.strictEqual(createWebviewPanelCalls.length, 1);
        assert.strictEqual(createWebviewPanelCalls[0].viewType, CAPABILITY_DETAILS_WEBVIEW_TYPE);
        assert.deepStrictEqual(createWebviewPanelCalls[0].showOptions, {
            viewColumn: mockVscode.ViewColumn.Two,
            preserveFocus: false,
        });
        assert.deepStrictEqual(createWebviewPanelCalls[0].options, {
            enableFindWidget: true,
            enableScripts: false,
            enableCommandUris: ['metaflow.toggleLayer'],
            localResourceRoots: [],
        });
        assert.strictEqual(snapshot.viewType, CAPABILITY_DETAILS_WEBVIEW_TYPE);
        assert.strictEqual(snapshot.title, 'Capability Details: Capability A');
        assert.strictEqual(snapshot.viewColumn, mockVscode.ViewColumn.Two);
        assert.strictEqual(snapshot.html, 'html:Capability A:vscode-webview://panel:32');
        assert.deepStrictEqual(manager.getCurrentRequest(), { layerIndex: 0, repoId: 'primary' });
        assert.ok(snapshot.panelId.length > 0);

        manager.dispose();
    });

    test('reuses the existing panel, reveals it, and updates the current request', () => {
        const { CapabilityDetailsPanelManager } = loadCapabilityDetailsPanel();
        const manager = new CapabilityDetailsPanelManager();

        const firstSnapshot = manager.show(
            { title: 'Capability A' } as never,
            { layerIndex: 0, repoId: 'primary' } as never,
        );
        mockVscode.window.activeTextEditor = { viewColumn: mockVscode.ViewColumn.One };

        const secondSnapshot = manager.show(
            { title: 'Capability B' } as never,
            { layerIndex: 2, repoId: 'secondary' } as never,
        );

        assert.strictEqual(createWebviewPanelCalls.length, 1);
        assert.strictEqual(createdPanels[0].revealCalls.length, 1);
        assert.deepStrictEqual(createdPanels[0].revealCalls[0], {
            viewColumn: mockVscode.ViewColumn.One,
            preserveFocus: false,
        });
        assert.strictEqual(secondSnapshot.panelId, firstSnapshot.panelId);
        assert.strictEqual(secondSnapshot.title, 'Capability Details: Capability B');
        assert.strictEqual(secondSnapshot.html, 'html:Capability B:vscode-webview://panel:32');
        assert.deepStrictEqual(manager.getCurrentRequest(), {
            layerIndex: 2,
            repoId: 'secondary',
        });

        manager.dispose();
    });

    test('reset state when the panel is disposed externally', () => {
        const { CapabilityDetailsPanelManager } = loadCapabilityDetailsPanel();
        const manager = new CapabilityDetailsPanelManager();
        manager.update({ title: 'ignored' } as never);

        assert.strictEqual(manager.getSnapshot(), undefined);

        manager.show(
            { title: 'Capability A' } as never,
            { layerIndex: 0, repoId: 'primary' } as never,
        );
        createdPanels[0].dispose();

        assert.strictEqual(manager.getSnapshot(), undefined);
        assert.strictEqual(manager.getCurrentRequest(), undefined);

        manager.dispose();
    });

    test('dispose tears down the panel and clears the registered disposable', () => {
        const { CapabilityDetailsPanelManager } = loadCapabilityDetailsPanel();
        const manager = new CapabilityDetailsPanelManager();
        manager.show(
            { title: 'Capability A' } as never,
            { layerIndex: 0, repoId: 'primary' } as never,
        );

        const registeredDisposable = createdPanels[0].disposeRegistration;
        manager.dispose();

        assert.strictEqual(registeredDisposable.disposed, true);
        assert.strictEqual(manager.getSnapshot(), undefined);
        assert.strictEqual(manager.getCurrentRequest(), undefined);
    });
});
