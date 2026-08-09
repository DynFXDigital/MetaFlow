import * as assert from 'assert';

type DiagnosticEntry = {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    message: string;
    severity: number;
    source?: string;
    code?: string | number;
};

type DiagnosticCollectionMock = {
    setCalls: Array<{ uri: { fsPath: string }; diagnostics: DiagnosticEntry[] }>;
    deleteCalls: Array<{ fsPath: string }>;
    clearCalls: number;
    entries: Array<{ uri: { fsPath: string }; diagnostics: DiagnosticEntry[] }>;
    set: (uri: { fsPath: string }, diagnostics: DiagnosticEntry[]) => void;
    delete: (uri: { fsPath: string }) => void;
    clear: () => void;
    forEach: (callback: (uri: { fsPath: string }, diagnostics: DiagnosticEntry[]) => void) => void;
};

type ConfigDiagnosticsModule = {
    publishConfigDiagnostics: (
        collection: DiagnosticCollectionMock,
        result: {
            ok: boolean;
            configPath?: string;
            errors?: Array<{ message: string; code?: string; severity?: 'error' | 'warning'; line?: number; column?: number }>;
            warnings?: Array<{ message: string; code?: string; severity?: 'error' | 'warning'; line?: number; column?: number }>;
        },
    ) => void;
    publishConfigWarningDiagnostics: (
        collection: DiagnosticCollectionMock,
        configPath: string | undefined,
        warnings: Array<{
            message: string;
            code?: string | number;
            severity?: 'error' | 'warning' | 'warn';
            startLine?: number;
            startColumn?: number;
        }>,
    ) => void;
    publishGovernanceDiagnostics: (
        collection: DiagnosticCollectionMock,
        result:
            | { ok: true; contractPath?: string }
            | {
                  ok: false;
                  contractPath: string;
                  errors: Array<{ message: string; code?: string; severity?: 'error' | 'warning'; line?: number; column?: number }>;
              },
    ) => void;
    publishGovernanceComplianceDiagnostics: (
        collection: DiagnosticCollectionMock,
        contractPath: string | undefined,
        result: {
            status: 'not-applicable' | 'compliant' | 'non-compliant';
            severity: 'warn' | 'error';
            activeProfile?: string;
            activeProfileLocked: boolean;
            allowedProfiles: string[];
            lockedProfiles: string[];
            violations: Array<{
                id: string;
                code: string;
                severity: 'warn' | 'error';
                message: string;
            }>;
        },
    ) => void;
    clearDiagnostics: (collection: DiagnosticCollectionMock) => void;
    disposeDiagnostics: () => void;
    getDiagnosticsSnapshot: (collection: DiagnosticCollectionMock) => Array<{
        file: string;
        message: string;
        severity: number;
        startLine: number;
        startColumn: number;
        source?: string;
        code?: string | number;
    }>;
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
    const mock: DiagnosticCollectionMock = {
        setCalls: [],
        deleteCalls: [],
        clearCalls: 0,
        entries: [],
        set(uri, diagnostics): void {
            this.setCalls.push({ uri, diagnostics });
            this.entries.push({ uri, diagnostics });
        },
        delete(uri): void {
            this.deleteCalls.push(uri);
        },
        clear(): void {
            this.clearCalls += 1;
        },
        forEach(callback): void {
            for (const entry of this.entries) {
                callback(entry.uri, entry.diagnostics);
            }
        },
    };
    return mock;
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

    test('publishGovernanceDiagnostics maps warning/error severities and stable codes', () => {
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
                public code?: string;

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
                Warning: 'warning',
            },
        });

        const collection = createCollectionMock();
        module.publishGovernanceDiagnostics(collection, {
            ok: false,
            contractPath: '/workspace/.metaflow/governance.jsonc',
            errors: [
                {
                    code: 'GOVERNANCE_INVALID_SEVERITY',
                    severity: 'error',
                    message: 'bad severity',
                    line: 2,
                    column: 1,
                },
                {
                    code: 'GOVERNANCE_ADVISORY',
                    severity: 'warning',
                    message: 'warn first',
                },
            ],
        });

        assert.strictEqual(collection.setCalls.length, 1);
        const call = collection.setCalls[0];
        assert.strictEqual(call.uri.fsPath, '/workspace/.metaflow/governance.jsonc');
        assert.strictEqual(call.diagnostics[0].severity, 'error');
        assert.strictEqual((call.diagnostics[0] as { code?: string }).code, 'GOVERNANCE_INVALID_SEVERITY');
        assert.strictEqual(call.diagnostics[1].severity, 'warning');
        assert.strictEqual((call.diagnostics[1] as { code?: string }).code, 'GOVERNANCE_ADVISORY');
    });

    test('publishConfigWarningDiagnostics maps warning entries to config diagnostics with stable codes', () => {
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
                public code?: string | number;

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
                Warning: 'warning',
            },
        });

        const collection = createCollectionMock();
        module.publishConfigWarningDiagnostics(collection, '/workspace/.metaflow/config.jsonc', [
            {
                code: 'LAYER_PATH_MISSING',
                message:
                    '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
                startLine: 12,
                startColumn: 8,
            },
        ]);

        assert.strictEqual(collection.setCalls.length, 1);
        const call = collection.setCalls[0];
        assert.strictEqual(call.uri.fsPath, '/workspace/.metaflow/config.jsonc');
        assert.strictEqual(call.diagnostics.length, 1);
        assert.strictEqual(call.diagnostics[0].severity, 'warning');
        assert.strictEqual(call.diagnostics[0].source, 'MetaFlow');
        assert.strictEqual(
            (call.diagnostics[0] as { code?: string | number }).code,
            'LAYER_PATH_MISSING',
        );
        assert.deepStrictEqual(call.diagnostics[0].range.start, { line: 12, character: 8 });
    });

    test('publishConfigWarningDiagnostics clears config warning diagnostics when warnings are resolved', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 'error', Warning: 'warning' },
        });

        const collection = createCollectionMock();
        module.publishConfigWarningDiagnostics(collection, '/workspace/.metaflow/config.jsonc', []);

        assert.strictEqual(collection.setCalls.length, 0);
        assert.deepStrictEqual(collection.deleteCalls, [
            { fsPath: '/workspace/.metaflow/config.jsonc' },
        ]);
    });

    test('publishGovernanceComplianceDiagnostics maps violation ids to diagnostic codes', () => {
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
                public code?: string;

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
                Warning: 'warning',
            },
        });

        const collection = createCollectionMock();
        module.publishGovernanceComplianceDiagnostics(
            collection,
            '/workspace/.metaflow/governance.jsonc',
            {
                status: 'non-compliant',
                severity: 'warn',
                activeProfile: 'review',
                activeProfileLocked: false,
                allowedProfiles: ['default'],
                lockedProfiles: ['default'],
                violations: [
                    {
                        id: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
                        code: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED',
                        severity: 'warn',
                        message: 'Active profile "review" is not allowed by governance.',
                    },
                ],
            },
        );

        assert.strictEqual(collection.setCalls.length, 1);
        const call = collection.setCalls[0];
        assert.strictEqual(call.uri.fsPath, '/workspace/.metaflow/governance.jsonc');
        assert.strictEqual(call.diagnostics.length, 1);
        assert.strictEqual(call.diagnostics[0].severity, 'warning');
        assert.strictEqual(
            (call.diagnostics[0] as { code?: string }).code,
            'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
        );
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

    test('publishConfigDiagnostics keeps recoverable load warnings visible on a successful load', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {
                constructor(
                    public startLine: number,
                    public startCol: number,
                    public endLine: number,
                    public endCol: number,
                ) {}
            },
            Diagnostic: class Diagnostic {
                public source?: string;
                public code?: string;

                constructor(
                    public range: unknown,
                    public message: string,
                    public severity: unknown,
                ) {}
            },
            DiagnosticSeverity: {
                Error: 'error',
                Warning: 'warning',
            },
        });

        const collection = createCollectionMock();
        module.publishConfigDiagnostics(collection, {
            ok: true,
            configPath: '/workspace/.metaflow/config.jsonc',
            warnings: [
                {
                    code: 'CONFIG_PROFILE_CAPABILITY_REPO_UNRESOLVED',
                    severity: 'warning',
                    message: 'unresolved capability repository',
                    line: 4,
                    column: 2,
                },
            ],
        });

        assert.strictEqual(collection.setCalls.length, 1);
        assert.strictEqual(collection.setCalls[0].diagnostics.length, 1);
        assert.strictEqual(collection.setCalls[0].diagnostics[0].severity, 'warning');
        assert.strictEqual(
            (collection.setCalls[0].diagnostics[0] as { code?: string }).code,
            'CONFIG_PROFILE_CAPABILITY_REPO_UNRESOLVED',
        );
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

    test('publishConfigWarningDiagnostics is no-op when config path is missing', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 'error', Warning: 'warning' },
        });

        const collection = createCollectionMock();
        module.publishConfigWarningDiagnostics(collection, undefined, [
            { code: 'LAYER_PATH_MISSING', message: 'missing layer' },
        ]);

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

    test('getDiagnosticsSnapshot returns empty array when collection is empty', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 0 },
        });

        const collection = createCollectionMock();
        const snapshot = module.getDiagnosticsSnapshot(collection);

        assert.deepStrictEqual(snapshot, []);
    });

    test('getDiagnosticsSnapshot serializes entries to plain JSON-compatible objects', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 0 },
        });

        const collection = createCollectionMock();
        collection.entries.push({
            uri: { fsPath: '/ws/.metaflow/config.jsonc' },
            diagnostics: [
                {
                    message: 'missing layers',
                    severity: 0,
                    source: 'MetaFlow',
                    code: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
                    range: {
                        start: { line: 2, character: 4 },
                        end: { line: 2, character: 5 },
                    },
                },
                {
                    message: 'unknown field',
                    severity: 1,
                    source: 'MetaFlow',
                    range: {
                        start: { line: 7, character: 0 },
                        end: { line: 7, character: 1 },
                    },
                },
            ],
        });

        const snapshot = module.getDiagnosticsSnapshot(collection);

        assert.strictEqual(snapshot.length, 2);
        assert.deepStrictEqual(snapshot[0], {
            file: '/ws/.metaflow/config.jsonc',
            message: 'missing layers',
            severity: 0,
            startLine: 2,
            startColumn: 4,
            source: 'MetaFlow',
            code: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
        });
        assert.deepStrictEqual(snapshot[1], {
            file: '/ws/.metaflow/config.jsonc',
            message: 'unknown field',
            severity: 1,
            startLine: 7,
            startColumn: 0,
            source: 'MetaFlow',
        });
    });

    test('getDiagnosticsSnapshot is read-only — mutating the result does not affect the collection', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 0 },
        });

        const collection = createCollectionMock();
        collection.entries.push({
            uri: { fsPath: '/ws/.metaflow/config.jsonc' },
            diagnostics: [
                {
                    message: 'err',
                    severity: 0,
                    source: 'MetaFlow',
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 1 },
                    },
                },
            ],
        });

        const snapshot1 = module.getDiagnosticsSnapshot(collection);
        snapshot1.splice(0, 1);

        const snapshot2 = module.getDiagnosticsSnapshot(collection);
        assert.strictEqual(snapshot2.length, 1, 'Collection should be unaffected by mutation of snapshot');
    });

    test('getDiagnosticsSnapshot returns same data on repeated calls (mutation-free)', () => {
        const module = loadConfigDiagnosticsWithMock({
            Uri: { file: (value: string): { fsPath: string } => ({ fsPath: value }) },
            Range: class Range {},
            Diagnostic: class Diagnostic {},
            DiagnosticSeverity: { Error: 0 },
        });

        const collection = createCollectionMock();
        collection.entries.push({
            uri: { fsPath: '/ws/.metaflow/config.jsonc' },
            diagnostics: [
                {
                    message: 'parse error',
                    severity: 0,
                    source: 'MetaFlow',
                    range: {
                        start: { line: 1, character: 0 },
                        end: { line: 1, character: 1 },
                    },
                },
            ],
        });

        const first = module.getDiagnosticsSnapshot(collection);
        const second = module.getDiagnosticsSnapshot(collection);

        assert.deepStrictEqual(first, second);
    });
});
