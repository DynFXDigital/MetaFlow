/**
 * Diagnostics integration tests.
 *
 * Validates config diagnostics are published/cleared through refresh.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const INTEGRATION_STARTUP_TIMEOUT_MS = 90000;

suite('Diagnostics Integration', () => {
    let workspaceRoot: string;
    let configPath: string;
    let governancePath: string;

    suiteSetup(async function () {
        this.timeout(INTEGRATION_STARTUP_TIMEOUT_MS);

        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');

        workspaceRoot = ws!.uri.fsPath;
        configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        governancePath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
    });

    // Trace: TC-0329
    test('refresh publishes diagnostics when config is invalid', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: {},
                // Deliberately omit required localPath.
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const diagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');

            assert.ok(diagnostics.length > 0, 'Expected MetaFlow diagnostics for invalid config');
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    // Trace: TC-0330
    test('refresh clears diagnostics after config is fixed', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: {},
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const beforeFix = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');
            assert.ok(beforeFix.length > 0, 'Expected diagnostics before fixing config');

            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterFix = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');

            assert.strictEqual(
                afterFix.length,
                0,
                'Diagnostics should clear after valid config reload',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    // Trace: TC-0331
    test('getDiagnosticsSnapshot returns empty payload for a clean workspace', async function () {
        this.timeout(15000);

        await vscode.commands.executeCommand('metaflow.refresh');

        const snapshot = await vscode.commands.executeCommand<{
            capabilityWarnings: string[];
            configDiagnostics: Array<{
                file: string;
                message: string;
                severity: number;
                startLine: number;
                startColumn: number;
                source?: string;
            }>;
        }>('metaflow.getDiagnosticsSnapshot');

        assert.ok(snapshot, 'Command should return a payload');
        assert.ok(
            Array.isArray(snapshot.capabilityWarnings),
            'capabilityWarnings should be an array',
        );
        assert.ok(
            Array.isArray(snapshot.configDiagnostics),
            'configDiagnostics should be an array',
        );
        assert.strictEqual(
            snapshot.configDiagnostics.length,
            0,
            'Clean workspace should have no config diagnostics',
        );
    });

    test('metaflow_diagnostics language model tool is discoverable and returns snapshot payload', async function () {
        this.timeout(15000);

        await vscode.commands.executeCommand('metaflow.refresh');

        const tool = vscode.lm.tools.find((candidate) => candidate.name === 'metaflow_diagnostics');
        assert.ok(tool, 'Expected metaflow_diagnostics to be registered in vscode.lm.tools');
        assert.ok(
            tool.tags.includes('diagnostics'),
            'Expected diagnostics tag to help agents select the tool',
        );

        const result = await vscode.lm.invokeTool(
            'metaflow_diagnostics',
            {
                toolInvocationToken: undefined,
                input: { refresh: false },
            },
            new vscode.CancellationTokenSource().token,
        );

        const jsonPart = result.content.find(
            (part): part is vscode.LanguageModelDataPart =>
                part instanceof vscode.LanguageModelDataPart &&
                part.mimeType === 'application/json',
        );
        assert.ok(jsonPart, 'Expected tool result to include a JSON data part');

        const snapshot = JSON.parse(Buffer.from(jsonPart.data).toString('utf-8')) as {
            capabilityWarnings: unknown;
            configDiagnostics: unknown;
            governance: unknown;
            warnings: unknown;
        };

        assert.ok(Array.isArray(snapshot.capabilityWarnings));
        assert.ok(Array.isArray(snapshot.configDiagnostics));
        assert.ok(snapshot.governance && typeof snapshot.governance === 'object');
        assert.ok(Array.isArray(snapshot.warnings));
    });

    // Trace: TC-0332
    test('getDiagnosticsSnapshot parity — snapshot configDiagnostics matches Problems panel for invalid config', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: {},
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const panelDiagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((d) => d.source === 'MetaFlow');

            const snapshot = await vscode.commands.executeCommand<{
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    message: string;
                    severity: number;
                    startLine: number;
                    startColumn: number;
                    source?: string;
                }>;
            }>('metaflow.getDiagnosticsSnapshot');

            assert.ok(snapshot, 'Command should return a payload');
            const snapshotForConfig = snapshot.configDiagnostics.filter(
                (e) => e.file === vscode.Uri.file(configPath).fsPath,
            );

            assert.strictEqual(
                snapshotForConfig.length,
                panelDiagnostics.length,
                'Snapshot count must match Problems panel count',
            );

            for (let i = 0; i < panelDiagnostics.length; i++) {
                assert.strictEqual(snapshotForConfig[i].message, panelDiagnostics[i].message);
                assert.strictEqual(snapshotForConfig[i].severity, panelDiagnostics[i].severity);
                assert.strictEqual(
                    snapshotForConfig[i].startLine,
                    panelDiagnostics[i].range.start.line,
                );
                assert.strictEqual(
                    snapshotForConfig[i].startColumn,
                    panelDiagnostics[i].range.start.character,
                );
            }
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    // Trace: TC-0333
    test('getDiagnosticsSnapshot is mutation-free — repeated calls return the same data', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: {},
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            type SnapshotPayload = {
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    message: string;
                    severity: number;
                    startLine: number;
                    startColumn: number;
                    source?: string;
                }>;
            };

            const first = await vscode.commands.executeCommand<SnapshotPayload>(
                'metaflow.getDiagnosticsSnapshot',
            );
            const second = await vscode.commands.executeCommand<SnapshotPayload>(
                'metaflow.getDiagnosticsSnapshot',
            );

            assert.deepStrictEqual(
                first,
                second,
                'Repeated calls should return identical snapshot data',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh publishes enabled missing-layer warnings to Problems and diagnostics snapshot while retaining capability warnings', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const warningConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/missing-capability', enabled: true }],
                    },
                ],
                profiles: {
                    default: {
                        displayName: 'Default',
                        enable: ['**/*'],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, warningConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const diagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');

            assert.strictEqual(diagnostics.length, 1, 'Expected one enabled missing-layer warning');
            assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
            assert.strictEqual(diagnostics[0].code, 'LAYER_PATH_MISSING');
            assert.ok(
                diagnostics[0].message.includes('primary/standards/missing-capability'),
                `Expected repo/path in diagnostic message, got: ${diagnostics[0].message}`,
            );

            const snapshot = await vscode.commands.executeCommand<{
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    message: string;
                    severity: number;
                    startLine: number;
                    startColumn: number;
                    source?: string;
                    code?: string | number;
                }>;
            }>('metaflow.getDiagnosticsSnapshot');

            const snapshotWarnings = snapshot.configDiagnostics.filter(
                (entry) =>
                    entry.file === vscode.Uri.file(configPath).fsPath &&
                    entry.code === 'LAYER_PATH_MISSING',
            );

            assert.strictEqual(
                snapshotWarnings.length,
                1,
                'Diagnostics snapshot should include the enabled missing-layer warning',
            );
            assert.strictEqual(snapshotWarnings[0].message, diagnostics[0].message);
            assert.ok(
                snapshot.capabilityWarnings.includes(diagnostics[0].message),
                'Capability warnings should still carry the same warning for UI/status surfaces',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh publishes agent-plugin package errors to Problems and diagnostics snapshot', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const repoRoot = path.join(workspaceRoot, '.tmp-agent-plugin-diagnostics');
        const layerRoot = path.join(repoRoot, 'plugins', 'missing-package');
        fs.rmSync(repoRoot, { recursive: true, force: true });
        fs.mkdirSync(layerRoot, { recursive: true });
        fs.writeFileSync(
            path.join(layerRoot, 'CAPABILITY.md'),
            [
                '---',
                'name: Missing Package Plugin',
                'description: A capability missing plugin metadata.',
                'agentPlugin: true',
                '---',
            ].join('\n'),
            'utf-8',
        );

        const warningConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'plugin-diag',
                        localPath: '.tmp-agent-plugin-diagnostics',
                        enabled: true,
                    },
                ],
                layerSources: [
                    {
                        repoId: 'plugin-diag',
                        path: 'plugins/missing-package',
                        enabled: true,
                    },
                ],
                filters: { include: ['**/*'], exclude: [] },
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, warningConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const pluginJsonPath = path.join(layerRoot, 'plugin.json');
            const diagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(pluginJsonPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');

            assert.strictEqual(diagnostics.length, 1, 'Expected one agent-plugin manifest error');
            assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Error);
            assert.strictEqual(diagnostics[0].code, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING');

            const snapshot = await vscode.commands.executeCommand<{
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    message: string;
                    severity: number;
                    startLine: number;
                    startColumn: number;
                    source?: string;
                    code?: string | number;
                }>;
            }>('metaflow.getDiagnosticsSnapshot');

            const pluginDiagnostics = snapshot.configDiagnostics.filter(
                (entry) =>
                    entry.file === vscode.Uri.file(pluginJsonPath).fsPath &&
                    entry.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING',
            );

            assert.strictEqual(pluginDiagnostics.length, 1);
            assert.strictEqual(pluginDiagnostics[0].severity, vscode.DiagnosticSeverity.Error);
            assert.ok(
                snapshot.capabilityWarnings.some((warning) =>
                    warning.includes('CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING'),
                ),
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            fs.rmSync(repoRoot, { recursive: true, force: true });
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('metaflow_diagnostics tool text part includes warning details, not only counts', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const warningConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/missing-capability', enabled: true }],
                    },
                ],
                profiles: {
                    default: {
                        displayName: 'Default',
                        enable: ['**/*'],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, warningConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const result = await vscode.lm.invokeTool(
                'metaflow_diagnostics',
                {
                    toolInvocationToken: undefined,
                    input: { refresh: false },
                },
                new vscode.CancellationTokenSource().token,
            );

            const textPart = result.content.find(
                (part): part is vscode.LanguageModelTextPart =>
                    part instanceof vscode.LanguageModelTextPart,
            );
            assert.ok(textPart, 'Expected tool result to include a text part');
            assert.ok(
                textPart.value.includes('Warnings:'),
                'Expected warnings header in text part',
            );
            assert.ok(
                textPart.value.includes('primary/standards/missing-capability'),
                `Expected warning details in text part, got: ${textPart.value}`,
            );
            assert.ok(
                textPart.value.includes('Remediation:'),
                'Expected remediation guidance in text part',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh does not publish diagnostics for disabled missing-layer overrides', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const disabledWarningConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/missing-capability', enabled: false }],
                    },
                ],
                profiles: {
                    default: {
                        displayName: 'Default',
                        enable: ['**/*'],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, disabledWarningConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const diagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');

            assert.strictEqual(
                diagnostics.length,
                0,
                'Disabled missing-layer overrides should not publish config diagnostics',
            );

            const snapshot = await vscode.commands.executeCommand<{
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    code?: string | number;
                }>;
            }>('metaflow.getDiagnosticsSnapshot');

            assert.strictEqual(
                snapshot.configDiagnostics.filter((entry) => entry.code === 'LAYER_PATH_MISSING')
                    .length,
                0,
                'Diagnostics snapshot should stay clean for disabled missing-layer overrides',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh and profile switch update governance diagnostics and status snapshots', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/sdlc', enabled: true }],
                    },
                ],
                profiles: {
                    default: {
                        displayName: 'Default',
                        enable: ['**/*'],
                    },
                    review: {
                        displayName: 'Review',
                        enable: ['**/*'],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'warn',
                requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
                allowedProfiles: ['default'],
                lockedProfiles: ['default'],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');

            let governanceDiagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(governancePath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');
            assert.strictEqual(
                governanceDiagnostics.length,
                0,
                'The default profile should start governance-compliant',
            );

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'review',
            });

            governanceDiagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(governancePath))
                .filter((diagnostic) => diagnostic.source === 'MetaFlow');
            assert.strictEqual(
                governanceDiagnostics.length,
                1,
                'Switching to a disallowed profile should emit one governance diagnostic',
            );
            assert.strictEqual(
                governanceDiagnostics[0].code,
                'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
            );

            const snapshot = await vscode.commands.executeCommand<{
                capabilityWarnings: string[];
                configDiagnostics: Array<{
                    file: string;
                    message: string;
                    severity: number;
                    startLine: number;
                    startColumn: number;
                    source?: string;
                    code?: string | number;
                }>;
                governance: {
                    contractPath?: string;
                    validationErrors: Array<{ message: string; code?: string }>;
                    compliance?: {
                        status: 'not-applicable' | 'compliant' | 'non-compliant';
                        severity: 'warn' | 'error';
                        activeProfile?: string;
                        activeProfileLocked: boolean;
                        allowedProfiles: string[];
                        lockedProfiles: string[];
                        violations: Array<{ id: string; code: string; message: string }>;
                    };
                };
            }>('metaflow.getDiagnosticsSnapshot');

            assert.ok(snapshot, 'Snapshot command should return a payload');
            const governanceSnapshotDiagnostics = snapshot.configDiagnostics.filter(
                (entry) => entry.file === vscode.Uri.file(governancePath).fsPath,
            );
            assert.deepStrictEqual(
                governanceSnapshotDiagnostics.map((entry) => entry.code),
                ['GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review'],
            );
            assert.strictEqual(snapshot.governance.validationErrors.length, 0);
            assert.strictEqual(snapshot.governance.compliance?.status, 'non-compliant');
            assert.strictEqual(snapshot.governance.compliance?.severity, 'warn');
            assert.strictEqual(snapshot.governance.compliance?.activeProfile, 'review');
            assert.deepStrictEqual(snapshot.governance.compliance?.allowedProfiles, ['default']);
            assert.deepStrictEqual(snapshot.governance.compliance?.lockedProfiles, ['default']);
            assert.deepStrictEqual(
                snapshot.governance.compliance?.violations.map((violation) => violation.id),
                ['GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review'],
            );

            const statusLines = (await vscode.commands.executeCommand(
                'metaflow.status',
            )) as string[];
            assert.ok(
                statusLines.some((line) => line.includes('Governance: non-compliant')),
                'Status output should include the governance compliance summary',
            );
            assert.ok(
                statusLines.some((line) =>
                    line.includes('[GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review]'),
                ),
                'Status output should include the stable governance violation id',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });
});
