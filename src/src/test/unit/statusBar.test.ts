/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS require needed for Mocha proxyquire module rewiring */

import * as assert from 'assert';

type StatusBarItemMock = {
    text: string;
    tooltip: string;
    command?: string;
    backgroundColor?: unknown;
    showCalls: number;
    hideCalls: number;
    disposed: boolean;
    show: () => void;
    hide: () => void;
    dispose: () => void;
};

type StatusBarModule = {
    createStatusBar: () => unknown;
    updateStatusBar: (
        state: 'idle' | 'loading' | 'error' | 'drift',
        profile?: string,
        fileCount?: number,
        repoSummary?: { dirtyCount: number; updatesCount: number; pushableCount: number },
    ) => void;
    hideStatusBar: () => void;
    disposeStatusBar: () => void;
};

function loadStatusBarWithMock(mockVscode: unknown): StatusBarModule {
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

    const targetPath = require.resolve('../../views/statusBar');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as StatusBarModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createStatusBarItemMock(): StatusBarItemMock {
    return {
        text: '',
        tooltip: '',
        backgroundColor: undefined,
        showCalls: 0,
        hideCalls: 0,
        disposed: false,
        show: function show(): void {
            this.showCalls += 1;
        },
        hide: function hide(): void {
            this.hideCalls += 1;
        },
        dispose: function dispose(): void {
            this.disposed = true;
        },
    };
}

suite('Status Bar', () => {
    test('createStatusBar initializes once and shows item', () => {
        const item = createStatusBarItemMock();
        let createCount = 0;

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            window: {
                createStatusBarItem: (): StatusBarItemMock => {
                    createCount += 1;
                    return item;
                },
            },
        });

        const first = module.createStatusBar();
        const second = module.createStatusBar();

        assert.strictEqual(first, second);
        assert.strictEqual(createCount, 1);
        assert.strictEqual(item.showCalls, 2);
        assert.strictEqual(item.command, 'metaflow.switchProfile');
    });

    test('updateStatusBar renders idle and loading states', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.updateStatusBar('idle', 'review', 7);
        assert.strictEqual(item.text, '$(layers) MetaFlow: review (7 files)');
        assert.strictEqual(item.tooltip, 'MetaFlow — Click to switch profile');
        assert.strictEqual(item.backgroundColor, undefined);

        module.updateStatusBar('loading');
        assert.strictEqual(item.text, '$(sync~spin) MetaFlow: Loading...');
        assert.strictEqual(item.tooltip, 'MetaFlow — Loading configuration');
    });

    test('updateStatusBar sets warning color for error state', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.updateStatusBar('error');

        assert.strictEqual(item.text, '$(warning) MetaFlow: Error');
        assert.deepStrictEqual(item.backgroundColor, { id: 'statusBarItem.warningBackground' });
    });

    test('updateStatusBar renders drift state', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.updateStatusBar('drift', 'default', 3);

        assert.strictEqual(item.text, '$(info) MetaFlow: default (3 files, drift detected)');
        assert.strictEqual(item.tooltip, 'MetaFlow — Local edits detected in synchronized files');
        assert.strictEqual(item.backgroundColor, undefined);
    });

    test('updateStatusBar appends repository summary when changes exist', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.updateStatusBar('idle', 'default', 5, {
            dirtyCount: 1,
            updatesCount: 2,
            pushableCount: 0,
        });

        assert.strictEqual(
            item.text,
            '$(layers) MetaFlow: default (5 files) | Repos: 1 dirty, 2 updates',
        );
    });

    test('updateStatusBar uses default values and suppresses empty repository summary', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.updateStatusBar('idle', undefined, undefined, {
            dirtyCount: 0,
            updatesCount: 0,
            pushableCount: 3,
        });

        assert.strictEqual(item.text, '$(layers) MetaFlow: default (0 files)');
        assert.strictEqual(item.tooltip, 'MetaFlow — Click to switch profile');
        assert.strictEqual(item.backgroundColor, undefined);
    });

    test('hide and dispose forward to status bar item', () => {
        const item = createStatusBarItemMock();

        const module = loadStatusBarWithMock({
            StatusBarAlignment: { Left: 1 },
            ThemeColor: function ThemeColor(value: string): { id: string } {
                return { id: value };
            },
            window: {
                createStatusBarItem: (): StatusBarItemMock => item,
            },
        });

        module.createStatusBar();
        module.hideStatusBar();
        module.disposeStatusBar();

        assert.strictEqual(item.hideCalls, 1);
        assert.strictEqual(item.disposed, true);
    });
});
