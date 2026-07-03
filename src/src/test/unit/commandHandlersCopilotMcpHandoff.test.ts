import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

suite('GitHub Copilot MCP handoff command helpers', () => {
    let tmpDir: string | undefined;

    teardown(() => {
        if (tmpDir) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            tmpDir = undefined;
        }
    });

    test('builds the same workspace MCP handoff used by CLI export', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-mcp-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const mcpPath = path.join(metadataRepo, 'company', 'core', '.metaflow', 'mcp');
        fs.mkdirSync(mcpPath, { recursive: true });
        fs.writeFileSync(
            path.join(mcpPath, 'github.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.mcpServer/v1',
                id: 'github',
                transport: 'stdio',
                invocation: {
                    command: 'github-mcp-server',
                    args: ['stdio'],
                },
                requiredSecrets: ['GITHUB_TOKEN'],
                policyGrants: ['github-pr-read'],
            }),
            'utf-8',
        );

        const { buildGitHubCopilotMcpHandoffForWorkspace } = loadCommandHandlers();
        const handoff = buildGitHubCopilotMcpHandoffForWorkspace(
            {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/core'],
                filters: { include: ['**'], exclude: [] },
            } as never,
            tmpDir,
        );

        assert.ok(handoff, 'Expected handoff metadata');
        assert.strictEqual(handoff.destination, '.vscode/mcp.json');
        assert.strictEqual(handoff.managed, false);
        assert.strictEqual(handoff.requiresOperatorReview, true);
        assert.deepStrictEqual(JSON.parse(handoff.content), {
            servers: {
                github: {
                    type: 'stdio',
                    command: 'github-mcp-server',
                    args: ['stdio'],
                },
            },
        });
        assert.ok(
            handoff.warnings.some((warning) =>
                warning.includes('Requires operator-provided secrets: GITHUB_TOKEN.'),
            ),
        );
    });
});
