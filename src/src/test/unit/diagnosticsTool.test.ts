import * as assert from 'assert';

type DataPartMock = {
    mimeType: string;
    data: Uint8Array;
};

type TextPartMock = {
    value: string;
};

type ToolResultMock = {
    content: unknown[];
};

type DiagnosticsToolModule = typeof import('../../agentTools/diagnosticsTool');

function loadDiagnosticsToolWithMock(mockVscode: unknown): DiagnosticsToolModule {
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

    const targetPath = require.resolve('../../agentTools/diagnosticsTool');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as DiagnosticsToolModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createMockVscode() {
    class LanguageModelToolResult {
        content: unknown[];

        constructor(content: unknown[]) {
            this.content = content;
        }
    }

    class LanguageModelTextPart {
        value: string;

        constructor(value: string) {
            this.value = value;
        }
    }

    class LanguageModelDataPart {
        mimeType: string;
        data: Uint8Array;

        constructor(mimeType: string, data: Uint8Array) {
            this.mimeType = mimeType;
            this.data = data;
        }

        static json(value: unknown): DataPartMock {
            return {
                mimeType: 'application/json',
                data: Buffer.from(JSON.stringify(value), 'utf-8'),
            };
        }
    }

    return {
        LanguageModelToolResult,
        LanguageModelTextPart,
        LanguageModelDataPart,
    };
}

suite('Diagnostics Tool', () => {
    test('refreshes stale state before reading the snapshot when callback is provided', async () => {
        const order: string[] = [];
        const mockVscode = createMockVscode();
        const module = loadDiagnosticsToolWithMock(mockVscode);
        const tool = module.createDiagnosticsTool(
            () => {
                order.push('snapshot');
                return {
                    capabilityWarnings: [],
                    configDiagnostics: [],
                    governance: { validationErrors: [] },
                    warnings: [],
                };
            },
            async () => {
                order.push('refresh');
            },
        );

        const result = (await tool.invoke(
            { input: {} } as never,
            undefined as never,
        )) as ToolResultMock;

        assert.deepStrictEqual(order, ['refresh', 'snapshot']);
        const textPart = result.content[1] as TextPartMock;
        assert.strictEqual(textPart.value, 'MetaFlow diagnostics snapshot: 0 warning(s), 0 config diagnostic(s).\nNo active warnings.');
    });

    test('reads the snapshot directly when no stale-state callback is provided', async () => {
        const order: string[] = [];
        const mockVscode = createMockVscode();
        const module = loadDiagnosticsToolWithMock(mockVscode);
        const tool = module.createDiagnosticsTool(() => {
            order.push('snapshot');
            return {
                capabilityWarnings: [],
                configDiagnostics: [],
                governance: { validationErrors: [] },
                warnings: [],
            };
        });

        await tool.invoke({ input: {} } as never, undefined as never);

        assert.deepStrictEqual(order, ['snapshot']);
    });
});