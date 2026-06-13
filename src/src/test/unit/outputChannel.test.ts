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
    log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
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

    test('applies log level changes to subsequent calls', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.setLogLevel('error');
        module.logWarn('suppressed at error');
        module.logError('allowed at error');

        module.setLogLevel('debug');
        module.logDebug('allowed at debug');
        module.logInfo('allowed after lowering threshold');

        assert.strictEqual(channel.lines.length, 3);
        assert.ok(channel.lines[0].includes('[ERROR] allowed at error'));
        assert.ok(channel.lines[1].includes('[DEBUG] allowed at debug'));
        assert.ok(channel.lines[2].includes('[INFO] allowed after lowering threshold'));
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

    test('convenience methods preserve severity and only error auto-shows the channel', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        module.setLogLevel('debug');
        module.logInfo('info message');
        module.logWarn('warn message');
        module.logError('error message');

        assert.strictEqual(channel.lines.length, 3);
        assert.ok(channel.lines[0].includes('[INFO] info message'));
        assert.ok(channel.lines[1].includes('[WARN] warn message'));
        assert.ok(channel.lines[2].includes('[ERROR] error message'));
        assert.deepStrictEqual(channel.showCalls, [true]);
    });

    test('log preserves newline and special characters in the appended message', () => {
        const channel = createOutputChannelMock();

        const module = loadOutputChannelWithMock({
            window: {
                createOutputChannel: (): OutputChannelMock => channel,
            },
        });

        const message = 'line one\nline two\t!@#$%^&*() [] {}';
        module.log('info', message);

        assert.strictEqual(channel.lines.length, 1);
        assert.match(channel.lines[0], /^\[[^\]]+\] \[INFO\] /);
        assert.ok(channel.lines[0].endsWith(` ${message}`));
        assert.strictEqual(channel.showCalls.length, 0);
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

    test('disposeOutputChannel is safe to call repeatedly and recreated channel remains usable', () => {
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

        module.getOutputChannel();
        module.disposeOutputChannel();
        module.disposeOutputChannel();

        module.logInfo('after recreate');

        assert.strictEqual(channels.length, 2);
        assert.strictEqual(channels[0].disposed, true);
        assert.strictEqual(channels[1].disposed, false);
        assert.strictEqual(channels[1].lines.length, 1);
        assert.ok(channels[1].lines[0].includes('[INFO] after recreate'));
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
