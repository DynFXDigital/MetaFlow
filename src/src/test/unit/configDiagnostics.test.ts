import * as assert from 'assert';

type DiagnosticEntry = {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    message: string;
    severity: unknown;
    source?: string;
};

type DiagnosticCollectionMock = {
    setCalls: Array<{ uri: { fsPath: string }; diagnostics: DiagnosticEntry[] }>;
    deleteCalls: Array<{ fsPath: string }>;
    clearCalls: number;
    set: (uri: { fsPath: string }, diagnostics: DiagnosticEntry[]) => void;
    delete: (uri: { fsPath: string }) => void;
    clear: () => void;
};

type ConfigDiagnosticsModule = {
    publishConfigDiagnostics: (
        collection: DiagnosticCollectionMock,
        result: {
            ok: boolean;
            configPath?: string;
            errors: Array<{ message: string; line?: number; column?: number }>;
        },
    ) => void;
    clearDiagnostics: (collection: DiagnosticCollectionMock) => void;
    disposeDiagnostics: () => void;
};

function loadConfigDiagnosticsWithMock(mockVscode: unknown): ConfigDiagnosticsModule {
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

    const targetPath = require.resolve('../../diagnostics/configDiagnostics');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as ConfigDiagnosticsModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createCollectionMock(): DiagnosticCollectionMock {
    return {
        setCalls: [],
        deleteCalls: [],
        clearCalls: 0,
        set(uri, diagnostics): void {
            this.setCalls.push({ uri, diagnostics });
        },
        delete(uri): void {
            this.deleteCalls.push(uri);
        },
        clear(): void {
            this.clearCalls += 1;
        },
    };
}

suite('Config Diagnostics', () => {
    test('publishConfigDiagnostics maps errors to diagnostics with source and range', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: {
                file: (value: string): { fsPath: string } => ({ fsPath: value }),
            },
            Range: class Range {
                constructor(
                    public startLine: number,
                    public startCol: number,
                    public endLine: number,
                    public endCol: number,
                ) {}

                get start(): { line: number; character: number } {
                    return { line: this.startLine, character: this.startCol };
                }

                get end(): { line: number; character: number } {
                    return { line: this.endLine, character: this.endCol };
                }
            },
            Diagnostic: class Diagnostic {
                public source?: string;

                constructor(
                    public range: {
                        start: { line: number; character: number };
                        end: { line: number; character: number };
                    },
                    public message: string,
                    public severity: unknown,
                ) {}
            },
            DiagnosticSeverity: {
                Error: 'error',
            },
        });

        const collection = createCollectionMock();

        module.publishConfigDiagnostics(collection, {
            ok: false,
            configPath: '/workspace/.metaflow/config.jsonc',
            errors: [
                { message: 'missing field', line: 3, column: 5 },
                { message: 'default range' },
            ],
        });

        assert.strictEqual(collection.setCalls.length, 1);
        const call = collection.setCalls[0];
        assert.strictEqual(call.uri.fsPath, '/workspace/.metaflow/config.jsonc');
        assert.strictEqual(call.diagnostics.length, 2);
        assert.strictEqual(call.diagnostics[0].message, 'missing field');
        assert.strictEqual(call.diagnostics[0].source, 'MetaFlow');
        assert.deepStrictEqual(call.diagnostics[0].range.start, { line: 3, character: 5 });
        assert.deepStrictEqual(call.diagnostics[0].range.end, { line: 3, character: 6 });
        assert.deepStrictEqual(call.diagnostics[1].range.start, { line: 0, character: 0 });
    });

    test('publishConfigDiagnostics clears stale diagnostics for a successful load', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 'error' },
        });

        const collection = createCollectionMock();
        module.publishConfigDiagnostics(collection, {
            ok: true,
            configPath: '/workspace/.metaflow/config.jsonc',
            errors: [],
        });

        assert.strictEqual(collection.setCalls.length, 0);
        assert.deepStrictEqual(collection.deleteCalls, [
            { fsPath: '/workspace/.metaflow/config.jsonc' },
        ]);
    });

    test('publishConfigDiagnostics is no-op when config path is missing', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 'error' },
        });

        const collection = createCollectionMock();
        module.publishConfigDiagnostics(collection, {
            ok: false,
            errors: [{ message: 'bad config' }],
        });

        assert.strictEqual(collection.setCalls.length, 0);
        assert.strictEqual(collection.deleteCalls.length, 0);
    });

    test('clearDiagnostics delegates to collection.clear and disposeDiagnostics is safe', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 'error' },
        });

        const collection = createCollectionMock();
        module.clearDiagnostics(collection);
        module.disposeDiagnostics();

        assert.strictEqual(collection.clearCalls, 1);
    });
});
