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
        assert.strictEqual(report.supportReference?.runtimeOnlyCount, 50);
        assert.ok(
            report.supportReference?.targets.some(
                (target) =>
                    target.target === 'codex' &&
                    target.runtimeOnlyCount === 34 &&
                    target.documentation === 'docs/CODEX-SUPPORT.md',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'agentRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'automationRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'authenticationRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'permissionRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'enterprisePolicyRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'appConnectorRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'cloudEnvironmentRuntime' &&
                    entry.support === 'runtime-only',
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
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'reviewRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'remoteConnectionRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'chronicleRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'appshotsRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'recordReplayRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'importRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'modelProviderRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'nonInteractiveRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'sdkRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'appServerRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'ideExtensionRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'windowsPlatformRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'linuxPlatformRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'macosPlatformRuntime' &&
                    entry.support === 'runtime-only',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'tools' &&
                    entry.documentation === 'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
            ),
        );
        assert.ok(
            report.entries.some(
                (entry) =>
                    entry.target === 'codex' &&
                    entry.concept === 'commandRules' &&
                    entry.support === 'partial',
            ),
        );
        assert.ok(
            content.entries.some(
                (entry: { target: string; concept: string; documentation: string }) =>
                    entry.target === 'codex' &&
                    entry.concept === 'packageManifests' &&
                    entry.documentation === 'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
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
        assert.match(document.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.strictEqual(document.adapterVersion, 'codex-v0.1');
        assert.strictEqual(document.runtimeOnlyCount, 34);
        assert.ok(
            document.fileBackedRows.some(
                (entry: { target: string; concept: string; support: string }) =>
                    entry.target === 'codex' &&
                    entry.concept === 'skills' &&
                    entry.support === 'supported',
            ),
        );
        assert.deepStrictEqual(
            document.runtimeOnlyRows.map((entry: { concept: string }) => entry.concept).sort(),
            [
                'agentRuntime',
                'appConnectorRuntime',
                'appServerRuntime',
                'appshotsRuntime',
                'authenticationRuntime',
                'automationRuntime',
                'browserRuntime',
                'chromeRuntime',
                'chronicleRuntime',
                'cloudEnvironmentRuntime',
                'computerUseRuntime',
                'enterprisePolicyRuntime',
                'evaluationRuntime',
                'ideExtensionRuntime',
                'importRuntime',
                'issuePrOperation',
                'linuxPlatformRuntime',
                'localCloudHandoff',
                'localEnvironmentRuntime',
                'macosPlatformRuntime',
                'memoryRuntime',
                'modelProviderRuntime',
                'nonInteractiveRuntime',
                'oauthMcpRuntime',
                'permissionRuntime',
                'pluginRuntime',
                'recordReplayRuntime',
                'remoteConnectionRuntime',
                'remoteMcpRuntime',
                'reviewRuntime',
                'sdkRuntime',
                'sideEffectMcpRuntime',
                'sitesRuntime',
                'windowsPlatformRuntime',
            ],
        );
        assert.ok(
            document.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Creating Codex Cloud environments'),
            ),
        );
        assert.ok(
            document.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Granting macOS Screen Recording'),
            ),
        );
        assert.ok(
            document.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Installing or launching the Codex IDE extension'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Cloud or channel delegation'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('macOS platform runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('App connector runtime'),
            ),
        );
        assert.deepStrictEqual(
            document.runtimeEvidenceChecklist
                .map((item: { concept: string }) => item.concept)
                .sort(),
            document.runtimeOnlyRows.map((entry: { concept: string }) => entry.concept).sort(),
        );
        assert.strictEqual(
            document.runtimeEvidenceCoverageSummary.totalRuntimeOnlyConcepts,
            document.runtimeOnlyCount,
        );
        assert.strictEqual(document.runtimeEvidenceCoverageSummary.conceptsWithEvidence, 0);
        assert.strictEqual(
            document.runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithoutDiagnostics,
            0,
        );
        assert.strictEqual(
            document.runtimeEvidenceCoverageSummary.conceptsWithEvidenceWithDiagnostics,
            0,
        );
        assert.deepStrictEqual(document.runtimeEvidenceCoverageSummary.diagnosticRecordsBySeverity, {
            error: 0,
            warning: 0,
            info: 0,
        });
        assert.deepStrictEqual(document.runtimeEvidenceCoverageSummary.diagnosticConceptsBySeverity, {
            error: 0,
            warning: 0,
            info: 0,
        });
        assert.deepStrictEqual(document.runtimeEvidenceCoverageSummary.conceptsWithErrorRecords, []);
        assert.deepStrictEqual(document.runtimeEvidenceWaiverSummary, {
            waivedConcepts: 0,
            waivedRecords: 0,
            notAchievableByRepositoryProjectionItems:
                document.notAchievableByRepositoryProjection.length,
            concepts: [],
            items: [],
        });
        assert.strictEqual(
            document.runtimeEvidenceCoverageSummary.conceptsWithoutEvidence,
            document.runtimeOnlyCount,
        );
        assert.ok(document.content.includes('## Runtime Evidence Review Queues'));
        assert.ok(document.content.includes('- Evidence without diagnostics: none'));
        assert.ok(document.content.includes('- Evidence with diagnostics: none'));
        assert.ok(
            document.runtimeEvidenceChecklist.some(
                (item: {
                    concept: string;
                    coverageStatus: string;
                    runtimeEvidenceExpected: string;
                    notAchievableByRepositoryProjection: string;
                }) =>
                    item.concept === 'issuePrOperation' &&
                    item.coverageStatus === 'missing' &&
                    item.runtimeEvidenceExpected.includes('representative operation') &&
                    item.notAchievableByRepositoryProjection
                        .toLowerCase()
                        .includes('repository metadata'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Agent runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Automation runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Authentication runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Permission runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Enterprise policy runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Review runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Remote connection runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Chronicle runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Appshots runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Record & Replay runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Import runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Model provider runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('IDE extension runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Windows platform runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Linux platform runtime'),
            ),
        );
        assert.ok(
            document.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Cloud environment runtime'),
            ),
        );
        assert.ok(document.content.includes('# Codex Support Boundaries'));
        assert.ok(document.content.includes('## Runtime-Only Codex Surfaces'));
        assert.ok(document.content.includes('## Runtime Evidence Waiver Summary'));
        assert.ok(document.content.includes('agentRuntime'));
        assert.ok(document.content.includes('automationRuntime'));
        assert.ok(document.content.includes('authenticationRuntime'));
        assert.ok(document.content.includes('permissionRuntime'));
        assert.ok(document.content.includes('reviewRuntime'));
        assert.ok(document.content.includes('remoteConnectionRuntime'));
        assert.ok(document.content.includes('chronicleRuntime'));
        assert.ok(document.content.includes('appshotsRuntime'));
        assert.ok(document.content.includes('recordReplayRuntime'));
        assert.ok(document.content.includes('importRuntime'));
        assert.ok(document.content.includes('modelProviderRuntime'));
        assert.ok(document.content.includes('nonInteractiveRuntime'));
        assert.ok(document.content.includes('sdkRuntime'));
        assert.ok(document.content.includes('appServerRuntime'));
        assert.ok(document.content.includes('ideExtensionRuntime'));
        assert.ok(document.content.includes('windowsPlatformRuntime'));
        assert.ok(document.content.includes('linuxPlatformRuntime'));
        assert.ok(document.content.includes('macosPlatformRuntime'));
        assert.ok(document.content.includes('localEnvironmentRuntime'));
        assert.ok(document.content.includes('appConnectorRuntime'));
        assert.ok(document.content.includes('cloudEnvironmentRuntime'));
        assert.ok(document.content.includes('localCloudHandoff'));
        assert.ok(document.content.includes('issuePrOperation'));
        assert.ok(document.content.includes('remoteMcpRuntime'));
        assert.ok(document.content.includes('oauthMcpRuntime'));
        assert.ok(document.content.includes('sideEffectMcpRuntime'));
        assert.ok(document.content.includes('memoryRuntime'));
        assert.ok(document.content.includes('evaluationRuntime'));
        assert.ok(document.content.includes('pluginRuntime'));
        assert.ok(document.content.includes('browserRuntime'));
        assert.ok(document.content.includes('chromeRuntime'));
        assert.ok(document.content.includes('computerUseRuntime'));
        assert.ok(document.content.includes('sitesRuntime'));
        assert.ok(document.content.includes('## Not Achievable By Repository Projection Alone'));
        assert.ok(document.content.includes('Creating Codex Cloud environments'));
        assert.ok(document.content.includes('Enabling Codex Memories'));
        assert.ok(document.content.includes('Enabling Chronicle'));
        assert.ok(document.content.includes('Creating Appshots'));
        assert.ok(document.content.includes('Recording UI actions'));
        assert.ok(document.content.includes('Launching the Codex import flow'));
        assert.ok(document.content.includes('Selecting active Codex model providers'));
        assert.ok(document.content.includes('Selecting native Windows sandbox implementation'));
        assert.ok(document.content.includes('Signing in users'));
        assert.ok(document.content.includes('Granting runtime permissions'));
        assert.ok(document.content.includes('MCP OAuth'));
        assert.deepStrictEqual(document.relatedGuides, [
            'docs/CODEX-SUPPORT.md',
            'docs/CODEX-OPERATOR-WALKTHROUGH.md',
            'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
            'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
        ]);
        assert.ok(document.content.includes('## Related Operator Guides'));
    });

    test('builds Codex support boundaries with workspace runtime evidence records', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-runtime-evidence-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const evidencePath = path.join(
            metadataRepo,
            'company',
            'core',
            '.metaflow',
            'runtime-evidence',
        );
        fs.mkdirSync(evidencePath, { recursive: true });
        fs.writeFileSync(
            path.join(evidencePath, 'codex-pr-review.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.runtimeEvidence/v1',
                id: 'codex-pr-review',
                target: 'codex',
                concepts: ['issuePrOperation', 'reviewRuntime'],
                harness: 'Codex Cloud',
                adapterVersion: 'codex-v0.1',
                scenario: 'Codex opens a draft pull request from an assigned issue.',
                status: 'partial',
                command: '@codex review',
                validatedAt: '2026-07-04T12:00:00Z',
                evidence: ['RUN-118'],
                evidenceArtifacts: [
                    {
                        kind: 'run',
                        ref: 'RUN-118',
                        description: 'Runtime evidence guide extension command run.',
                    },
                ],
                limitations: ['Slack delegation is not covered.'],
                policyGrants: ['github-pr-read'],
            }),
            'utf-8',
        );

        const {
            buildCodexRuntimeEvidenceGuideDocumentForWorkspace,
            buildCodexSupportBoundariesDocumentForWorkspace,
        } = loadCommandHandlers();
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
        } as never;
        const document = buildCodexSupportBoundariesDocumentForWorkspace(
            config,
            tmpDir,
        );

        const issueChecklist = document.runtimeEvidenceChecklist.find(
            (item) => item.concept === 'issuePrOperation',
        );
        assert.ok(issueChecklist, 'Expected issuePrOperation checklist row');
        assert.strictEqual(issueChecklist.coverageStatus, 'partial');
        assert.strictEqual(issueChecklist.runtimeEvidenceRecords.length, 1);
        assert.strictEqual(issueChecklist.runtimeEvidenceRecords[0].id, 'codex-pr-review');
        assert.strictEqual(issueChecklist.runtimeEvidenceRecords[0].status, 'partial');
        assert.strictEqual(
            document.runtimeEvidenceCoverageSummary.conceptsWithEvidence,
            2,
        );
        assert.ok(document.content.includes('codex-pr-review'));

        const guide = buildCodexRuntimeEvidenceGuideDocumentForWorkspace(
            config,
            tmpDir,
            ['issuePrOperation'],
        );
        assert.deepStrictEqual(guide.concepts[0].runtimeEvidenceRecordIds, [
            'codex-pr-review',
        ]);
        assert.ok(guide.content.includes('codex-pr-review'));
    });

    test('builds Codex runtime evidence review queue document for extension review', () => {
        const { buildCodexRuntimeEvidenceReviewQueueDocumentForExtension } =
            loadCommandHandlers();
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForExtension(
            'missing-evidence',
        );

        assert.strictEqual(
            document.generatedBy,
            'metaflow extension codex-runtime-evidence-review-queue',
        );
        assert.match(document.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.strictEqual(document.adapterVersion, 'codex-v0.1');
        assert.strictEqual(document.queue, 'missing-evidence');
        assert.strictEqual(document.concepts.length, 34);
        assert.ok(document.concepts.includes('issuePrOperation'));
        assert.ok(document.content.includes('# Codex Runtime Evidence Review Queue'));
        assert.ok(document.content.includes('Queue `missing-evidence`.'));
        assert.ok(document.content.includes('## Queue Summary'));
        assert.ok(document.content.includes('| missing-evidence | yes | 34 |'));
        assert.ok(document.content.includes('## Action Items'));
        assert.ok(document.content.includes('collect-runtime-evidence'));
        assert.ok(document.content.includes('## Concept Checklist'));
        assert.ok(document.content.includes('| issuePrOperation | missing | none recorded |'));
    });

    test('builds Codex waived runtime evidence review queue document for extension review', () => {
        const { buildCodexRuntimeEvidenceReviewQueueDocumentForExtension } =
            loadCommandHandlers();
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForExtension(
            'waived',
        );

        assert.strictEqual(document.queue, 'waived');
        assert.strictEqual(document.concepts.length, 0);
        assert.ok(document.content.includes('Queue `waived`.'));
        assert.ok(document.content.includes('- Waived evidence: none'));
        assert.ok(document.content.includes('- No runtime evidence actions match this queue.'));
        assert.ok(document.content.includes('| none | none | none | none |'));
    });

    test('builds Codex projection boundary review document for extension review', () => {
        const { buildCodexProjectionBoundaryDocumentForExtension } = loadCommandHandlers();
        const document = buildCodexProjectionBoundaryDocumentForExtension();

        assert.strictEqual(document.schemaVersion, 'metaflow.codexProjectionBoundary/v1');
        assert.strictEqual(
            document.generatedBy,
            'metaflow extension codex-projection-boundary-review',
        );
        assert.match(document.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.strictEqual(document.adapterVersion, 'codex-v0.1');
        assert.strictEqual(document.target, 'codex');
        assert.ok(document.summary.fileBackedRows > 0);
        assert.strictEqual(document.summary.runtimeOnlyRows, 34);
        assert.ok(document.summary.notAchievableItems > 0);
        assert.ok(
            document.fileBackedSurfaces.some(
                (entry) => entry.concept === 'skills' && entry.support === 'supported',
            ),
        );
        assert.ok(
            document.runtimeOnlySurfaces.some(
                (entry) =>
                    entry.concept === 'issuePrOperation' &&
                    entry.boundary.includes('Issue, PR, and review operation'),
            ),
        );
        assert.ok(
            document.notAchievableByRepositoryProjection.some((item) =>
                item.includes('Installing or launching the Codex IDE extension'),
            ),
        );
        assert.ok(document.content.includes('# Codex Repository Projection Boundary Review'));
        assert.ok(document.content.includes('## Runtime-Only Surfaces'));
        assert.ok(document.content.includes('## Not Achievable By Repository Projection Alone'));
    });

    test('builds Codex runtime evidence review queue document with workspace evidence', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-runtime-queue-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const evidencePath = path.join(
            metadataRepo,
            'company',
            'core',
            '.metaflow',
            'runtime-evidence',
        );
        fs.mkdirSync(evidencePath, { recursive: true });
        fs.writeFileSync(
            path.join(evidencePath, 'codex-pr-review.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.runtimeEvidence/v1',
                id: 'codex-pr-review',
                target: 'codex',
                concepts: ['issuePrOperation'],
                harness: 'Codex Cloud',
                adapterVersion: 'codex-v0.1',
                scenario: 'Codex reviews a pull request.',
                status: 'passed',
                evidence: ['RUN-122'],
                evidenceArtifacts: [
                    {
                        kind: 'run',
                        ref: 'RUN-122',
                        description: 'Representative Codex review run.',
                    },
                ],
            }),
            'utf-8',
        );

        const { buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace } =
            loadCommandHandlers();
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
        } as never;
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace(
            config,
            tmpDir,
            'all',
        );

        assert.strictEqual(document.queue, 'all');
        assert.ok(document.content.includes('Evidence without diagnostics: issuePrOperation'));
        assert.ok(document.content.includes('| issuePrOperation | passed | codex-pr-review (passed) |'));
        assert.ok(document.content.includes('| missing-evidence | yes | 33 |'));
    });

    test('builds Codex expired runtime evidence review queue document with workspace evidence', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-expired-queue-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const evidencePath = path.join(
            metadataRepo,
            'company',
            'core',
            '.metaflow',
            'runtime-evidence',
        );
        fs.mkdirSync(evidencePath, { recursive: true });
        fs.writeFileSync(
            path.join(evidencePath, 'codex-review-expired.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.runtimeEvidence/v1',
                id: 'codex-review-expired',
                target: 'codex',
                concepts: ['reviewRuntime'],
                harness: 'Codex Cloud',
                adapterVersion: 'codex-v0.1',
                scenario: 'Codex review evidence requires refresh.',
                status: 'partial',
                evidence: ['RUN-099'],
                evidenceArtifacts: [
                    {
                        kind: 'run',
                        ref: 'RUN-099',
                        description: 'Expired runtime evidence proof.',
                    },
                ],
                expiresAt: '2000-01-01T00:00:00Z',
            }),
            'utf-8',
        );

        const { buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace } =
            loadCommandHandlers();
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
        } as never;
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace(
            config,
            tmpDir,
            'expired-evidence',
        );

        assert.strictEqual(document.queue, 'expired-evidence');
        assert.deepStrictEqual(document.concepts, ['reviewRuntime']);
        assert.ok(document.content.includes('- Expired evidence: reviewRuntime'));
        assert.ok(document.content.includes('| reviewRuntime | partial | codex-review-expired (partial) |'));
    });

    test('builds Codex partial runtime evidence review queue document with workspace evidence', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-partial-queue-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const evidencePath = path.join(
            metadataRepo,
            'company',
            'core',
            '.metaflow',
            'runtime-evidence',
        );
        fs.mkdirSync(evidencePath, { recursive: true });
        fs.writeFileSync(
            path.join(evidencePath, 'codex-review-partial.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.runtimeEvidence/v1',
                id: 'codex-review-partial',
                target: 'codex',
                concepts: ['reviewRuntime'],
                harness: 'Codex review',
                adapterVersion: 'codex-v0.1',
                scenario: 'Codex review completed without proving hosted review posting.',
                status: 'partial',
                evidence: ['RUN-160'],
                evidenceArtifacts: [
                    {
                        kind: 'run',
                        ref: 'RUN-160',
                        description: 'Partial runtime evidence proof.',
                    },
                ],
            }),
            'utf-8',
        );

        const { buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace } =
            loadCommandHandlers();
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
        } as never;
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace(
            config,
            tmpDir,
            'partial',
        );

        assert.strictEqual(document.queue, 'partial');
        assert.deepStrictEqual(document.concepts, ['reviewRuntime']);
        assert.ok(document.content.includes('- Partial evidence: reviewRuntime'));
        assert.ok(
            document.content.includes(
                '- review-partial-runtime-evidence (advisory): Review reviewRuntime partial evidence records: codex-review-partial (partial).',
            ),
        );
        assert.ok(document.content.includes('| reviewRuntime | partial | codex-review-partial (partial) |'));
    });

    test('builds Codex stale-adapter runtime evidence review queue document with workspace evidence', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-stale-adapter-queue-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const evidencePath = path.join(
            metadataRepo,
            'company',
            'core',
            '.metaflow',
            'runtime-evidence',
        );
        fs.mkdirSync(evidencePath, { recursive: true });
        fs.writeFileSync(
            path.join(evidencePath, 'codex-review-stale-adapter.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.runtimeEvidence/v1',
                id: 'codex-review-stale-adapter',
                target: 'codex',
                concepts: ['reviewRuntime'],
                harness: 'Codex Cloud',
                adapterVersion: 'codex-v0.0',
                scenario: 'Codex review evidence was captured against an older adapter.',
                status: 'partial',
                evidence: ['RUN-098'],
                evidenceArtifacts: [
                    {
                        kind: 'run',
                        ref: 'RUN-098',
                        description: 'Stale adapter runtime evidence proof.',
                    },
                ],
            }),
            'utf-8',
        );

        const { buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace } =
            loadCommandHandlers();
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
        } as never;
        const document = buildCodexRuntimeEvidenceReviewQueueDocumentForWorkspace(
            config,
            tmpDir,
            'stale-adapter-version',
        );

        assert.strictEqual(document.queue, 'stale-adapter-version');
        assert.deepStrictEqual(document.concepts, ['reviewRuntime']);
        assert.ok(document.content.includes('- Stale adapter version evidence: reviewRuntime'));
        assert.ok(document.content.includes('| reviewRuntime | partial | codex-review-stale-adapter (partial) |'));
    });

    test('builds Codex runtime evidence guide document for extension review', () => {
        const { buildCodexRuntimeEvidenceGuideDocumentForExtension } = loadCommandHandlers();
        const document = buildCodexRuntimeEvidenceGuideDocumentForExtension([
            'issuePrOperation',
        ]);

        assert.strictEqual(
            document.generatedBy,
            'metaflow extension codex-runtime-evidence-guide',
        );
        assert.strictEqual(document.schemaVersion, 'metaflow.runtimeEvidenceGuide/v1');
        assert.strictEqual(document.adapterVersion, 'codex-v0.1');
        assert.strictEqual(document.target, 'codex');
        assert.strictEqual(document.concepts.length, 1);
        assert.strictEqual(document.concepts[0].concept, 'issuePrOperation');
        assert.strictEqual(
            document.concepts[0].suggestedScaffoldPath,
            '.metaflow/runtime-evidence/codex-issue-pr-operation.json',
        );
        assert.ok(document.concepts[0].nativeSurfaces.includes('Codex GitHub integration'));
        assert.ok(document.concepts[0].collectionChecklist.length > 0);
        assert.ok(document.content.includes('# Codex Runtime Evidence Guide'));
        assert.ok(document.content.includes('## issuePrOperation'));
        assert.ok(document.content.includes('Evidence collection checklist:'));
    });

    test('builds Codex runtime evidence template document for extension review', () => {
        const { buildCodexRuntimeEvidenceTemplateDocumentForExtension } = loadCommandHandlers();
        const document = buildCodexRuntimeEvidenceTemplateDocumentForExtension([
            'issuePrOperation',
        ]);

        assert.strictEqual(
            document.generatedBy,
            'metaflow extension codex-runtime-evidence-template',
        );
        assert.strictEqual(document.schemaVersion, 'metaflow.runtimeEvidenceTemplate/v1');
        assert.strictEqual(document.adapterVersion, 'codex-v0.1');
        assert.strictEqual(document.target, 'codex');
        assert.strictEqual(document.source, 'runtimeEvidenceChecklist');
        assert.deepStrictEqual(document.filters?.concepts, ['issuePrOperation']);
        assert.strictEqual(document.records.length, 1);
        assert.strictEqual(
            document.records[0].suggestedPath,
            '.metaflow/runtime-evidence/codex-issue-pr-operation.json',
        );
        assert.strictEqual(document.records[0].content.id, 'codex-issue-pr-operation');
        assert.deepStrictEqual(document.records[0].content.concepts, ['issuePrOperation']);
        assert.strictEqual(document.records[0].content.status, 'not-run');
        assert.ok(document.records[0].content.harness.includes('Codex GitHub integration'));
    });

    test('writes Codex runtime evidence template records with overwrite protection', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-codex-evidence-'));
        const {
            buildCodexRuntimeEvidenceTemplateDocumentForExtension,
            resolveCodexRuntimeEvidenceTemplateDestination,
            writeCodexRuntimeEvidenceTemplateRecords,
        } = loadCommandHandlers();
        const document = buildCodexRuntimeEvidenceTemplateDocumentForExtension([
            'issuePrOperation',
        ]);
        const destinationPath = resolveCodexRuntimeEvidenceTemplateDestination(
            tmpDir,
            document.records[0],
        );

        const firstWrite = await writeCodexRuntimeEvidenceTemplateRecords(tmpDir, document);
        assert.deepStrictEqual(
            {
                written: firstWrite[0].written,
                existed: firstWrite[0].existed,
                suggestedPath: firstWrite[0].suggestedPath,
            },
            {
                written: true,
                existed: false,
                suggestedPath: '.metaflow/runtime-evidence/codex-issue-pr-operation.json',
            },
        );
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(destinationPath, 'utf-8')), {
            ...document.records[0].content,
        });

        fs.writeFileSync(destinationPath, 'local edits\n', 'utf-8');
        const blockedWrite = await writeCodexRuntimeEvidenceTemplateRecords(tmpDir, document);
        assert.deepStrictEqual(
            { written: blockedWrite[0].written, existed: blockedWrite[0].existed },
            { written: false, existed: true },
        );
        assert.strictEqual(fs.readFileSync(destinationPath, 'utf-8'), 'local edits\n');

        const overwriteWrite = await writeCodexRuntimeEvidenceTemplateRecords(
            tmpDir,
            document,
            { overwrite: true },
        );
        assert.deepStrictEqual(
            { written: overwriteWrite[0].written, existed: overwriteWrite[0].existed },
            { written: true, existed: true },
        );
        assert.deepStrictEqual(
            JSON.parse(fs.readFileSync(destinationPath, 'utf-8')),
            document.records[0].content,
        );
    });

    test('rejects Codex runtime evidence template destinations outside the workspace', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-codex-evidence-boundary-'));
        const { resolveCodexRuntimeEvidenceTemplateDestination } = loadCommandHandlers();
        const record = {
            suggestedPath: '../codex-evidence.json',
            content: {
                schemaVersion: 'metaflow.runtimeEvidence/v1' as const,
                id: 'codex-evidence',
                target: 'codex' as const,
                concepts: ['issuePrOperation' as const],
                harness: 'Codex',
                adapterVersion: 'codex-v0.1',
                scenario: 'Boundary check.',
                status: 'not-run' as const,
                command: 'none',
                evidence: [],
                evidenceArtifacts: [],
                limitations: [],
                policyGrants: [],
                description: 'Boundary check.',
            },
        };

        assert.throws(
            () => resolveCodexRuntimeEvidenceTemplateDestination(tmpDir!, record),
            /outside the workspace/,
        );
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
                        concepts: ['packageManifests'],
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
                concepts: ['packageManifests'],
                harness: 'Codex CLI',
                adapterVersion: 'codex-v0.1',
                scenario: 'Generated package appears in local marketplace.',
                status: 'passed',
                evidence: ['RUN-056'],
                evidenceArtifacts: [],
                limitations: ['Cloud package installation is runtime-only.'],
            },
        ]);
        assert.ok(
            content.warnings.some((warning: string) =>
                warning.includes('PACKAGE_MARKETPLACE_CODEX_PLUGIN_MANIFEST_MISSING'),
            ),
        );
    });

    test('builds migration suggestions report content for extension review', () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-vscode-migration-'));
        const metadataRepo = path.join(tmpDir, '.ai', 'ai-metadata');
        const layerPath = path.join(metadataRepo, 'company', 'core');
        fs.mkdirSync(path.join(layerPath, '.agents', 'skills', 'release-readiness'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(layerPath, '.metaflow', 'skills', 'release-readiness'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(layerPath, '.agents', 'skills', 'release-readiness', 'SKILL.md'),
            '# Release Readiness\nCheck release readiness.',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(layerPath, '.metaflow', 'skills', 'release-readiness', 'SKILL.md'),
            '# Release Readiness\nCheck release readiness.',
            'utf-8',
        );

        const { buildMigrationSuggestionsReportForExtension } = loadCommandHandlers();
        const report = buildMigrationSuggestionsReportForExtension(
            {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/core'],
                filters: { include: ['**'], exclude: [] },
            } as never,
            tmpDir,
        );
        const content = JSON.parse(report.content);

        assert.strictEqual(report.generatedBy, 'metaflow extension migration-suggestions');
        assert.strictEqual(report.managed, false);
        assert.strictEqual(report.writesFiles, false);
        assert.strictEqual(report.summary.suggestions, 1);
        assert.strictEqual(report.summary.duplicates, 1);
        assert.strictEqual(content.suggestions[0].action, 'review-duplicate');
        assert.strictEqual(
            content.suggestions[0].canonicalPath,
            '.metaflow/skills/release-readiness/SKILL.md',
        );
        assert.ok(report.markdown.includes('MetaFlow Migration Suggestions'));
        assert.ok(
            content.warnings[0].includes(
                '.agents/skills/release-readiness/SKILL.md maps to .metaflow/skills/release-readiness/SKILL.md',
            ),
        );
    });
});
