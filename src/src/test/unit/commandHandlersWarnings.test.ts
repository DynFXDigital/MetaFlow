import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Minimal vscode mock to allow commandHandlers to load in unit tests.
const mockVscode = {
    window: {
        showWarningMessage: async () => undefined,
        showInformationMessage: async () => undefined,
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

function loadCommandHelpers(): typeof import('../../commands/commandHelpers') {
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

    const targetPath = require.resolve('../../commands/commandHelpers');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as typeof import('../../commands/commandHelpers');
    } finally {
        moduleInternals._load = originalLoad;
    }
}

suite('Command handler configured source warnings', () => {
    test('configured capability diagnostics only include enabled repositories and capabilities', () => {
        const { collectConfiguredCapabilityDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-active-capability-warnings-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            const activeRoot = path.join(repoRoot, 'capabilities', 'active');
            const inactiveRoot = path.join(repoRoot, 'capabilities', 'inactive');
            fs.mkdirSync(activeRoot, { recursive: true });
            fs.mkdirSync(inactiveRoot, { recursive: true });

            for (const capabilityRoot of [activeRoot, inactiveRoot]) {
                fs.writeFileSync(
                    path.join(capabilityRoot, 'CAPABILITY.md'),
                    ['---', 'name: Plugin Capability', 'agentPlugin: true', '---', ''].join('\n'),
                    'utf-8',
                );
            }

            const warnings = collectConfiguredCapabilityDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/active', enabled: true },
                        { repoId: 'primary', path: 'capabilities/inactive', enabled: false },
                    ],
                } as never,
                workspaceRoot,
            );

            assert.ok(warnings.length > 0);
            assert.ok(
                warnings.every((warning) =>
                    warning.filePath?.includes(path.join('capabilities', 'active')),
                ),
                'Only the enabled capability should contribute manifest diagnostics',
            );
            assert.ok(
                warnings.some((warning) => warning.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING'),
            );
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('disabled repositories do not contribute configured capability diagnostics', () => {
        const { collectConfiguredCapabilityDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-disabled-repo-warnings-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            const capabilityRoot = path.join(repoRoot, 'capabilities', 'inactive');
            fs.mkdirSync(capabilityRoot, { recursive: true });
            fs.writeFileSync(
                path.join(capabilityRoot, 'CAPABILITY.md'),
                ['---', 'name: Plugin Capability', 'agentPlugin: true', '---', ''].join('\n'),
                'utf-8',
            );

            const warnings = collectConfiguredCapabilityDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: false }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/inactive', enabled: true },
                    ],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('enabled missing layer path produces a diagnostic warning payload', () => {
        const { collectEnabledConfiguredSourceDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-missing-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectEnabledConfiguredSourceDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: true },
                    ],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, [
                {
                    code: 'LAYER_PATH_MISSING',
                    message:
                        '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
                },
            ]);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('disabled missing layer path does not produce a diagnostic warning payload', () => {
        const { collectEnabledConfiguredSourceDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-disabled-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectEnabledConfiguredSourceDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: false },
                    ],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('enabled missing layer path still produces a general configured-source warning', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-enabled-general-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectConfiguredSourceWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: true },
                    ],
                } as never,
                workspaceRoot,
                [] as never,
            );

            assert.deepStrictEqual(warnings, [
                        '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
            ]);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('disabled missing layer path does not produce a general configured-source warning', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-disabled-general-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectConfiguredSourceWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: false },
                    ],
                } as never,
                workspaceRoot,
                [] as never,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('profile-projected disabled missing layer path does not produce a general configured-source warning', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-profile-disabled-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectConfiguredSourceWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: false },
                    ],
                    activeProfile: 'default',
                    profiles: {
                        default: {
                            layerOverrides: [
                                {
                                    repoId: 'primary',
                                    path: 'capabilities/ghost',
                                    enabled: false,
                                },
                            ],
                        },
                    },
                } as never,
                workspaceRoot,
                [] as never,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('profile layerOverride disabling an authored-enabled source suppresses its missing-path warning end to end', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const { projectConfigForProfile } = loadCommandHelpers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-projection-chain-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            // Source is authored ENABLED; only the active profile disables it via layerOverride.
            const authoredConfig = {
                metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                layerSources: [{ repoId: 'primary', path: 'capabilities/ghost', enabled: true }],
                activeProfile: 'default',
                profiles: {
                    default: {
                        layerOverrides: [
                            { repoId: 'primary', path: 'capabilities/ghost', enabled: false },
                        ],
                    },
                },
            } as never;

            // Without projection, the enabled authored source still warns (guards the assertion).
            const unprojected = collectConfiguredSourceWarnings(
                authoredConfig,
                workspaceRoot,
                [] as never,
            );
            assert.deepStrictEqual(unprojected, [
                        '[LAYER_PATH_MISSING] Configured capability path "primary/capabilities/ghost" does not exist or is not currently mounted.',
            ]);

            // After profile projection flips enabled to false, the warning is suppressed.
            const projected = projectConfigForProfile(authoredConfig);
            const warnings = collectConfiguredSourceWarnings(
                projected,
                workspaceRoot,
                [] as never,
            );
            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('existing enabled layer path does not produce a diagnostic warning payload', () => {
        const { collectEnabledConfiguredSourceDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-found-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            const layerRoot = path.join(repoRoot, 'capabilities', 'ghost');
            fs.mkdirSync(layerRoot, { recursive: true });

            const warnings = collectEnabledConfiguredSourceDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/ghost', enabled: true },
                    ],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('LAYER_PATH_EMPTY warning is emitted for stale empty configured capabilities', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-empty-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            const layerRoot = path.join(repoRoot, 'capabilities', 'obsolete');
            fs.mkdirSync(layerRoot, { recursive: true });

            const warnings = collectConfiguredSourceWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'capabilities/obsolete', enabled: true },
                    ],
                } as never,
                workspaceRoot,
                [
                    {
                        layerId: 'primary/capabilities/obsolete',
                        repoId: 'primary',
                        files: [],
                    },
                ] as never,
            );

            assert.ok(
                warnings.some((warning) => warning.startsWith('[LAYER_PATH_EMPTY]')),
                `Expected stale empty layer warning, got: ${warnings.join('\n')}`,
            );
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('suppresses built-in root overlap conflicts when a nested built-in capability wins', () => {
        const { shouldSuppressBuiltInSurfacedFileConflictWarning } = loadCommandHandlers();

        const suppressed = shouldSuppressBuiltInSurfacedFileConflictWarning({
            relativePath: 'instructions/ai-metadata-agent.instructions.md',
            winner: {
                relativePath: 'instructions/ai-metadata-agent.instructions.md',
                sourcePath: '/tmp/nested',
                sourceLayer:
                    '__metaflow_builtin__/capabilities/metadata-authoring/github-copilot-metadata-authoring',
                sourceRepo: '__metaflow_builtin__',
                sourceCapabilityName: 'GitHub Copilot Metadata Authoring',
            },
            overridden: [
                {
                    relativePath: 'instructions/ai-metadata-agent.instructions.md',
                    sourcePath: '/tmp/root',
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRepo: '__metaflow_builtin__',
                    sourceCapabilityName: 'MetaFlow',
                },
            ],
            contenders: [
                {
                    relativePath: 'instructions/ai-metadata-agent.instructions.md',
                    sourcePath: '/tmp/root',
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRepo: '__metaflow_builtin__',
                    sourceCapabilityName: 'MetaFlow',
                },
                {
                    relativePath: 'instructions/ai-metadata-agent.instructions.md',
                    sourcePath: '/tmp/nested',
                    sourceLayer:
                        '__metaflow_builtin__/capabilities/metadata-authoring/github-copilot-metadata-authoring',
                    sourceRepo: '__metaflow_builtin__',
                    sourceCapabilityName: 'GitHub Copilot Metadata Authoring',
                },
            ],
        } as never);

        assert.strictEqual(suppressed, true);
    });

    test('does not suppress non-built-in surfaced file conflicts', () => {
        const { shouldSuppressBuiltInSurfacedFileConflictWarning } = loadCommandHandlers();

        const suppressed = shouldSuppressBuiltInSurfacedFileConflictWarning({
            relativePath: 'instructions/shared.instructions.md',
            winner: {
                relativePath: 'instructions/shared.instructions.md',
                sourcePath: '/tmp/primary',
                sourceLayer: 'primary/capabilities/project-management/planning',
                sourceRepo: 'primary',
                sourceCapabilityName: 'Planning',
            },
            overridden: [
                {
                    relativePath: 'instructions/shared.instructions.md',
                    sourcePath: '/tmp/builtin',
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRepo: '__metaflow_builtin__',
                    sourceCapabilityName: 'MetaFlow',
                },
            ],
            contenders: [
                {
                    relativePath: 'instructions/shared.instructions.md',
                    sourcePath: '/tmp/builtin',
                    sourceLayer: '__metaflow_builtin__/.',
                    sourceRepo: '__metaflow_builtin__',
                    sourceCapabilityName: 'MetaFlow',
                },
                {
                    relativePath: 'instructions/shared.instructions.md',
                    sourcePath: '/tmp/primary',
                    sourceLayer: 'primary/capabilities/project-management/planning',
                    sourceRepo: 'primary',
                    sourceCapabilityName: 'Planning',
                },
            ],
        } as never);

        assert.strictEqual(suppressed, false);
    });
});
