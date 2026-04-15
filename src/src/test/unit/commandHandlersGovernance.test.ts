import * as assert from 'assert';

const mockVscode = {
    window: {
        showWarningMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: {
        workspaceFolders: undefined as unknown,
        getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
    },
    TreeItemCheckboxState: { Checked: 1, Unchecked: 0 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    EventEmitter: class {
        event(listener: unknown): { dispose: () => void } {
            void listener;
            return { dispose: () => {} };
        }
        fire(value: unknown): void {
            void value;
        }
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
};

function loadCommandHandlers(): typeof import('../../commands/commandHandlers') {
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

    const targetPath = require.resolve('../../commands/commandHandlers');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as typeof import('../../commands/commandHandlers');
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createBuiltInState(overrides?: Partial<{
    enabled: boolean;
    layerEnabled: boolean;
    disabledByUser: boolean;
    synchronizedFiles: string[];
    layerStates: Record<string, boolean>;
    sourceRoot: string;
}>): {
    enabled: boolean;
    layerEnabled: boolean;
    disabledByUser: boolean;
    synchronizedFiles: string[];
    layerStates: Record<string, boolean>;
    sourceRoot: string;
    sourceId: string;
    sourceDisplayName: string;
} {
    return {
        enabled: overrides?.enabled ?? false,
        layerEnabled: overrides?.layerEnabled ?? true,
        disabledByUser: overrides?.disabledByUser ?? false,
        synchronizedFiles: overrides?.synchronizedFiles ?? [],
        layerStates: overrides?.layerStates ?? {},
        sourceRoot: overrides?.sourceRoot ?? 'C:/built-in-metaflow',
        sourceId: 'dynfxdigital.metaflow-ai',
        sourceDisplayName: 'MetaFlow',
    };
}

suite('Governed mutation preview decisions', () => {
    test('allows mutations when the governance contract is absent', () => {
        const { previewGovernedMutationDecision } = loadCommandHandlers();

        const decision = previewGovernedMutationDecision({
            contract: undefined,
            contractPath: undefined,
            candidateConfig: {
                metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: false }],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
            } as never,
            candidateBuiltInCapability: createBuiltInState(),
            actionLabel: 'toggling layer primary/standards/sdlc',
        });

        assert.strictEqual(decision.effect, 'allow');
        assert.deepStrictEqual(decision.detailLines, []);
    });

    test('blocks error-severity profile violations with stable id and remediation guidance', () => {
        const { previewGovernedMutationDecision } = loadCommandHandlers();

        const decision = previewGovernedMutationDecision({
            contract: {
                severity: 'error',
                allowedProfiles: ['default'],
            } as never,
            contractPath: 'C:/workspace/.metaflow/governance.jsonc',
            candidateConfig: {
                metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                profiles: {
                    default: { enable: ['**/*'] },
                    review: { enable: ['**/*'] },
                },
                activeProfile: 'review',
            } as never,
            candidateBuiltInCapability: createBuiltInState(),
            actionLabel: 'switching profile to Review',
        });

        assert.strictEqual(decision.effect, 'block');
        assert.ok(
            decision.summary?.includes('[GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review]'),
            `Expected stable violation id in summary, got: ${decision.summary}`,
        );
        assert.ok(
            decision.detailLines.some((line) =>
                line.includes('Switch to one of the allowed profiles (default) and retry.'),
            ),
            `Expected remediation guidance in detail lines, got: ${decision.detailLines.join('\n')}`,
        );
    });

    test('warns for warn-severity capability violations and preserves remediation text', () => {
        const { previewGovernedMutationDecision } = loadCommandHandlers();

        const decision = previewGovernedMutationDecision({
            contract: {
                severity: 'warn',
                requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
            } as never,
            contractPath: 'C:/workspace/.metaflow/governance.jsonc',
            candidateConfig: {
                metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: false }],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
            } as never,
            candidateBuiltInCapability: createBuiltInState(),
            actionLabel: 'toggling layer primary/standards/sdlc',
        });

        assert.strictEqual(decision.effect, 'warn');
        assert.ok(
            decision.summary?.includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc]',
            ),
            `Expected stable violation id in summary, got: ${decision.summary}`,
        );
        assert.ok(
            decision.detailLines.some((line) =>
                line.includes(
                    'Ensure primary/standards/sdlc is active in the candidate runtime state, then retry.',
                ),
            ),
            `Expected remediation guidance in detail lines, got: ${decision.detailLines.join('\n')}`,
        );
    });

    test('evaluates built-in candidate state through the same preview path', () => {
        const { previewGovernedMutationDecision } = loadCommandHandlers();

        const decision = previewGovernedMutationDecision({
            contract: {
                severity: 'error',
                requiredCapabilities: [{ repoId: '__metaflow_builtin__', path: '.' }],
            } as never,
            contractPath: 'C:/workspace/.metaflow/governance.jsonc',
            candidateConfig: {
                metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                layerSources: [],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
            } as never,
            candidateBuiltInCapability: createBuiltInState({
                enabled: false,
                layerEnabled: false,
                disabledByUser: true,
                layerStates: {},
            }),
            actionLabel: 'toggling repo source __metaflow_builtin__',
        });

        assert.strictEqual(decision.effect, 'block');
        assert.ok(
            decision.summary?.includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::__metaflow_builtin__::.]',
            ),
            `Expected built-in stable violation id in summary, got: ${decision.summary}`,
        );
    });
});
