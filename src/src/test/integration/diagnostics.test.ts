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

        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow');
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
        const invalidConfig = JSON.stringify({
            metadataRepo: {
                localPath: '.ai/ai-metadata',
            },
            // Deliberately omit required layers.
        }, null, 2);

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const diagnostics = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter(diagnostic => diagnostic.source === 'MetaFlow');

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
        const invalidConfig = JSON.stringify({
            metadataRepo: {
                localPath: '.ai/ai-metadata',
            },
        }, null, 2);

        try {
            fs.writeFileSync(configPath, invalidConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const beforeFix = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter(diagnostic => diagnostic.source === 'MetaFlow');
            assert.ok(beforeFix.length > 0, 'Expected diagnostics before fixing config');

            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterFix = vscode.languages
                .getDiagnostics(vscode.Uri.file(configPath))
                .filter(diagnostic => diagnostic.source === 'MetaFlow');

            assert.strictEqual(afterFix.length, 0, 'Diagnostics should clear after valid config reload');
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });
});
