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

    const registeredTools: Array<{ name: string; tool: unknown }> = [];

    return {
        LanguageModelToolResult,
        LanguageModelTextPart,
        LanguageModelDataPart,
        registeredTools,
        lm: {
            registerTool(name: string, tool: unknown) {
                registeredTools.push({ name, tool });
                return { dispose() {} };
            },
        },
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

    test('formats warning lines and remediation hints in the tool text', async () => {
        const mockVscode = createMockVscode();
        const module = loadDiagnosticsToolWithMock(mockVscode);
        const tool = module.createDiagnosticsTool(() => ({
            capabilityWarnings: [],
            configDiagnostics: [],
            governance: { validationErrors: [] },
            warnings: [
                {
                    category: 'config',
                    message: 'Missing capability',
                    remediationHint: 'Enable the capability',
                },
                {
                    category: 'governance',
                    message: 'Profile not allowed',
                },
            ],
        }));

        const result = (await tool.invoke(
            { input: {} } as never,
            undefined as never,
        )) as ToolResultMock;

        const textPart = result.content[1] as TextPartMock;
        assert.ok(textPart.value.includes('2 warning(s)'));
        assert.ok(textPart.value.includes('Warnings:'));
        assert.ok(textPart.value.includes('Missing capability'));
        assert.ok(textPart.value.includes('Remediation: Enable the capability'));
        assert.ok(textPart.value.includes('Profile not allowed'));
    });

    test('prepareInvocation reports a reading message', () => {
        const mockVscode = createMockVscode();
        const module = loadDiagnosticsToolWithMock(mockVscode);
        const tool = module.createDiagnosticsTool(() => ({
            capabilityWarnings: [],
            configDiagnostics: [],
            governance: { validationErrors: [] },
            warnings: [],
        }));

        const prepared = tool.prepareInvocation?.(
            { input: {} } as never,
            undefined as never,
        ) as { invocationMessage: string };

        assert.strictEqual(prepared.invocationMessage, 'Reading MetaFlow diagnostics');
    });

    test('registerDiagnosticsTool registers the tool and tracks the disposable', () => {
        const mockVscode = createMockVscode();
        const module = loadDiagnosticsToolWithMock(mockVscode);
        const subscriptions: unknown[] = [];

        module.registerDiagnosticsTool({ subscriptions } as never, () => ({
            capabilityWarnings: [],
            configDiagnostics: [],
            governance: { validationErrors: [] },
            warnings: [],
        }));

        const registered = (mockVscode as { registeredTools: Array<{ name: string }> })
            .registeredTools;
        assert.strictEqual(registered.length, 1);
        assert.strictEqual(registered[0].name, module.METAFLOW_DIAGNOSTICS_TOOL_NAME);
        assert.strictEqual(subscriptions.length, 1);
    });
});