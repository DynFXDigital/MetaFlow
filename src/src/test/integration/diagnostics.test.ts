/**
 * Diagnostics integration tests.
 *
 * Validates config diagnostics are published/cleared through refresh.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

suite('Diagnostics Integration', () => {
    let workspaceRoot: string;
    let configPath: string;

    suiteSetup(async function () {
        this.timeout(15000);

        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');

        workspaceRoot = ws!.uri.fsPath;
        configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
    });

    // Trace: TC-0329
    test('refresh publishes diagnostics when config is invalid', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: {
                    localPath: '.ai/ai-metadata',
                },
                // Deliberately omit required layers.
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
                metadataRepo: {
                    localPath: '.ai/ai-metadata',
                },
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
        assert.ok(Array.isArray(snapshot.capabilityWarnings), 'capabilityWarnings should be an array');
        assert.ok(Array.isArray(snapshot.configDiagnostics), 'configDiagnostics should be an array');
        assert.strictEqual(
            snapshot.configDiagnostics.length,
            0,
            'Clean workspace should have no config diagnostics',
        );
    });

    // Trace: TC-0332
    test('getDiagnosticsSnapshot parity — snapshot configDiagnostics matches Problems panel for invalid config', async function () {
        this.timeout(15000);

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const invalidConfig = JSON.stringify(
            {
                metadataRepo: { localPath: '.ai/ai-metadata' },
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
                metadataRepo: { localPath: '.ai/ai-metadata' },
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
});
