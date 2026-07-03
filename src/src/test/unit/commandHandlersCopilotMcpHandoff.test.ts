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

    test('writes handoff content only when overwrite policy allows it', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-mcp-write-'));
        const {
            resolveGitHubCopilotMcpHandoffDestination,
            writeGitHubCopilotMcpHandoff,
        } = loadCommandHandlers();
        const handoff = {
            target: 'github-copilot' as const,
            destination: '.vscode/mcp.json',
            format: 'vscode-mcp-json' as const,
            managed: false as const,
            requiresOperatorReview: true as const,
            servers: [],
            content: '{\n  "servers": {}\n}\n',
            warnings: [],
        };

        const destinationPath = resolveGitHubCopilotMcpHandoffDestination(tmpDir, handoff);
        assert.strictEqual(destinationPath, path.join(tmpDir, '.vscode', 'mcp.json'));

        const firstWrite = await writeGitHubCopilotMcpHandoff(tmpDir, handoff);
        assert.deepStrictEqual(
            { written: firstWrite.written, existed: firstWrite.existed },
            { written: true, existed: false },
        );
        assert.strictEqual(fs.readFileSync(destinationPath, 'utf-8'), handoff.content);

        fs.writeFileSync(destinationPath, 'local edits\n', 'utf-8');
        const blockedWrite = await writeGitHubCopilotMcpHandoff(tmpDir, handoff);
        assert.deepStrictEqual(
            { written: blockedWrite.written, existed: blockedWrite.existed },
            { written: false, existed: true },
        );
        assert.strictEqual(fs.readFileSync(destinationPath, 'utf-8'), 'local edits\n');

        const overwriteWrite = await writeGitHubCopilotMcpHandoff(tmpDir, handoff, {
            overwrite: true,
        });
        assert.deepStrictEqual(
            { written: overwriteWrite.written, existed: overwriteWrite.existed },
            { written: true, existed: true },
        );
        assert.strictEqual(fs.readFileSync(destinationPath, 'utf-8'), handoff.content);
    });

    test('rejects handoff destinations outside the workspace', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-mcp-boundary-'));
        const { resolveGitHubCopilotMcpHandoffDestination } = loadCommandHandlers();
        const handoff = {
            target: 'github-copilot' as const,
            destination: '../mcp.json',
            format: 'vscode-mcp-json' as const,
            managed: false as const,
            requiresOperatorReview: true as const,
            servers: [],
            content: '{}\n',
            warnings: [],
        };

        assert.throws(
            () => resolveGitHubCopilotMcpHandoffDestination(tmpDir!, handoff),
            /outside the workspace/,
        );
    });

    test('builds target support report content for extension review', () => {
        const { buildTargetSupportReportForExtension } = loadCommandHandlers();
        const report = buildTargetSupportReportForExtension();
        const content = JSON.parse(report.content);

        assert.strictEqual(report.generatedBy, 'metaflow extension target-support');
        assert.strictEqual(content.generatedBy, report.generatedBy);
        assert.strictEqual(content.summary.entries, report.summary.entries);
        assert.ok(report.summary.targets.codex > 0);
        assert.ok(report.summary.targets['github-copilot'] > 0);
        assert.strictEqual(report.supportReference?.runtimeOnlyCount, 4);
        assert.ok(
            report.supportReference?.targets.some(
                (target) =>
                    target.target === 'codex' &&
                    target.runtimeOnlyCount === 2 &&
                    target.documentation === 'docs/CODEX-SUPPORT.md',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'issuePrOperation' &&
                    entry.support === 'runtime-only',
            ),
        );
    });

    test('builds Codex support boundaries markdown for extension review', () => {
        const { buildCodexSupportBoundariesDocumentForExtension } = loadCommandHandlers();
        const document = buildCodexSupportBoundariesDocumentForExtension();

        assert.strictEqual(
            document.generatedBy,
            'metaflow extension codex-support-boundaries',
        );
        assert.strictEqual(document.runtimeOnlyCount, 2);
        assert.ok(document.content.includes('# Codex Support Boundaries'));
        assert.ok(document.content.includes('## Runtime-Only Codex Surfaces'));
        assert.ok(document.content.includes('localCloudHandoff'));
        assert.ok(document.content.includes('issuePrOperation'));
        assert.ok(document.content.includes('## Not Achievable By Repository Projection Alone'));
        assert.ok(document.content.includes('Creating Codex Cloud environments'));
        assert.ok(document.content.includes('MCP OAuth'));
        assert.deepStrictEqual(document.relatedGuides, [
            'docs/CODEX-SUPPORT.md',
            'docs/CODEX-OPERATOR-WALKTHROUGH.md',
            'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
            'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
        ]);
        assert.ok(document.content.includes('## Related Operator Guides'));
    });

    test('builds package marketplace report content for extension review', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-package-marketplace-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const packagePath = path.join(metadataRepo, 'company', 'core', '.metaflow', 'packages');
        fs.mkdirSync(packagePath, { recursive: true });
        fs.writeFileSync(
            path.join(packagePath, 'release-operations.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.package/v1',
                id: 'release-operations',
                name: 'Release Operations',
                kind: 'agent-plugin',
                marketplaceEntries: [
                    {
                        target: 'codex',
                        packageName: 'release-operations',
                        title: 'Release Operations',
                        summary: 'Release workflow package.',
                        publisher: 'DynFX',
                        categories: ['release'],
                        keywords: ['codex', 'automation'],
                    },
                    {
                        target: 'github-copilot',
                        packageName: 'release-operations',
                        title: 'Release Operations',
                        summary: 'Release workflow package.',
                        categories: ['release'],
                        keywords: ['copilot'],
                    },
                ],
                runtimeValidation: [
                    {
                        target: 'codex',
                        harness: 'Codex CLI',
                        adapterVersion: 'codex-v0.1',
                        scenario: 'Generated package appears in local marketplace.',
                        status: 'passed',
                        evidence: ['RUN-056'],
                        limitations: ['Cloud package installation is runtime-only.'],
                    },
                ],
            }),
            'utf-8',
        );

        const { buildPackageMarketplaceReportForExtension } = loadCommandHandlers();
        const report = buildPackageMarketplaceReportForExtension(
            {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/core'],
                filters: { include: ['**'], exclude: [] },
            } as never,
            tmpDir,
        );
        const content = JSON.parse(report.content);

        assert.strictEqual(report.generatedBy, 'metaflow extension package-marketplace');
        assert.strictEqual(report.managed, false);
        assert.strictEqual(report.requiresOperatorReview, true);
        assert.deepStrictEqual(report.summary.targets, { codex: 1, 'github-copilot': 1 });
        assert.strictEqual(content.summary.entries, 2);
        assert.strictEqual(
            content.marketplaces.codex[0].packageName,
            'release-operations',
        );
        assert.deepStrictEqual(content.hostPayloads.codex.plugins, [
            {
                name: 'release-operations',
                source: {
                    source: 'local',
                    path: './.ai/ai-metadata/company/core',
                },
                policy: {
                    installation: 'AVAILABLE',
                    authentication: 'ON_INSTALL',
                },
                category: 'release',
                interface: {
                    displayName: 'Release Operations',
                    description: 'Release workflow package.',
                },
            },
        ]);
        assert.deepStrictEqual(content.hostPayloads.githubCopilot.plugins, [
            {
                name: 'release-operations',
                source: './.ai/ai-metadata/company/core',
                description: 'Release workflow package.',
            },
        ]);
        assert.deepStrictEqual(content.entries[0].runtimeValidation, [
            {
                target: 'codex',
                harness: 'Codex CLI',
                adapterVersion: 'codex-v0.1',
                scenario: 'Generated package appears in local marketplace.',
                status: 'passed',
                evidence: ['RUN-056'],
                limitations: ['Cloud package installation is runtime-only.'],
            },
        ]);
    });
});
