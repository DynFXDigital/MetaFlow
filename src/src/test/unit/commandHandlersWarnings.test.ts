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

suite('Command handler configured source warnings', () => {
    test('enabled missing layer path produces a diagnostic warning payload', () => {
        const { collectEnabledConfiguredSourceDiagnosticWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-missing-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            fs.mkdirSync(repoRoot, { recursive: true });

            const warnings = collectEnabledConfiguredSourceDiagnosticWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [{ repoId: 'primary', path: 'capabilities/ghost', enabled: true }],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, [
                {
                    code: 'LAYER_PATH_MISSING',
                    message:
                        '[LAYER_PATH_MISSING] Configured layer "primary/capabilities/ghost" does not exist or is not currently mounted.',
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
                    layerSources: [{ repoId: 'primary', path: 'capabilities/ghost', enabled: false }],
                } as never,
                workspaceRoot,
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
                    layerSources: [{ repoId: 'primary', path: 'capabilities/ghost', enabled: true }],
                } as never,
                workspaceRoot,
            );

            assert.deepStrictEqual(warnings, []);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('LAYER_PATH_EMPTY warning is emitted for stale empty configured layers', () => {
        const { collectConfiguredSourceWarnings } = loadCommandHandlers();
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-empty-layer-'));

        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'metadata');
            const layerRoot = path.join(repoRoot, 'capabilities', 'obsolete');
            fs.mkdirSync(layerRoot, { recursive: true });

            const warnings = collectConfiguredSourceWarnings(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
                    layerSources: [{ repoId: 'primary', path: 'capabilities/obsolete', enabled: true }],
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
});