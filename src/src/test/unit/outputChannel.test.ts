/* eslint-disable @typescript-eslint/no-var-requires */

import * as assert from 'assert';

type OutputChannelMock = {
    lines: string[];
    showCalls: boolean[];
    disposed: boolean;
    appendLine: (value: string) => void;
    show: (preserveFocus?: boolean) => void;
    dispose: () => void;
};

type OutputChannelModule = {
    getOutputChannel: () => unknown;
    setLogLevel: (level: 'debug' | 'info' | 'warn' | 'error') => void;
    getLogLevel: () => 'debug' | 'info' | 'warn' | 'error';
    logDebug: (message: string) => void;
    logInfo: (message: string) => void;
    logWarn: (message: string) => void;
    logError: (message: string) => void;
    showOutputChannel: (preserveFocus?: boolean) => void;
    disposeOutputChannel: () => void;
};

function loadOutputChannelWithMock(mockVscode: unknown): OutputChannelModule {
    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;
    moduleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
        if (request === 'vscode') {
            return mockVscode;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../views/outputChannel');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as OutputChannelModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createOutputChannelMock(): OutputChannelMock {
    const lines: string[] = [];
    const showCalls: boolean[] = [];
    let disposed = false;

    return {
        lines,
        showCalls,
        get disposed(): boolean {
            return disposed;
        },
        appendLine: (value: string): void => {
            lines.push(value);
        },
        show: (preserveFocus = true): void => {
            showCalls.push(preserveFocus);
        },
        dispose: (): void => {
            disposed = true;
        },
    };
}

suite('Output Channel', () => {
    test('creates channel lazily and reuses singleton instance', () => {
        const channel = createOutputChannelMock();
        let createCount = 0;

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => {
                    createCount += 1;
                    return channel;
                },
            },
        });

        const first = module.getOutputChannel();
        const second = module.getOutputChannel();

        assert.strictEqual(first, second);
        assert.strictEqual(createCount, 1);
    });

    test('respects configured minimum log level', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.setLogLevel('warn');
        assert.strictEqual(module.getLogLevel(), 'warn');

        module.logInfo('ignored');
        module.logWarn('included');

        assert.strictEqual(channel.lines.length, 1);
        assert.ok(channel.lines[0].includes('[WARN] included'));
    });

    test('logDebug emits when debug level is enabled', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.setLogLevel('debug');
        module.logDebug('trace');

        assert.strictEqual(channel.lines.length, 1);
        assert.ok(channel.lines[0].includes('[DEBUG] trace'));
    });

    test('shows output channel on error logs', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.logError('boom');

        assert.strictEqual(channel.showCalls.length, 1);
        assert.strictEqual(channel.showCalls[0], true);
        assert.ok(channel.lines[0].includes('[ERROR] boom'));
    });

    test('dispose resets singleton and allows recreation', () => {
        const channels: OutputChannelMock[] = [];

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => {
                    const channel = createOutputChannelMock();
                    channels.push(channel);
                    return channel;
                },
            },
        });

        const first = module.getOutputChannel();
        module.disposeOutputChannel();
        const second = module.getOutputChannel();

        assert.notStrictEqual(first, second);
        assert.strictEqual(channels.length, 2);
    });

    test('showOutputChannel forwards preserveFocus flag', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.showOutputChannel(false);

        assert.strictEqual(channel.showCalls.length, 1);
        assert.strictEqual(channel.showCalls[0], false);
    });

    test('disposeOutputChannel is safe when channel was never created', () => {
        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => createOutputChannelMock(),
            },
        });

        assert.doesNotThrow(() => module.disposeOutputChannel());
    });
});
